/**
 * Click and keypress breadcrumbs (`ui.*`). Sentry's message is the element as a
 * selector, ancestors first: `tr.row > td.px-5.truncate[title="<cell text>"]`,
 * with the values of `aria-label`, `title` and `alt` written in unescaped. Those
 * values are what staff read on screen (a member's name, a chat message).
 *
 * Nothing here finds where a value ends; that cannot be done (Sentry does not
 * escape it). The selector is rebuilt from the clicked element itself, which
 * Sentry passes in the hint, reading only the tag, the classes and the `type` /
 * `name` attributes; an id is written as `#[id]` (ids can be built from data).
 * Without the element there is nothing safe to keep: the message is redacted
 * whole (the hook in ./scrub decides that).
 *
 * The event pass sees breadcrumbs this hook already rebuilt. It keeps a message
 * only when the whole of it fits the rebuilt grammar:
 *
 *   selector := element (" > " element)*
 *   element  := tag ("#[id]")? ("." class)* ("[type|name=" word "]")*
 *   tag      := a known HTML or SVG tag, a custom element (`x-foo`), or `unknown`
 *
 * The element order and the 5-node and 80-character limits follow @sentry/core
 * 10.75.2 `htmlTreeAsString`.
 * src: real @sentry/browser 10.75.2 output, see tests/observability/click-breadcrumbs.probe.ts
 */

const KNOWN_TAGS = new Set(
  (
    "a abbr address article aside audio b blockquote body button canvas caption circle code col colgroup " +
    "dd details dialog div dl dt em fieldset figcaption figure footer form g h1 h2 h3 h4 h5 h6 header hr " +
    "html i iframe img input kbd label legend li line main mark menu meter nav ol optgroup option output " +
    "p path picture polygon polyline pre progress rect s section select slot small source span strong " +
    "sub summary sup svg table tbody td template textarea tfoot th thead time tr u ul use video unknown"
  ).split(" "),
);
const CUSTOM_ELEMENT = /^[a-z][a-z0-9]*-[a-z0-9-]{1,40}$/;

const TAG = /[a-z][a-z0-9-]{0,40}/y;
const ID = /#\[id\]/y;
/** A class, Tailwind variants and arbitrary values included (`hover:bg-x`, `w-1/2`, `[&_svg]:size-4`). */
const CLASS = /\.(?:[\w:/!-]|\[[^\]\s"'@%<>[]{1,60}\])+/y;
const KEPT_ATTRIBUTE = /\[(?:type|name)="[A-Za-z0-9_-]{1,40}"\]/y;
const SEPARATOR = / > /y;

const TAG_VALUE = /^[a-z][a-z0-9-]{0,40}$/;
const COMPONENT_VALUE = /^[A-Z][A-Za-z0-9_$]{0,80}$/;
const CLASS_VALUE = /^(?:[\w:/!.-]|\[[^\]\s"'@%<>[]{1,60}\])+$/;
const ATTRIBUTE_VALUE = /^[A-Za-z0-9_-]{1,40}$/;
const KEPT_ATTRIBUTES = ["type", "name"] as const;
const MAX_MESSAGE_LENGTH = 32_768;

const isTag = (tag: string) => KNOWN_TAGS.has(tag) || CUSTOM_ELEMENT.test(tag);

/** True when the whole message is a selector this module rebuilt (nothing else fits). */
export function isRebuiltSelector(message: string): boolean {
  if (message.length > MAX_MESSAGE_LENGTH) return false;
  let position = 0;
  const take = (pattern: RegExp): string | undefined => {
    pattern.lastIndex = position;
    const match = pattern.exec(message);
    if (!match) return undefined;
    position = pattern.lastIndex;
    return match[0];
  };
  for (;;) {
    const tag = take(TAG);
    if (tag === undefined || !isTag(tag)) return false;
    take(ID);
    while (take(CLASS) !== undefined);
    while (take(KEPT_ATTRIBUTE) !== undefined);
    if (position === message.length) return true;
    if (take(SEPARATOR) === undefined) return false;
  }
}

interface ElementLike {
  tagName?: unknown;
  id?: unknown;
  className?: unknown;
  getAttribute?: unknown;
  parentNode?: unknown;
}

function isElement(value: unknown): value is ElementLike & { tagName: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ElementLike).tagName === "string" &&
    typeof (value as ElementLike).getAttribute === "function"
  );
}

function elementPart(node: ElementLike & { tagName: string }): string {
  const tag = node.tagName.toLowerCase();
  let part = TAG_VALUE.test(tag) && isTag(tag) ? tag : "unknown";
  if (typeof node.id === "string" && node.id !== "") part += "#[id]";
  if (typeof node.className === "string") {
    for (const name of node.className.split(/\s+/)) {
      if (CLASS_VALUE.test(name)) part += `.${name}`;
    }
  }
  const getAttribute = node.getAttribute as (name: string) => unknown;
  for (const attribute of KEPT_ATTRIBUTES) {
    const value = getAttribute.call(node, attribute);
    if (typeof value === "string" && ATTRIBUTE_VALUE.test(value)) {
      part += `[${attribute}="${value}"]`;
    }
  }
  return part;
}

/** The selector rebuilt from the clicked element, or undefined when there is no element. */
export function selectorFromElement(target: unknown): string | undefined {
  const parts: string[] = [];
  let length = 0;
  let node: unknown = target;
  for (let height = 1; isElement(node) && height <= 5; height++) {
    const part = elementPart(node);
    if (part === "html" || (height > 1 && length + parts.length * 3 + part.length >= 80)) break;
    parts.push(part);
    length += part.length;
    node = node.parentNode;
  }
  return parts.length > 0 ? parts.reverse().join(" > ") : undefined;
}

/** The DOM event (or element) Sentry passes as the breadcrumb hint, as an element. */
export function hintTarget(hint: unknown): unknown {
  const event = (hint as { event?: unknown } | undefined)?.event;
  if (typeof event === "object" && event !== null && "target" in event) {
    return (event as { target?: unknown }).target;
  }
  return event;
}

/** `ui.component_name` is the only breadcrumb data Sentry's DOM breadcrumbs carry. */
export function uiData(data: unknown): Record<string, unknown> | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const name = (data as Record<string, unknown>)["ui.component_name"];
  return typeof name === "string" && COMPONENT_VALUE.test(name)
    ? { "ui.component_name": name }
    : undefined;
}
