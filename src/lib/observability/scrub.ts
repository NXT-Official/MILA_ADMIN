import { isNotFound, isRedirect } from "@tanstack/react-router";
import { redactEmails } from "./scrub-email";
import {
  ERROR_TEXT_KEYS,
  type FieldAction,
  MEMBER_FIELD_KEYS,
  USER_INPUT_KEYS,
  errorSignal,
  fieldAction,
  isDataKey,
  isDebugKey,
  isErrorClassName,
  isErrorContainerKey,
  isErrorShaped,
  isIdentifyingKey,
  isSecretKey,
  isStructuralKey,
  normalizeKey,
  redactedMarker,
} from "./scrub-keys";
import { hintTarget, isRebuiltSelector, selectorFromElement, uiData } from "./scrub-ui";

/**
 * Redaction for everything that leaves the staff suite for Sentry: error events,
 * transactions (and their spans), breadcrumbs and logs. Runs in every
 * `beforeSend*` hook on both the browser and the server.
 *
 * The rule: member personal data never reaches Sentry; error text, stacks, codes,
 * routes, statuses and Sentry's own ids stay readable. When in doubt, redact.
 *
 * - Structured data (event `extra`, custom contexts, tags, log attributes,
 *   breadcrumb `data`, span `data`, `toJSON` results, Map/Set/array contents and
 *   JSON found inside any text) is kept on a key ALLOWLIST (./scrub-keys): a
 *   value survives only under a debug key and in that key's shape. Any other
 *   string becomes `[redacted]` (with its length only when long and not a
 *   member field); numbers stay unless phone-shaped. A key that is itself
 *   member text (a name, a handle) becomes `[key]`.
 * - `message` survives only on a strictly error-shaped object; `title`,
 *   `description` and `detail` never do, and an Error's `name` only as a class.
 * - Sentry's own structure (exception type/value and frames, the event, log and
 *   breadcrumb message, SDK and OS/browser/runtime context fields, release, ids)
 *   is read field by field; the free text in it goes through the text scrubber.
 * - Free text: emails in every at-sign form (./scrub-email), JWTs, API keys,
 *   auth headers, cookies, credentials, Postgres errors that echo row values,
 *   URLs (query values, member and token path segments, storage paths), UUIDs,
 *   phone numbers, base64, and every `key: value` / `key=value` pair whose key
 *   is not on the allowlist.
 * - Clicks: the selector is rebuilt from the element (./scrub-ui); without the
 *   element the message is redacted.
 * - Cost: strings over 64 KB are cut to 32 KB first, every pattern is linear and
 *   the JSON pass has a step budget. Past a depth, size or budget cap the value
 *   is `[truncated]`, never sent raw.
 */

/** Scrubbed strings are cut to this length (after a delimiter), with `[truncated]` added. */
export const MAX_SCRUB_LENGTH = 32_768;
/** Strings up to this length are scrubbed whole, JSON in them parsed, before being cut. */
export const MAX_JSON_PARSE_LENGTH = 65_536;
/** Object and JSON nesting past this depth is `[truncated]`. */
const MAX_DEPTH = 20;
/** JSON inside a JSON string inside … this many levels down is `[truncated]`. */
const MAX_NESTING = 8;
const TRUNCATED = "[truncated]";
/** Written for a value that cannot be read (a throwing getter, a revoked Proxy). */
const UNREADABLE = "[unreadable]";

export interface ScrubOptions {
  /**
   * Replace UUIDs in text with `:uuid` (default true): another member's id is
   * personal data. Sentry's own id fields (event, trace, span, debug ids) are
   * never touched, whatever this says.
   */
  uuids?: boolean;
}

interface TextOptions {
  /** The text is a query string that may lack its `?` (`a=1&b=2`). */
  bareQuery: boolean;
  uuids: boolean;
  /** Apply the path-segment rules (off for stack frame file names). */
  paths: boolean;
  /** How many JSON strings deep this text sits. */
  nesting: number;
}

const textOptions = (options: ScrubOptions | undefined, bareQuery = false): TextOptions => ({
  bareQuery,
  uuids: options?.uuids ?? true,
  paths: true,
  nesting: 0,
});

/** A value an earlier rule wrote. */
const MARKER =
  /^(?:\[(?:redacted(?::\d+)?|email|jwt|data-uri|base64|supabase-key|secret|phone|truncated|Filtered|unreadable|function|binary|Circular)\]|:(?:uuid|id|token|query|path|text))$/;

// ---------------------------------------------------------------------------
// Query strings
// ---------------------------------------------------------------------------

/** A kept query value must also look like a word: no spaces, dots, `@` or `%`. */
const WORD_VALUE = /^[a-z0-9_-]{1,40}$/i;
const ORDER_TERM = String.raw`[a-z0-9_]{1,63}(?:\.(?:asc|desc))?(?:\.(?:nullsfirst|nullslast))?`;
/**
 * Query keys whose values are kept, each only in the exact shape the app puts
 * there (a table name, a page number, a PostgREST column list or sort, an auth
 * link type, an in-app path). A name, a dotted handle or a phone number fails.
 */
// A Map, not an object literal: `?constructor=` must not find Object.prototype.
const SAFE_QUERY_VALUES: ReadonlyMap<string, RegExp> = new Map([
  ["table", /^[a-z][a-z0-9_]{0,39}$/],
  ["page", /^\d{1,6}$/],
  ["limit", /^\d{1,6}$/],
  ["offset", /^\d{1,9}$/],
  ["count", /^(?:exact|planned|estimated|\d{1,9})$/],
  ["type", /^(?:signup|recovery|magiclink|invite|email|email_change|sms|phone_change)$/],
  ["grant_type", /^[a-z_]{1,40}$/],
  ["select", /^[a-z0-9_*,:!()]{1,500}$/],
  ["order", new RegExp(`^${ORDER_TERM}(?:,${ORDER_TERM}){0,9}$`)],
  ["redirect", /^\/[\w\-/]{0,200}$/],
  // TanStack Router's code-split chunks in dev stack frames (`?tsr-split=component`).
  ["tsr-split", /^[a-z_-]{1,40}$/],
]);
/** Keys whose shape is a grammar of its own (a column list, a sort, a path), checked by that grammar alone. */
const STRUCTURAL_QUERY_KEYS = new Set(["select", "order", "redirect"]);
/** Also used for the SDK's own `dataCollection.urlQueryParams` allowlist. */
export const SAFE_QUERY_KEYS: readonly string[] = [...SAFE_QUERY_VALUES.keys()];
/** A PostgREST filter on ids (`eq.<uuid>`, `in.(<uuid>,…)`) carries no personal data. */
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ID_FILTER_VALUE = new RegExp(
  `^(?:(?:eq|neq)\\.)?${UUID_PATTERN}$|^in\\.\\(${UUID_PATTERN}(?:,${UUID_PATTERN}){0,99}\\)$`,
  "i",
);

const DATA_URI = /data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+(?:=[\w.+-]+)?)*,[^\s"')]+/gi;
// `?` is excluded from the key so a run of `?a?a?a…` cannot make each start rescan the rest.
const QUERY_PAIR = /([?&#])([^=&#?\s"'<>]+)=([^&#\s"'<>]*)/g;
const BARE_QUERY = /^[^=&#?\s"'<>]+=[^&#\s"'<>]*(?:&[^=&#?\s"'<>]+=[^&#\s"'<>]*)+$/;

function decodeQueryValue(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/**
 * The value to send for one query parameter: kept only for a safe key with a
 * value of that key's shape, or for an id filter. An in-app `redirect` path keeps
 * its route with the member and token segments replaced. Credential keys (`code`,
 * `token`, …) are redacted again by a later rule even when the value is a UUID.
 */
function redactQueryValue(key: string, value: string): string {
  if (value === "" || MARKER.test(value)) return value;
  const decoded = decodeQueryValue(value);
  if (decoded === null) return "[redacted]";
  const name = key.toLowerCase();
  const shape = SAFE_QUERY_VALUES.get(name);
  if (shape?.test(decoded)) {
    if (name === "redirect") {
      const path = redactUuids(redactPathSegments(decoded));
      return path === decoded ? value : encodeURIComponent(path);
    }
    if (STRUCTURAL_QUERY_KEYS.has(name) || WORD_VALUE.test(decoded)) return value;
  }
  return ID_FILTER_VALUE.test(decoded) ? value : "[redacted]";
}

/** A stack frame's `:line:col` written straight after a dev URL's query (`?tsr-split=component:41:13`). */
const FRAME_POSITION = /(?::\d{1,7}){1,2}\)?$/;
/** Where an unencoded redacted value ends: the next pair, the fragment, a quote, a line end. */
const VALUE_STOP = /[&#\r\n"'<>]/g;
const MAX_VALUE_EXTENSION = 2_000;
/** How far an unclosed `(` is followed: one PostgREST filter, never the rest of the text. */
const MAX_PAREN_LOOKAHEAD = 500;

/**
 * The end of a value whose `(` is not yet closed (`or=(full_name.ilike.*Jane Doe*)`,
 * `in.("Jane Doe")`), or -1. The next pair (`&`), the fragment and the line end
 * stop it, so `?a=(&a=(…` costs one character per pair.
 */
function balancedEnd(text: string, start: number, open: number): number {
  let depth = open;
  const limit = Math.min(text.length, start + MAX_PAREN_LOOKAHEAD);
  for (let i = start; i < limit; i++) {
    const char = text[i];
    if (char === "\n" || char === "\r" || char === "&" || char === "#") return -1;
    if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * Every `?key=value` / `&key=value` / `#key=value` pair. A redacted value runs on
 * past unencoded spaces (`?q=Jane Doe&page=1`) and through an unclosed `(` to its
 * `)` (`or=(full_name.ilike.*Jane Doe*)`, `in.("Jane Doe")`), so no tail of it
 * stays behind.
 */
function redactQueryPairs(value: string): string {
  let out = "";
  let copied = 0;
  QUERY_PAIR.lastIndex = 0;
  for (let match = QUERY_PAIR.exec(value); match; match = QUERY_PAIR.exec(value)) {
    const [whole, separator, key, raw] = match;
    const position = FRAME_POSITION.exec(raw);
    const cut = position && position.index > 0 ? position.index : raw.length;
    const redacted = redactQueryValue(key, raw.slice(0, cut));
    let end = match.index + whole.length;
    if (redacted === "[redacted]" && cut === raw.length) {
      const opens = (raw.match(/\(/g)?.length ?? 0) - (raw.match(/\)/g)?.length ?? 0);
      const closed = opens > 0 ? balancedEnd(value, end, opens) : -1;
      if (closed !== -1) end = closed;
      VALUE_STOP.lastIndex = end;
      const stop = VALUE_STOP.exec(value);
      const runEnd = Math.min(stop ? stop.index : value.length, end + MAX_VALUE_EXTENSION);
      // Trailing spaces before the stop belong to the text around the URL.
      let trimmed = runEnd;
      while (trimmed > end && /\s/.test(value[trimmed - 1])) trimmed--;
      end = Math.max(end, trimmed);
    }
    out += `${value.slice(copied, match.index)}${separator}${key}=${redacted}${
      cut === raw.length ? "" : raw.slice(cut)
    }`;
    copied = end;
    QUERY_PAIR.lastIndex = end;
  }
  return copied === 0 ? value : out + value.slice(copied);
}

function redactBareQuery(value: string): string {
  return /^[?#]/.test(value) ? redactQueryPairs(value) : redactQueryPairs(`?${value}`).slice(1);
}

// ---------------------------------------------------------------------------
// Paths, UUIDs, phone numbers and base64
// ---------------------------------------------------------------------------

/** The segment after one of these is a token, whatever its length. */
const TOKEN_PATH_WORDS = new Set([
  "reset",
  "verify",
  "confirm",
  "invite",
  "token",
  "auth",
  "magic",
  "callback",
  "otp",
  "code",
]);
/** The segment after one of these is a member's id, handle or a slug made from them. */
const ID_PATH_WORDS = new Set([
  "users",
  "user",
  "u",
  "profiles",
  "profile",
  "members",
  "member",
  "people",
  "person",
  "accounts",
  "account",
  "customers",
  "customer",
  "posts",
  "post",
  "dm",
  "dms",
  "chat",
  "chats",
  "conversations",
  "conversation",
  "messages",
  "inbox",
]);
/** The segment after `/search/` is whatever someone typed. */
const QUERY_PATH_WORDS = new Set(["search"]);
const PATH_WORDS = [...TOKEN_PATH_WORDS, ...ID_PATH_WORDS, ...QUERY_PATH_WORDS]
  .sort((a, b) => b.length - a.length)
  .join("|");
const PATH_WORD_SEGMENT = new RegExp(
  String.raw`\/(${PATH_WORDS})\/([^/?#\s"'\x60<>\\()[\]{}|^]+)`,
  "gi",
);
/**
 * Segments kept after those words: a route template (`$memberId`, `:id`, `*`), an
 * API version (`/auth/v1/…`), or a source file with its line (`callback.mjs:12:3`).
 */
const KEPT_SEGMENT =
  /^(?:[$:*]|v\d{1,3}$|[\w.-]+\.(?:[cm]?[jt]sx?|json|css|html?|vue|svelte|wasm|map)(?::\d+){1,2}$)/i;
/** A stack frame location, `…/routes/members/table.tsx?t=1:12:3`: its path is code, not data. */
const PATH_TOKEN = /[^\s"'`<>()[\]{}|^]+/g;
const SOURCE_LOCATION =
  /\.(?:[cm]?[jt]sx?|json|css|html?|vue|svelte|wasm|map)(?:\?[^\s:]*)?:\d+(?::\d+)?$/i;

function sourceLocations(text: string): Array<readonly [number, number]> {
  const found: Array<readonly [number, number]> = [];
  for (const token of text.matchAll(PATH_TOKEN)) {
    if (token[0].includes("/") && SOURCE_LOCATION.test(token[0])) {
      found.push([token.index, token.index + token[0].length]);
    }
  }
  return found;
}

/** `/reset/abc123` becomes `/reset/:token`, `/users/jane.doe/photos` becomes `/users/:id/photos`. */
function redactWordSegments(text: string): string {
  let out = "";
  let copied = 0;
  let frames: Array<readonly [number, number]> | undefined;
  let frame = 0;
  PATH_WORD_SEGMENT.lastIndex = 0;
  for (let match = PATH_WORD_SEGMENT.exec(text); match; match = PATH_WORD_SEGMENT.exec(text)) {
    frames ??= sourceLocations(text);
    while (frame < frames.length && frames[frame][1] <= match.index) frame++;
    if (frame < frames.length && frames[frame][0] <= match.index) {
      PATH_WORD_SEGMENT.lastIndex = frames[frame][1];
      continue;
    }
    const word = match[1].toLowerCase();
    const segment = match[2];
    const start = match.index + match[1].length + 2;
    const lower = segment.toLowerCase();
    if (
      KEPT_SEGMENT.test(segment) ||
      TOKEN_PATH_WORDS.has(lower) ||
      ID_PATH_WORDS.has(lower) ||
      QUERY_PATH_WORDS.has(lower)
    ) {
      // The kept segment can itself be a word whose own next segment goes.
      PATH_WORD_SEGMENT.lastIndex = start - 1;
      continue;
    }
    const marker = TOKEN_PATH_WORDS.has(word)
      ? ":token"
      : QUERY_PATH_WORDS.has(word)
        ? ":query"
        : ":id";
    out += `${text.slice(copied, start)}${marker}`;
    copied = start + segment.length;
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/** Everything after a Supabase Storage bucket is an object path (`avatars/<member>/selfie.jpg`). */
const STORAGE_PATH =
  /(\/storage\/v1\/object\/(?:(?:public|sign|authenticated|info|upload\/sign)\/)?[^/?#\s"'<>]+\/)[^?#\s"'<>]+/gi;
/** A last path segment that is a handle (`/@jane.doe`); Vite's `/@fs/`, `/@id/`, `/@vite/` and scoped packages stay. */
const HANDLE_SEGMENT = /\/@(?!fs\/|id\/|vite\/|react-refresh)[^/?#\s"'<>]+(?=[?#\s"'<>]|$)/g;
/** A path segment holding an encoded space, quote or brace is text, not a route (`/Jane%20Doe`). */
const TEXT_SEGMENT = /\/[^/?#\s"'<>]*%(?:20|22|27|7[Bb])[^/?#\s"'<>]*/g;
/** A URL whose path names a member word (`/members`, `/u/…`): its plain fragment is a handle. */
const MEMBER_PATH = new RegExp(String.raw`\/(?:${[...ID_PATH_WORDS].join("|")})(?:[/?]|$)`, "i");
/** A fragment that is a plain word (`#jane-doe`), not a hash route (`#/members`) or `#a=b` pairs. */
const PLAIN_FRAGMENT = /^[^=&/#]+$/;

/** `/members#jane-doe` becomes `/members#:id`. One pass over the URL-shaped tokens. */
function redactMemberFragments(text: string): string {
  if (!text.includes("#")) return text;
  let out = "";
  let copied = 0;
  for (const token of text.matchAll(PATH_TOKEN)) {
    const hash = token[0].indexOf("#");
    if (hash <= 0) continue;
    const fragment = token[0].slice(hash + 1);
    if (!PLAIN_FRAGMENT.test(fragment) || !MEMBER_PATH.test(token[0].slice(0, hash))) continue;
    const start = token.index + hash + 1;
    out += `${text.slice(copied, start)}:id`;
    copied = start + fragment.length;
  }
  return copied === 0 ? text : out + text.slice(copied);
}

function redactPathSegments(text: string): string {
  if (!text.includes("/")) return text;
  return redactMemberFragments(
    redactWordSegments(text)
      .replace(STORAGE_PATH, "$1:path")
      .replace(HANDLE_SEGMENT, "/:id")
      .replace(TEXT_SEGMENT, "/:text"),
  );
}

const UUID_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function redactUuids(text: string): string {
  return text.replace(UUID_TEXT, ":uuid");
}

/**
 * Seven or more digits, with one separator between digits (a space or two, a
 * no-break or thin space, `-`, `.`, `–`, `—`, `_` or `/`), an optional leading
 * `+` and country code, and an optional area code in parentheses. The first
 * group consumes the character before the run (or the start), so a run can only
 * begin at its start: that keeps it linear. The run is bounded: an unbounded
 * group drops JavaScriptCore off its fast path on a long digit run.
 */
const PHONE =
  /(^|[^\p{L}\p{N}_.+-])(\+?(?:\d{1,3}[ -]?)?(?:\(\d{1,4}\)[ -]?)?\d(?:(?:[ \u00a0\u2009\u202f]{1,2}|[-.\u2013\u2014_/])?\d){6,30})/gu;
const DIGIT = /\d/;
const WORD_CHAR = /[\p{L}\p{N}_]/u;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;
/** Digit runs that are not phone numbers: dates, IPv4 addresses, decimals. */
const NOT_A_PHONE =
  /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,3}(?:\.\d{1,3}){3}|\d+\.\d+)$/;

/**
 * What a number after a colon is: a quoted key's value (`"amount": 1500000`), a
 * line or column (`x.js:1:1234567`), or neither.
 */
function numberRole(text: string, start: number): "field" | "position" | undefined {
  let i = start - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
  if (text[i] !== ":") return undefined;
  i--;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
  const before = text.charAt(i);
  if (before === '"' || before === "'") return "field";
  return before >= "0" && before <= "9" ? "position" : undefined;
}

/** A Philippine mobile number written as a number (no leading 0): `9171234567`, `639171234567`. */
const PH_MOBILE_NUMBER = /^(?:63)?9\d{9}$/;

function redactPhones(text: string): string {
  return text.replace(
    PHONE,
    (match: string, prefix: string, run: string, offset: number, whole: string) => {
      const end = offset + match.length;
      const next = whole.charAt(end);
      // Part of a longer token: a hash, a duration (`30000000ms`), a decimal, a time.
      // A digit next means the run went past the bound: still redacted.
      if (next !== "" && WORD_CHAR.test(next) && !DIGIT.test(next)) return match;
      if (".-:/".includes(next) && next !== "" && ALPHANUMERIC.test(whole.charAt(end + 1))) {
        return match;
      }
      if (NOT_A_PHONE.test(run)) return match;
      const role = numberRole(whole, offset + prefix.length);
      if (role === "position") return match;
      // A JSON number stays a number here; the JSON pass decides it by its key.
      if (role === "field") return PH_MOBILE_NUMBER.test(run) ? `${prefix}"[phone]"` : match;
      return `${prefix}[phone]`;
    },
  );
}

/** A base64 token: long and mixed (an upload, a serialized row), or short but holding JSON. */
const BASE64_TOKEN = /(^|[^A-Za-z0-9+/_-])([A-Za-z0-9+/]{16,}={0,2})(?![A-Za-z0-9+/=_-])/g;

/** Decoded, the token starts like JSON: `{"`, `[{`, `["`, `[[`, `[1`, after optional spaces. */
const JSON_START = /^\s*(?:\{\s*"|\[\s*[{["\d-]|\[\s*\])/;

function decodesToJson(token: string): boolean {
  try {
    return JSON_START.test(atob(token.slice(0, 12).padEnd(12, "=")));
  } catch {
    return false;
  }
}

/** A source file in a stack line (`http://localhost:3000/src/a/B.tsx:1:2`, `…/index-Bk3.js`): code, not data. */
const SOURCE_FILE =
  /\.(?:[cm]?[jt]sx?|json|css|html?|vue|svelte|wasm|map)(?:\?[^\s:]*)?(?::\d+){0,2}$/i;

/** Where the source-file paths sit in `text`, in order. */
function sourceFiles(text: string): Array<readonly [number, number]> {
  const found: Array<readonly [number, number]> = [];
  for (const token of text.matchAll(PATH_TOKEN)) {
    if (token[0].includes("/") && SOURCE_FILE.test(token[0])) {
      found.push([token.index, token.index + token[0].length]);
    }
  }
  return found;
}

function redactBase64(text: string): string {
  let files: Array<readonly [number, number]> | undefined;
  let file = 0;
  return text.replace(
    BASE64_TOKEN,
    (match: string, prefix: string, token: string, offset: number) => {
      // Trace, event and commit ids are hex: never base64 data.
      if (/^[0-9a-f]+$/i.test(token)) return match;
      const mixed = /[A-Z]/.test(token) && /[a-z]/.test(token) && /\d/.test(token);
      if (!((token.length >= 24 && mixed) || decodesToJson(token))) return match;
      // A dev or chunk path in a stack line (`3000/src/components/…/Dialog`) is code.
      files ??= sourceFiles(text);
      const start = offset + prefix.length;
      while (file < files.length && files[file][1] <= start) file++;
      if (file < files.length && files[file][0] <= start) return match;
      return `${prefix}[base64]`;
    },
  );
}

// ---------------------------------------------------------------------------
// Text rules
// ---------------------------------------------------------------------------

/** A `String#replace` callback: the whole match, then its capture groups. */
type Replacer = (match: string, ...groups: string[]) => string;
type TextRule = (text: string, options: TextOptions) => string;

const replaceWith =
  (pattern: RegExp, replacement: string | Replacer): TextRule =>
  (text) =>
    typeof replacement === "string"
      ? text.replace(pattern, replacement)
      : text.replace(pattern, replacement);

/** `Key (<columns>)=(<values>)`: the detail of a unique or foreign-key violation. */
const KEY_DETAIL = /\bkey \(/gi;
/** What follows a `Key (…)=(…)` value's closing parenthesis. */
const KEY_VALUE_SUFFIX =
  / already exists| is not present| is still referenced| conflicts with|\.|[\r\n]|$/y;
const MAX_KEY_COLUMNS = 200;
const MAX_KEY_VALUE = 500;

/**
 * Postgres's `Key (columns)=(values)`: the values go, the columns stay. The
 * column list is an expression of any depth (`lower(TRIM(BOTH FROM
 * (username)::text))`), matched by counting parentheses over at most 200
 * characters. A value ends at the first `)` followed by the message's own text
 * (` already exists`, ` is not present`, …) within 500 characters; one that
 * never does (cut, or oddly quoted) is redacted to the end of the text.
 */
function redactKeyValues(text: string): string {
  if (!/key \(/i.test(text)) return text;
  let out = "";
  let copied = 0;
  KEY_DETAIL.lastIndex = 0;
  for (let match = KEY_DETAIL.exec(text); match; match = KEY_DETAIL.exec(text)) {
    let depth = 1;
    let close = -1;
    const columnsEnd = Math.min(text.length, KEY_DETAIL.lastIndex + MAX_KEY_COLUMNS);
    for (let i = KEY_DETAIL.lastIndex; i < columnsEnd && close === -1; i++) {
      const char = text[i];
      if (char === "\n" || char === "\r") break;
      if (char === "(") depth++;
      else if (char === ")" && --depth === 0) close = i;
    }
    if (close === -1 || text[close + 1] !== "=" || text[close + 2] !== "(") continue;
    const valueStart = close + 3;
    if (text.startsWith("[redacted])", valueStart)) {
      KEY_DETAIL.lastIndex = valueStart;
      continue;
    }
    let valueEnd = -1;
    const valueLimit = Math.min(text.length, valueStart + MAX_KEY_VALUE);
    for (let i = valueStart; i < valueLimit && valueEnd === -1; i++) {
      if (text[i] !== ")") continue;
      KEY_VALUE_SUFFIX.lastIndex = i + 1;
      if (KEY_VALUE_SUFFIX.test(text)) valueEnd = i;
    }
    out += `${text.slice(copied, valueStart)}[redacted]`;
    if (valueEnd === -1) return `${out})`;
    copied = valueEnd;
    KEY_DETAIL.lastIndex = valueEnd;
  }
  return copied === 0 ? text : out + text.slice(copied);
}

const TEXT_RULES: readonly TextRule[] = [
  // JWTs: header (and payload) are base64url JSON, so they start "eyJ". Also
  // matches a token cut after its header or mid-payload by truncation.
  replaceWith(/\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*){0,2}/g, "[jwt]"),
  // API keys by their published prefixes: Stripe, Anthropic, OpenAI-style, GitHub, Slack, AWS.
  replaceWith(/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{4,}/g, "[secret]"),
  replaceWith(/\bsk-ant-[A-Za-z0-9_-]{4,}/g, "[secret]"),
  replaceWith(/\bsk-[A-Za-z0-9_-]{20,}/g, "[secret]"),
  replaceWith(/\b(?:gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,})/g, "[secret]"),
  replaceWith(/\bxox[abprs]-[A-Za-z0-9-]{4,}/g, "[secret]"),
  replaceWith(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[secret]"),
  replaceWith(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{6,}/gi, "$1 [redacted]"),
  // Basic/Digest only after an Authorization header: "Basic subscription" is prose.
  replaceWith(
    /\b((?:proxy-)?authorization\s*[:=]\s*["']?\s*)(Basic|Digest)\s+[^\r\n"']+/gi,
    "$1$2 [redacted]",
  ),
  replaceWith(/\b((?:Set-)?Cookie)\s*:\s*[^\r\n]+/gi, "$1: [redacted]"),
  // Client IP headers written out as text (the header objects are handled in the walk).
  replaceWith(
    /\b(x-forwarded-for|x-real-ip|x-client-ip|true-client-ip|cf-connecting-ip|x-vercel-forwarded-for)(\s*[:=]\s*)[^\r\n;"']+/gi,
    "$1$2[redacted]",
  ),
  replaceWith(
    /\bsb-[a-z0-9-]{1,64}-auth-token(?:\.\d+)?=[^;\s"']+/gi,
    "sb-[ref]-auth-token=[redacted]",
  ),
  // Credential keys in a URL or a bare query string, first parameter included.
  replaceWith(
    /((?:^|[?&#;])(?:access_token|refresh_token|id_token|provider_token|provider_refresh_token|token|token_hash|code|apikey|api_key|key|secret|password|signature|sig|jwt|auth|otp|payload)=)[^&#\s"'<>]*/gi,
    "$1[redacted]",
  ),
  (text, options) => (options.paths ? redactPathSegments(text) : text),
  // Secret fields in JSON text, camelCase or snake_case. Key length is bounded
  // so an unterminated quote cannot backtrack across the whole string.
  replaceWith(
    /("[\w-]{0,64}(?:token|secret|password|passwd|apikey|api_key|authorization|cookie|jwt|otp)[\w-]{0,64}"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
    '$1"[redacted]"',
  ),
  // The same fields as unquoted or quoted `key: value` / `key=value` text
  // (util.inspect output, log lines). `(?!["']?\[)` skips values already redacted
  // (quoted or not, so a redacted JSON value keeps its quotes); an Authorization
  // scheme is left to the Bearer / Basic rules above.
  replaceWith(
    /\b(access_?token|refresh_?token|id_?token|provider_?token|token_?hash|password|passwd|secret|client_?secret|service_?role_?key|api_?key|captcha_?token|hcaptcha_?token|otp|authorization)(["']?\s*[:=]\s*)(?!["']?\[|(?:Bearer|Basic|Digest)\b)(?:'[^']*'|"[^"]*"|[^\s,;&"'})\]]+)/gi,
    "$1$2[redacted]",
  ),
  // A bare `token=…` (not `token: …`, which is prose: "Unexpected token: <").
  replaceWith(
    /\b(token)(\s*=\s*)(?!["']?\[)(?:'[^']*'|"[^"]*"|[^\s,;&"'})\]]+)/gi,
    "$1$2[redacted]",
  ),
  // Search terms inside JSON text (a logged object or request body).
  replaceWith(
    /("(?:search|searchterm|searchquery|q|query|term|keyword|keywords)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
    '$1"[redacted]"',
  ),
  replaceWith(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key]"),
  // Postgres / PostgREST errors that echo row values. The constraint, columns,
  // type and error code stay; the values go. Each template has a bounded rule
  // for the normal shape (a value may span lines: a bio, a chat message), then a
  // fallback to the end of the text for an over-long or oddly quoted value
  // (never a partial match that leaks the tail). `Key (…)=(…)` is a scanner: its
  // column list is an expression index of any depth.
  redactKeyValues,
  replaceWith(/\b(Failing row contains )\([\s\S]{0,2000}\)(?=\.)/gi, "$1([redacted])"),
  replaceWith(/\b(Failing row contains )\((?!\[redacted\]\))[\s\S]*/gi, "$1([redacted])"),
  replaceWith(
    /\b(invalid input (?:syntax for type [\w ]{1,40}|value for enum [\w.]{1,80}): )(\\?")[^"\\]{0,500}\2(?=["\r\n]|$)/gi,
    "$1$2[redacted]$2",
  ),
  replaceWith(
    /\b(invalid input (?:syntax for type [\w ]{1,40}|value for enum [\w.]{1,80}): )(?!\\?"\[redacted\])(?:\\?"[\s\S]*|'[^\r\n]*|[^\s"'\\][^\r\n]*)/gi,
    '$1"[redacted]"',
  ),
  // Other messages that quote the value: dates, array and record literals, SQL
  // and JSON syntax errors, out-of-range values, Supabase Auth's address check.
  replaceWith(
    /\b(date\/time field value out of range: |malformed (?:array|record|range) literal: |(?:syntax error|unterminated quoted string|zero-length delimited identifier) at or near |Token |value |Email address )(\\?")[^"\\]{0,500}\2(?=[\s"'.,;:)\]}]|$)/gi,
    "$1$2[redacted]$2",
  ),
  replaceWith(
    /\b(date\/time field value out of range: |malformed (?:array|record|range) literal: |(?:syntax error|unterminated quoted string) at or near )(?!\\?"\[redacted\])\\?"[\s\S]*/gi,
    '$1"[redacted]"',
  ),
  // A DETAIL line keeps its first clause; any quoted fragment after it goes
  // (`DETAIL:  Expected ":", but found "Jane".`).
  replaceWith(
    /(DETAIL:[ \t]+[^,.\r\n"]*(?:"[^"\r\n]*"[^,.\r\n"]*)*)([^\r\n]*)/g,
    (_match, clause: string, rest: string) =>
      `${clause}${rest.replace(/"(?!\[redacted\]")[^"\r\n]*"/g, '"[redacted]"')}`,
  ),
  // A CONTEXT line quoting the JSON input: the line's data goes.
  replaceWith(/(CONTEXT:[ \t]+JSON data, line \d+: )[^\r\n]*/g, "$1[redacted]"),
  replaceWith(
    /\b(failed to parse (?:logic tree|filter) )\([^\r\n]{0,2000}\)(?=\\?" \(line \d)/gi,
    "$1([redacted])",
  ),
  replaceWith(
    /\b(failed to parse (?:logic tree|filter) )\((?!\[redacted\]\))[^\r\n]{0,2000}\)/gi,
    "$1([redacted])",
  ),
  replaceWith(
    /\b(failed to parse (?:logic tree|filter) )\((?!\[redacted\]\))[\s\S]*/gi,
    "$1([redacted])",
  ),
  redactEmails,
  // Long base64 runs that were not part of a data URI (raw uploads, blobs). Not
  // in a stack frame's file name: `localhost:3000/src/…/MemberCreditDialog.tsx`
  // is a base64-shaped run.
  (text, options) =>
    options.paths ? text.replace(/[A-Za-z0-9+/]{120,}={0,2}/g, "[base64]") : text,
  (text, options) => (options.paths ? redactBase64(text) : text),
  (text, options) => (options.uuids ? redactUuids(text) : text),
  redactPhones,
];

// ---------------------------------------------------------------------------
// Key-value pairs in text that is not (or not entirely) valid JSON
// ---------------------------------------------------------------------------

/**
 * `"key": value` in JSON text: a string (escaped quotes consumed; a value cut off
 * by truncation runs to the end of the text), a number or a boolean. Any key
 * (non-ASCII, punctuation, over 64 characters) is matched, so the allowlist
 * decides it. The loops are unrolled (`[^"\\]*(?:\\.[^"\\]*)*`): that form stays
 * linear in JavaScriptCore, `(?:[^"\\]|\\.)*` does not on a long unterminated
 * value. A key's scan ends at the next quote, so the key stays linear too.
 */
const JSON_PAIR =
  /"([^"\\\r\n]{1,1000})"(\s*:\s*)("[^"\\]*(?:\\[\s\S][^"\\]*)*(?:"|\\?$)|-?\d[\d.eE+-]{0,40}|true|false|null)/g;
/**
 * The same, one, two or three JSON-string levels down: a request body logged
 * inside an object (`{"body":"{\"full_name\":\"Jane\"}"}`). Every quote of one
 * level carries the same run of backslashes (1, 3, 7); a quote with any other
 * run is inside the value. The value also ends at a bare quote (the enclosing
 * string closed) or the end of the text. No backreferences (JavaScriptCore).
 */
const NESTED_PAIRS: readonly RegExp[] = [1, 3, 7].map(
  (depth) =>
    new RegExp(
      String.raw`(\\{${depth}})"([^"\\\r\n]{1,1000})\\{${depth}}"(\s*:\s*)\\{${depth}}"[^"\\]*(?:(?:\\+[^"\\]` +
        (depth > 1 ? String.raw`|\\{1,${depth - 1}}"` : "") +
        String.raw`|\\{${depth + 1},}")[^"\\]*)*(?:\\{${depth}}"|\\*$|(?="))`,
      "g",
    ),
);
/**
 * One quoted value as util.inspect writes it: `'…'`, `"…"` or, when it holds
 * both quotes, `` `…` ``. A value may hold raw newlines; one left unclosed runs to
 * the end of the text.
 */
const INSPECT_QUOTED = [
  String.raw`'[^'\\]*(?:\\[\s\S][^'\\]*)*(?:'|\\?$)`,
  String.raw`"[^"\\]*(?:\\[\s\S][^"\\]*)*(?:"|\\?$)`,
  String.raw`\x60[^\x60\\]*(?:\\[\s\S][^\x60\\]*)*(?:\x60|\\?$)`,
].join("|");
/**
 * `key: 'value'` as util.inspect and log lines write it (also `'key': "value"`,
 * `key: 123`). A long string is split by util.inspect into `'…\n' +` lines: the
 * continued pieces belong to the value.
 */
const INSPECT_PAIR = new RegExp(
  String.raw`\b([A-Za-z_][\w-]{0,63})(['"]?\s*:\s*)((?:${INSPECT_QUOTED})(?:\s*\+\s*(?:${INSPECT_QUOTED}))*|-?\d[\d.eE+-]{0,40}|true|false|null)`,
  "g",
);
/** `key='value'` / `key="value"`. */
const QUOTED_EQUALS = /\b([A-Za-z_][\w-]{0,63})([ \t]*=[ \t]*)('[^'\r\n]*'|"[^"\r\n]*")/g;
/** A member field whose value is an object or array, in JSON or inspect form. */
const MEMBER_CONTAINER = /(?:"([\w .-]{1,64})"|\b([A-Za-z_][\w-]{0,63})['"]?)\s*:\s*[{[]/g;

const quoteOf = (value: string) => ("\"'`".includes(value[0] ?? "x") ? value[0] : "'");
const unquote = (value: string) => value.replace(/^\\*["'`]|\\*["'`]$/g, "");
const isErrorTextKey = (key: string) => ERROR_TEXT_KEYS.has(normalizeKey(key));
const isMemberContainerKey = (key: string) => {
  const normalized = normalizeKey(key);
  return MEMBER_FIELD_KEYS.has(normalized) && !ERROR_TEXT_KEYS.has(normalized);
};

/** End of the bracketed value opening at `open` (quote-aware), or the end of the text. */
function containerEnd(text: string, open: number): number {
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{" || char === "[") {
      depth++;
    } else if ((char === "}" || char === "]") && --depth === 0) {
      return i + 1;
    }
  }
  return text.length;
}

/** A marker an earlier rule wrote (`phone: [phone]`): already redacted, not an array. */
const BRACKET_MARKER =
  /\[(?:redacted(?::\d+)?|email|jwt|data-uri|base64|supabase-key|secret|phone|truncated|Filtered)\]/y;

function redactMemberContainers(text: string): string {
  let out = "";
  let copied = 0;
  for (const match of text.matchAll(MEMBER_CONTAINER)) {
    if (match.index < copied || !isMemberContainerKey(match[1] ?? match[2])) continue;
    const open = match.index + match[0].length - 1;
    BRACKET_MARKER.lastIndex = open;
    if (BRACKET_MARKER.test(text)) continue;
    out += `${text.slice(copied, open)}${match[0].includes('"') ? '"[redacted]"' : "'[redacted]'"}`;
    copied = containerEnd(text, open);
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/** A raw value as written in text: a quoted string, a number, or a literal. */
function textValue(raw: string): unknown {
  if (/^\\*["'`]/.test(raw)) {
    return unquote(raw.replace(/\s*\+\s*(?=["'`])/g, ""));
  }
  if (raw === "true" || raw === "false") return raw === "true";
  if (raw === "null") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : raw;
}

/** The allowlist decision for one pair found in text (not an error-text key). */
function keepsTextPair(key: string, value: unknown): boolean {
  if (typeof value === "string" && MARKER.test(value)) return true;
  const action: FieldAction = fieldAction(key, value, false);
  return action === "keep" || action === "text" || action === "query" || action === "walk";
}

/**
 * Which object (or list) holds each character, from one pass over the brackets
 * that skips quoted strings and backslash escapes; and which characters sit
 * inside a quoted string. Id 0 is the top level.
 */
const OPENS_STRING_AFTER = new Set(Array.from(" \t\r\n:,[{(=+!", (char) => char.charCodeAt(0)));

function bracketOwners(text: string): { owner: Int32Array; parent: number[]; quoted: Uint8Array } {
  const owner = new Int32Array(text.length + 1);
  const quoted = new Uint8Array(text.length + 1);
  const parent = [-1];
  const stack = [0];
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    owner[i] = stack[stack.length - 1];
    if (quote) quoted[i] = 1;
    if (char === "\\") {
      if (i + 1 < text.length) {
        owner[i + 1] = owner[i];
        quoted[i + 1] = quoted[i];
      }
      i++;
    } else if (quote) {
      if (char === quote) quote = "";
    } else if (
      (char === '"' || char === "'" || char === "`") &&
      (i === 0 || OPENS_STRING_AFTER.has(text.charCodeAt(i - 1)))
    ) {
      quote = char;
    } else if (char === "{" || char === "[") {
      parent.push(stack[stack.length - 1]);
      stack.push(parent.length - 1);
      owner[i] = parent.length - 1;
    } else if ((char === "}" || char === "]") && stack.length > 1) {
      stack.pop();
    }
  }
  owner[text.length] = stack[stack.length - 1];
  return { owner, parent, quoted };
}

/** `error: {`, `errors: [`: what opens here is an error, or a list of them. */
const ERROR_HOLDER_TEXT = /\b(?:error|errors|err|cause|exception)\\*["']?\s*:\s*[{[]/g;

/**
 * "Is the object holding this offset an error?", built once per text, by the
 * same signals as `isErrorShaped`: an error-only key with a real value (a code
 * that is an error code, a non-empty stack or hint, …) in that same object, or
 * the object sits under an error key; and no row key (`id`, a column the
 * allowlist would not keep). Keys inside a quoted value are text, never signals.
 * Text outside any brackets is never an error. Also answers "is this offset
 * outside every bracket?": there a comma is prose, not the end of a value.
 */
interface TextContext {
  inError: (offset: number) => boolean;
  topLevel: (offset: number) => boolean;
}

function errorContext(text: string): TextContext {
  let owners: ReturnType<typeof bracketOwners> | undefined;
  let test: ((offset: number) => boolean) | undefined;
  const build = () => {
    owners ??= bracketOwners(text);
    const { owner, parent, quoted } = owners;
    const strong = new Set<number>();
    const rows = new Set<number>();
    const holders = new Set<number>();
    for (const pattern of [JSON_PAIR, INSPECT_PAIR]) {
      for (const match of text.matchAll(pattern)) {
        if (quoted[match.index]) continue;
        const signal = errorSignal(match[1], textValue(match[3]));
        if (signal === "strong") strong.add(owner[match.index]);
        else if (signal === "row") rows.add(owner[match.index]);
      }
    }
    for (const match of text.matchAll(ERROR_HOLDER_TEXT)) {
      if (!quoted[match.index]) holders.add(owner[match.index + match[0].length - 1]);
    }
    return (offset: number) => {
      const id = owner[Math.min(offset, text.length)];
      if (id === 0 || rows.has(id)) return false;
      return strong.has(id) || holders.has(id) || holders.has(parent[id]);
    };
  };
  return {
    inError: (offset) => (test ??= build())(offset),
    topLevel: (offset) =>
      (owners ??= bracketOwners(text)).owner[Math.min(offset, text.length)] === 0,
  };
}

/** Whether to keep an error-text field (`message`, `details`, `hint`, a class-shaped `name`) found in text. */
function keepsErrorText(key: string, value: unknown, inError: () => boolean): boolean {
  if (value === null || value === "" || typeof value !== "string") return true;
  if (MARKER.test(value)) return true;
  if (normalizeKey(key) === "name") return isErrorClassName(value);
  return inError();
}

/** Keys whose unquoted value is an error's own prose: `TypeError: …`, `Invariant failed: …`, `DETAIL: …`. */
const PROSE_KEYS = new Set([
  "failed",
  "error",
  "err",
  "errors",
  "warning",
  "warn",
  "info",
  "debug",
  "fatal",
  "invariant",
  "exception",
  "caused",
  "rejection",
  "uncaught",
  "unhandled",
]);
/** Postgres message labels and log levels in capitals (`DETAIL:`, `HINT:`, `ERROR:`): the server's prose. */
const PROSE_LABELS = new Set([
  "ERROR",
  "WARNING",
  "WARN",
  "NOTICE",
  "INFO",
  "DEBUG",
  "LOG",
  "FATAL",
  "PANIC",
  "TRACE",
  "DETAIL",
  "HINT",
  "CONTEXT",
  "QUERY",
  "STATEMENT",
  "LOCATION",
  "LINE",
  "WHERE",
]);
/** An errno or a prefixed code written as a prefix: `ECONNRESET:`, `PGRST116:`, `P0001:`, `ERR_HTTP:`. */
const CODE_PREFIX = /^(?:E[A-Z]{3,}|[A-Z]{1,8}\d{2,}|\d[0-9A-Z]{4}|ERR_[A-Z0-9_]+)$/;

/** A member, search or credential field (any case): its value goes in every text form. */
function isMemberFieldKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (ERROR_TEXT_KEYS.has(normalized)) return false;
  return MEMBER_FIELD_KEYS.has(normalized) || USER_INPUT_KEYS.has(normalized) || isSecretKey(key);
}

/**
 * A prose prefix, not a field: an error class (`TypeError:`), an error word
 * (`Invariant failed:`), a Postgres label or log level in capitals, an errno or
 * a prefixed code, or one capitalised word (`JSON:`, `NOTE:`). A key in capitals
 * that folds to a known key is that key (`FULL_NAME` is `full_name`, `NAME` is
 * `name`), and a snake_case one is a field like its lowercase form (`HAIR_TYPE`).
 */
function isProseKey(key: string): boolean {
  if (PROSE_KEYS.has(key.toLowerCase())) return true;
  if (/^[A-Z][\w$]*(?:Error|Exception|Warning)$/.test(key)) return true;
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return false;
  if (PROSE_LABELS.has(key)) return true;
  if (isMemberFieldKey(key) || isErrorTextKey(key) || isDebugKey(key)) return false;
  return CODE_PREFIX.test(key) || !key.includes("_");
}

/** A marker an earlier rule wrote, alone or after an auth scheme (`Bearer [redacted]`). */
const VALUE_MARKER =
  /^(?:(?:[Bb]earer|[Bb]asic|[Dd]igest) )?(?:\[(?:redacted(?::\d+)?|email|jwt|data-uri|base64|supabase-key|secret|phone|truncated|Filtered|unreadable|function|binary|Circular)\]|:(?:uuid|id|token|query|path|text))$/;
/** Unquoted values that are never a member's: numbers and positions, literals, constants, paths, error classes. */
const PROSE_VALUE_KEPT =
  /^(?:[\d.:,+-]+(?:ms|s|px|%|kb|mb|gb)?|null|true|false|undefined|NaN|:\w+|[A-Z][A-Z0-9_]{2,}|(?:\/|[a-z][\w+.-]*:\/\/)\S*|[A-Z]\w*(?:Error|Exception)\b[\s\S]*)$/;
/** Keys whose unquoted value is kept by ruling: an error's message reads in a log line. */
const UNQUOTED_KEPT_TEXT = new Set(["message", "errormessage"]);

/** A key in an unquoted pair: a name, or up to five dotted parts (`profile.full_name`). */
const UNQUOTED_KEY = String.raw`[A-Za-z_][\w-]{0,63}(?:\.[A-Za-z_][\w-]{0,63}){0,4}`;
/**
 * `key: value`, with an optional quote after the key (`'full_name': Jane`). With
 * no space after the colon (`node:internal`, `https://`, `full_name:Jane`) only a
 * member, search or credential key, or `name`, is read.
 */
const UNQUOTED_COLON = new RegExp(
  String.raw`(^|[^\w.$@/\\-])(${UNQUOTED_KEY})(['"]?:[ \t]*)(?=[^\s"'\x60{[])`,
  "gm",
);
/** `key=value` outside a query string (`?`/`&` before the key belong to QUERY_PAIR). */
const UNQUOTED_EQUALS = new RegExp(
  String.raw`(^|[^\w.$@/\\?&=-])(${UNQUOTED_KEY})([ \t]*=[ \t]*)(?=[^\s"'\x60{[=])`,
  "gm",
);
/** The next pair after a space: the current value ends there. */
const NEXT_KEY = /[ \t]{1,8}[A-Za-z_][\w.-]{0,63}(?::[ \t]|[ \t]*=[^=])/y;
/** A pair straight after a comma (`a: 1, b: 2`, `a: 1,b: 2`): the comma ends the value. */
const PAIR_AFTER_COMMA = /[ \t]{0,8}['"]?[A-Za-z_][\w.-]{0,63}['"]?(?::[ \t]|[ \t]*=[^=])/y;
const VALUE_DELIMITERS = new Set(Array.from(",;})]\r\n&", (char) => char.charCodeAt(0)));

/**
 * How an unquoted pair's key is read: `skip` (prose, code, the ruled `message`),
 * `member` (the value always goes), `error` (error text: kept in an error, `name`
 * only as a class) or `field` (the allowlist decides). A dotted key is a member
 * field when any part is one; otherwise its last part decides, and a dotted name
 * the allowlist does not know (`React.createElement`) is code.
 */
function unquotedKeyRole(key: string, spaced: boolean): "skip" | "member" | "error" | "field" {
  const parts = key.split(".");
  if (parts.length > 1) {
    if (parts.some(isMemberFieldKey)) return "member";
    if (unquotedKeyRole(parts[parts.length - 1], spaced) === "error") return "error";
    return spaced && isDebugKey(key) ? "field" : "skip";
  }
  const normalized = normalizeKey(key);
  if (UNQUOTED_KEPT_TEXT.has(normalized) || isProseKey(key)) return "skip";
  if (ERROR_TEXT_KEYS.has(normalized)) return spaced || normalized === "name" ? "error" : "skip";
  if (isMemberFieldKey(key)) return "member";
  return spaced ? "field" : "skip";
}

/** End of an unquoted value: a delimiter, the line end, or the next `key:`/`key=`. Trailing spaces trimmed. */
function unquotedValueEnd(text: string, start: number): number {
  let end = start;
  for (let i = start; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 91) {
      // A marker an earlier rule wrote (`Bearer [redacted]`) is one token, not a `]` delimiter.
      BRACKET_MARKER.lastIndex = i;
      if (BRACKET_MARKER.test(text)) {
        i = BRACKET_MARKER.lastIndex - 1;
        end = i + 1;
        continue;
      }
    }
    if (VALUE_DELIMITERS.has(code)) break;
    if (code === 32 || code === 9) {
      if (i > start && (text.charCodeAt(i - 1) === 32 || text.charCodeAt(i - 1) === 9)) continue;
      NEXT_KEY.lastIndex = i;
      if (NEXT_KEY.test(text)) break;
    } else {
      end = i + 1;
    }
  }
  return end;
}

/**
 * A redacted value outside any brackets runs on through commas that are prose
 * (`title: Jane's outfit, 7 months pregnant`), up to a comma that starts the
 * next pair. Inside brackets a comma always ends it.
 */
function throughProseCommas(text: string, end: number, context: TextContext): number {
  let at = end;
  for (;;) {
    let comma = at;
    while (text[comma] === " " || text[comma] === "\t") comma++;
    if (text[comma] !== "," || !context.topLevel(comma)) return at;
    PAIR_AFTER_COMMA.lastIndex = comma + 1;
    if (PAIR_AFTER_COMMA.test(text)) return at;
    at = Math.max(unquotedValueEnd(text, comma + 1), comma + 1);
  }
}

/**
 * Unquoted `key: value` / `key=value` (log lines, hand-written messages): the
 * whole value goes for a member key, for error text outside an error, and for
 * any key that is not on the allowlist. An error's message (by ruling), its
 * prose prefixes (`TypeError:`, `Invariant failed:`, `DETAIL:`) and kept values
 * (numbers, constants, paths, markers) stay, so "Invalid email: [redacted]"
 * still says which check failed.
 */
function redactUnquotedPairs(text: string, pattern: RegExp): string {
  let out = "";
  let copied = 0;
  let context: TextContext | undefined;
  const contextOf = () => (context ??= errorContext(text));
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const [whole, prefix, key, separator] = match;
    // A quote after the key (`on 'Node': The node…`, `'full_name': Jane`) or no
    // space after the colon is read only for a member key.
    const spaced =
      !/['"]/.test(separator) && (pattern === UNQUOTED_EQUALS || /[ \t]$/.test(separator));
    const role = unquotedKeyRole(key, spaced);
    if (role === "skip") continue;
    const valueStart = match.index + whole.length;
    let valueEnd = unquotedValueEnd(text, valueStart);
    const value = text.slice(valueStart, valueEnd);
    pattern.lastIndex = Math.max(valueEnd, valueStart);
    if (value === "" || VALUE_MARKER.test(value)) continue;
    const last = key.slice(key.lastIndexOf(".") + 1);
    const keep =
      role === "error"
        ? normalizeKey(last) === "name"
          ? isErrorClassName(value)
          : PROSE_VALUE_KEPT.test(value) || contextOf().inError(valueStart)
        : role === "field" &&
          (PROSE_VALUE_KEPT.test(value) || keepsTextPair(key, textValue(value)));
    if (keep) continue;
    valueEnd = throughProseCommas(text, valueEnd, contextOf());
    pattern.lastIndex = valueEnd;
    out += `${text.slice(copied, match.index)}${prefix}${key}${separator}[redacted]`;
    copied = valueEnd;
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/**
 * Every key-value pair in text the JSON pass could not parse: kept only under a
 * debug key in that key's shape (or an error-text key inside an error), redacted
 * otherwise. The same allowlist as structured data.
 */
function redactFreeTextPairs(segment: string): string {
  if (!segment.includes(":") && !segment.includes("=")) return segment;
  let text = segment;
  let context = errorContext(text);
  text = text.replace(
    JSON_PAIR,
    (match, key: string, separator: string, raw: string, offset: number) => {
      const value = textValue(raw);
      const keep = isErrorTextKey(key)
        ? keepsErrorText(key, value, () => context.inError(offset))
        : keepsTextPair(key, value);
      // A key that is itself member text (`"Jane Doe": 1`) goes as well.
      const name = isDataKey(key) ? "[key]" : key;
      if (keep && name === key) return match;
      return `"${name}"${separator}${keep ? raw : '"[redacted]"'}`;
    },
  );
  for (const pattern of NESTED_PAIRS) {
    context = errorContext(text);
    text = text.replace(
      pattern,
      (match, slashes: string, key: string, separator: string, offset: number) => {
        const rawValue = match.slice(2 * slashes.length + key.length + 2 + separator.length);
        const value = unquote(rawValue);
        const keep = isErrorTextKey(key)
          ? keepsErrorText(key, value, () => context.inError(offset))
          : keepsTextPair(key, value);
        const name = isDataKey(key) ? "[key]" : key;
        if (keep && name === key) return match;
        return `${slashes}"${name}${slashes}"${separator}${
          keep ? rawValue : `${slashes}"[redacted]${slashes}"`
        }`;
      },
    );
  }
  text = /[{[]/.test(text) ? redactMemberContainers(text) : text;
  context = errorContext(text);
  text = text.replace(
    INSPECT_PAIR,
    (match, key: string, separator: string, raw: string, offset: number) => {
      const value = textValue(raw);
      // `Unexpected token in JSON: "x"`: a prose prefix, not a field (member keys still go).
      const keep = isErrorTextKey(key)
        ? keepsErrorText(key, value, () => context.inError(offset))
        : (isProseKey(key) &&
            !isMemberContainerKey(key) &&
            fieldAction(key, value, false) !== "secret") ||
          keepsTextPair(key, value);
      return keep ? match : `${key}${separator}${quoteOf(raw)}[redacted]${quoteOf(raw)}`;
    },
  );
  if (text.includes("=")) {
    // `key="…"`, `key='…'` and HTML attributes read like their JSON form: error
    // text only in an error (`name` only as a class), the message by ruling.
    context = errorContext(text);
    text = text.replace(
      QUOTED_EQUALS,
      (match, key: string, separator: string, raw: string, offset: number) => {
        const value = textValue(raw);
        const keep = UNQUOTED_KEPT_TEXT.has(normalizeKey(key))
          ? true
          : isErrorTextKey(key)
            ? keepsErrorText(key, value, () => context.inError(offset))
            : keepsTextPair(key, value);
        return keep ? match : `${key}${separator}${quoteOf(raw)}[redacted]${quoteOf(raw)}`;
      },
    );
    text = redactUnquotedPairs(text, UNQUOTED_EQUALS);
  }
  return redactUnquotedPairs(text, UNQUOTED_COLON);
}

// ---------------------------------------------------------------------------
// JSON text: parsed, scrubbed and written back in place
// ---------------------------------------------------------------------------

type JsonNode =
  | { kind: "string"; start: number; end: number }
  | { kind: "scalar"; start: number; end: number; value: number | boolean | null }
  | { kind: "object"; start: number; end: number; members: JsonMember[] }
  | { kind: "array"; start: number; end: number; items: JsonNode[] }
  /** Nested past MAX_DEPTH: written back as `"[truncated]"`. */
  | { kind: "deep"; start: number; end: number };
interface JsonMember {
  key: { kind: "string"; start: number; end: number };
  value: JsonNode;
}
type Edit = readonly [start: number, end: number, text: string];

interface JsonScan {
  text: string;
  /** Characters the parser may still read: failed parses cannot add up past a linear bound. */
  budget: number;
}

const JSON_NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const JSON_LITERAL = /true|false|null/y;
const JSON_ESCAPE = /^(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/;

function skipSpace(text: string, index: number): number {
  let i = index;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;
    i++;
  }
  return i;
}

/** A JSON string token at `start`: a closing quote, valid escapes only, no raw control character. */
function parseJsonString(scan: JsonScan, start: number): JsonNode | null {
  const { text } = scan;
  let i = start + 1;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 34) {
      scan.budget -= i - start;
      return { kind: "string", start, end: i + 1 };
    }
    if (code < 32) break;
    if (code === 92) {
      const escape = JSON_ESCAPE.exec(text.slice(i + 1, i + 6));
      if (!escape) break;
      i += 1 + escape[0].length;
    } else {
      i++;
    }
  }
  scan.budget -= i - start;
  return null;
}

/** Skips a value nested past MAX_DEPTH without building it, or null when it never closes. */
function skipJsonValue(scan: JsonScan, start: number): JsonNode | null {
  const end = containerEnd(scan.text, start);
  scan.budget -= end - start;
  const last = scan.text[end - 1];
  return end <= scan.text.length && (last === "}" || last === "]") && end > start + 1
    ? { kind: "deep", start, end }
    : null;
}

function parseJsonValue(scan: JsonScan, start: number, depth: number): JsonNode | null {
  if (scan.budget <= 0) return null;
  const { text } = scan;
  const char = text[start];
  if (char === '"') return parseJsonString(scan, start);
  if (char === "{" || char === "[") {
    if (depth >= MAX_DEPTH) return skipJsonValue(scan, start);
    return char === "{" ? parseJsonObject(scan, start, depth) : parseJsonArray(scan, start, depth);
  }
  for (const pattern of [JSON_NUMBER, JSON_LITERAL]) {
    pattern.lastIndex = start;
    const match = pattern.exec(text);
    if (match) {
      scan.budget -= match[0].length;
      const value = pattern === JSON_NUMBER ? Number(match[0]) : JSON.parse(match[0]);
      return { kind: "scalar", start, end: start + match[0].length, value };
    }
  }
  return null;
}

function parseJsonObject(scan: JsonScan, start: number, depth: number): JsonNode | null {
  const { text } = scan;
  const members: JsonMember[] = [];
  let i = skipSpace(text, start + 1);
  if (text[i] !== "}") {
    for (;;) {
      if (text[i] !== '"') return null;
      const key = parseJsonString(scan, i);
      if (!key || key.kind !== "string") return null;
      let j = skipSpace(text, key.end);
      if (text[j] !== ":") return null;
      j = skipSpace(text, j + 1);
      const value = parseJsonValue(scan, j, depth + 1);
      if (!value) return null;
      members.push({ key, value });
      i = skipSpace(text, value.end);
      if (text[i] === "}") break;
      if (text[i] !== ",") return null;
      i = skipSpace(text, i + 1);
      scan.budget -= 1;
    }
  }
  return { kind: "object", start, end: i + 1, members };
}

function parseJsonArray(scan: JsonScan, start: number, depth: number): JsonNode | null {
  const { text } = scan;
  const items: JsonNode[] = [];
  let i = skipSpace(text, start + 1);
  if (text[i] !== "]") {
    for (;;) {
      const value = parseJsonValue(scan, i, depth + 1);
      if (!value) return null;
      items.push(value);
      i = skipSpace(text, value.end);
      if (text[i] === "]") break;
      if (text[i] !== ",") return null;
      i = skipSpace(text, i + 1);
      scan.budget -= 1;
    }
  }
  return { kind: "array", start, end: i + 1, items };
}

const decodeJsonString = (text: string, node: JsonNode) =>
  JSON.parse(text.slice(node.start, node.end)) as string;

/** A stand-in for a node's value, enough for `fieldAction` and `isErrorShaped`. */
function nodeValue(text: string, node: JsonNode): unknown {
  switch (node.kind) {
    case "string":
      return decodeJsonString(text, node);
    case "scalar":
      return node.value;
    case "array":
      return [];
    default:
      return {};
  }
}

/** A string leaf, scrubbed as text one JSON level down. */
function stringEdit(text: string, node: JsonNode, options: TextOptions): Edit | undefined {
  const decoded = decodeJsonString(text, node);
  const child = { ...options, nesting: options.nesting + 1 };
  const scrubbed = child.nesting > MAX_NESTING ? TRUNCATED : scrubText(decoded, child);
  return scrubbed === decoded ? undefined : [node.start, node.end, JSON.stringify(scrubbed)];
}

function replaceNode(text: string, node: JsonNode, replacement: string, edits: Edit[]): void {
  if (text.slice(node.start, node.end) !== replacement) {
    edits.push([node.start, node.end, replacement]);
  }
}

/** The marker a redacted field becomes (./scrub-keys `redactedMarker`), as JSON. */
function redactedJson(text: string, node: JsonNode, key: string): string {
  return JSON.stringify(
    redactedMarker(key, node.kind === "string" ? decodeJsonString(text, node) : undefined),
  );
}

/** A query key's items: its namespace, numbers, booleans and UUIDs; anything else is `[redacted]`. */
function structuralEdits(
  text: string,
  node: Extract<JsonNode, { kind: "array" }>,
  key: string,
  options: TextOptions,
  edits: Edit[],
): void {
  node.items.forEach((item, index) => {
    if (index === 0 && item.kind === "string") {
      const edit = stringEdit(text, item, { ...options, bareQuery: false });
      if (edit) edits.push(edit);
    } else if (item.kind === "object" || item.kind === "array" || item.kind === "deep") {
      replaceNode(text, item, '"[redacted]"', edits);
    } else {
      valueEdits(text, item, key, false, false, options, edits);
    }
  });
}

/**
 * The edits for one value. Under a key (`key` set) the field decision applies;
 * list items keep their list's key. At the top level (no key) a string is free
 * text and a list's items are under no known key.
 */
function valueEdits(
  text: string,
  node: JsonNode,
  key: string | undefined,
  errorHolder: boolean,
  inError: boolean,
  options: TextOptions,
  edits: Edit[],
): void {
  if (key === undefined) {
    switch (node.kind) {
      case "string": {
        const edit = stringEdit(text, node, { ...options, bareQuery: false });
        if (edit) edits.push(edit);
        return;
      }
      case "object":
        objectEdits(text, node, inError, options, edits);
        return;
      case "array":
        for (const item of node.items) valueEdits(text, item, "", false, inError, options, edits);
        return;
      case "deep":
        edits.push([node.start, node.end, JSON.stringify(TRUNCATED)]);
        return;
      default:
        return;
    }
  }
  const action = fieldAction(key, nodeValue(text, node), errorHolder);
  switch (action) {
    case "drop":
    case "redact":
      replaceNode(text, node, redactedJson(text, node, key), edits);
      return;
    case "secret":
      replaceNode(text, node, '"[redacted]"', edits);
      return;
    case "text":
    case "query": {
      if (node.kind !== "string") return;
      const edit = stringEdit(text, node, { ...options, bareQuery: action === "query" });
      if (edit) edits.push(edit);
      return;
    }
    case "walk": {
      const holder = inError || isErrorContainerKey(key);
      if (node.kind === "object") objectEdits(text, node, holder, options, edits);
      else if (node.kind === "array" && isStructuralKey(key)) {
        structuralEdits(text, node, key, options, edits);
      } else if (node.kind === "array") {
        for (const item of node.items) valueEdits(text, item, key, false, holder, options, edits);
      } else if (node.kind === "deep")
        edits.push([node.start, node.end, JSON.stringify(TRUNCATED)]);
      return;
    }
    default:
      return;
  }
}

function objectEdits(
  text: string,
  node: Extract<JsonNode, { kind: "object" }>,
  inError: boolean,
  options: TextOptions,
  edits: Edit[],
): void {
  const entries = node.members.map(
    (member) => [decodeJsonString(text, member.key), nodeValue(text, member.value)] as const,
  );
  const holder = isErrorShaped(entries, inError);
  let dataKeys = 0;
  node.members.forEach((member, index) => {
    const key = entries[index][0];
    if (isDataKey(key)) {
      // A key that is itself member text (`"Jane Doe": 1`): `[key]`, `[key:2]`, …
      dataKeys += 1;
      edits.push([
        member.key.start,
        member.key.end,
        JSON.stringify(dataKeys === 1 ? "[key]" : `[key:${dataKeys}]`),
      ]);
    } else {
      const keyEdit = stringEdit(text, member.key, { ...options, bareQuery: false });
      if (keyEdit) edits.push(keyEdit);
    }
    valueEdits(text, member.value, key, holder, false, options, edits);
  });
}

/**
 * Every span of `text` that parses as a JSON object or array (or the whole text
 * as one JSON string), scrubbed through the same field decision as the object
 * walk and written back where it stood: formatting is kept, only the scrubbed
 * values and keys change. When the parser's step budget runs out, the rest of
 * the text is cut (`[truncated]`): keys only the parser can read never go out raw.
 */
function redactJsonSpans(
  text: string,
  options: TextOptions,
): { text: string; spans: Array<readonly [number, number]> } {
  const spans: Array<readonly [number, number]> = [];
  if (!/[{["]/.test(text)) return { text, spans };
  const scan: JsonScan = { text, budget: 16 * text.length + 4096 };
  let out = "";
  let copied = 0;
  const emit = (node: JsonNode) => {
    const edits: Edit[] = [];
    valueEdits(text, node, undefined, false, false, options, edits);
    out += text.slice(copied, node.start);
    const begin = out.length;
    let at = node.start;
    for (const [start, end, replacement] of edits) {
      out += text.slice(at, start) + replacement;
      at = end;
    }
    out += text.slice(at, node.end);
    spans.push([begin, out.length]);
    copied = node.end;
  };

  const first = skipSpace(text, 0);
  if (text[first] === '"') {
    // The whole text is one JSON string: a body logged after JSON.stringify twice.
    const node = parseJsonString(scan, first);
    if (node && skipSpace(text, node.end) === text.length) {
      emit(node);
      return { text: out + text.slice(copied), spans };
    }
  }
  const open = /[{[]/g;
  for (let match = open.exec(text); match; match = open.exec(text)) {
    if (scan.budget <= 0) {
      // Fail closed: what the parser never reached may hold keys only it can read.
      out += text.slice(copied, match.index);
      spans.push([out.length, out.length + TRUNCATED.length]);
      return { text: out + TRUNCATED, spans };
    }
    const node = parseJsonValue(scan, match.index, 0);
    if (node) {
      emit(node);
      open.lastIndex = node.end;
    }
  }
  return { text: spans.length === 0 ? text : out + text.slice(copied), spans };
}

/** Applies `redact` to the text between the spans, leaving the spans as they are. */
function outsideSpans(
  text: string,
  spans: ReadonlyArray<readonly [number, number]>,
  redact: (segment: string) => string,
): string {
  if (spans.length === 0) return redact(text);
  let out = "";
  let at = 0;
  for (const [start, end] of spans) {
    out += redact(text.slice(at, start)) + text.slice(start, end);
    at = end;
  }
  return out + redact(text.slice(at));
}

// ---------------------------------------------------------------------------
// The text pipeline
// ---------------------------------------------------------------------------

/** Characters a string may be cut after: none of them can sit inside an address or an at-sign form. */
const CUT_AFTER = new Set(Array.from(" \t\r\n\"'`,()[]{}<>|/=?", (char) => char.charCodeAt(0)));

/** Cut to the cap, back to the last delimiter so no half address or key survives at the end. */
function truncate(value: string): string {
  if (value.length <= MAX_SCRUB_LENGTH) return value;
  let end = MAX_SCRUB_LENGTH;
  while (end > 0 && !CUT_AFTER.has(value.charCodeAt(end - 1))) end--;
  return `${value.slice(0, end)}${TRUNCATED}`;
}

/**
 * Fullwidth digits, letters and `＠ ＿ ． ＋ － ：` (U+FF10–FF1A, FF21–FF3A,
 * FF41–FF5A, FF20, FF3F, FF0E, FF0B, FF0D) read as ASCII, so every rule sees
 * `ｊａｎｅ＠ｇｍａｉｌ．ｃｏｍ`, `ｆｕｌｌ＿ｎａｍｅ:` and `０９１７`. Quotes,
 * backslashes, brackets, parentheses and commas are never folded: a member's own
 * `＂` would otherwise close her string and forge structure around it.
 */
const FULLWIDTH = /[０-：Ａ-Ｚａ-ｚ＠＿．＋－]/g;
const foldFullwidth = (text: string) =>
  text.replace(FULLWIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

function scrubText(value: string, options: TextOptions): string {
  let text = foldFullwidth(
    (value.length > MAX_JSON_PARSE_LENGTH ? truncate(value) : value).normalize("NFC"),
  );
  text = text.replace(DATA_URI, "[data-uri]");
  text =
    options.bareQuery || BARE_QUERY.test(text) ? redactBareQuery(text) : redactQueryPairs(text);
  for (const rule of TEXT_RULES) text = rule(text, options);
  const json = redactJsonSpans(text, options);
  text = outsideSpans(json.text, json.spans, redactFreeTextPairs);
  return truncate(text);
}

/** Redacts personal data and credentials in free text, URLs and JSON included. */
export function scrubString(value: string, options?: ScrubOptions): string {
  return scrubText(value, textOptions(options));
}

/** Like `scrubString`, for a query string that may lack its leading `?` (`a=1&b=2`). */
export function scrubQueryString(value: string, options?: ScrubOptions): string {
  return scrubText(value, textOptions(options, true));
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

/** Error properties worth keeping even when they are not enumerable (Postgres code, hint, details; HTTP status). */
const ERROR_FIELDS = ["code", "details", "hint", "status", "statusCode"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Walk state. `active` holds the nodes on the current path: meeting one again is
 * a cycle. `done` memoizes finished nodes, so a node reachable along many paths
 * (a diamond, a React fiber, a DOM node) is scrubbed once and the walk stays
 * linear in the size of the graph; a shared reference still appears in full.
 */
interface WalkState {
  active: WeakSet<object>;
  done: WeakMap<object, unknown>;
  text: TextOptions;
}

const walkState = (options: ScrubOptions | undefined): WalkState => ({
  active: new WeakSet(),
  done: new WeakMap(),
  text: textOptions(options),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Own enumerable properties; one whose getter throws is `[unreadable]` instead of failing the report. */
function ownEntries(value: object): Array<readonly [string, unknown]> {
  const entries: Array<readonly [string, unknown]> = [];
  for (const key of Object.keys(value)) {
    try {
      entries.push([key, (value as Record<string, unknown>)[key]]);
    } catch {
      entries.push([key, UNREADABLE]);
    }
  }
  return entries;
}

function applyAction(
  action: FieldAction,
  key: string,
  value: unknown,
  depth: number,
  state: WalkState,
): unknown {
  switch (action) {
    case "keep":
      return typeof value === "bigint" ? String(value) : value;
    case "secret":
      return "[Filtered]";
    case "drop":
    case "redact":
      return redactedMarker(key, value);
    case "text":
      return scrubText(String(value), state.text);
    case "query":
      return scrubText(String(value), { ...state.text, bareQuery: true });
    case "function":
      return "[function]";
    case "walk":
      return walk(value, depth + 1, state, key, isErrorContainerKey(key));
  }
}

/**
 * The name each key of one object is sent under: scrubbed text, or `[key]`,
 * `[key:2]`, … for a key that is itself member text (`"Jane Doe"`, `jane.doe88`).
 */
function keyNamer(state: WalkState): (key: string) => string {
  let dataKeys = 0;
  return (key) => {
    if (!isDataKey(key)) return scrubText(key, state.text);
    dataKeys += 1;
    return dataKeys === 1 ? "[key]" : `[key:${dataKeys}]`;
  };
}

/**
 * An object's own fields through the field decision. `textKeys` (normalized) are
 * fields of Sentry's own structure (`message` of a breadcrumb, `type` of an
 * exception) that are text, not data.
 */
function walkFields(
  entries: ReadonlyArray<readonly [string, unknown]>,
  depth: number,
  state: WalkState,
  errorHolder: boolean,
  textKeys?: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const nameOf = keyNamer(state);
  for (const [key, child] of entries) {
    const name = nameOf(key);
    if (textKeys?.has(normalizeKey(key)) && typeof child === "string") {
      out[name] = scrubText(child, state.text);
      continue;
    }
    const action = fieldAction(key, child, errorHolder);
    if (action === "drop") continue;
    out[name] = applyAction(action, key, child, depth, state);
  }
  return out;
}

/**
 * An Error: its message and stack stay readable, its name when it is an error
 * class (`e.name = "Jane Doe"` is not); every other own property is a field
 * (`title`, `description`, `detail` under the member rule).
 */
function walkError(error: Error, depth: number, state: WalkState): Record<string, unknown> {
  const rawName: unknown = error.name;
  const nameKept = isErrorClassName(rawName);
  let stack = typeof error.stack === "string" ? error.stack : "";
  // The stack's first line starts with the name.
  if (!nameKept && typeof rawName === "string" && rawName !== "" && stack.startsWith(rawName)) {
    stack = `[redacted]${stack.slice(rawName.length)}`;
  }
  const out: Record<string, unknown> = {
    name: nameKept
      ? rawName
      : typeof rawName === "string"
        ? "[redacted]"
        : walk(rawName, depth + 1, state, "name"),
    message:
      typeof error.message === "string"
        ? scrubText(error.message, state.text)
        : walk(error.message, depth + 1, state, "message"),
    ...(stack ? { stack: scrubText(stack, state.text) } : {}),
  };
  const fields: Array<readonly [string, unknown]> = [];
  for (const field of ERROR_FIELDS) {
    const raw = (error as unknown as Record<string, unknown>)[field];
    if (typeof raw === "string" || typeof raw === "number") fields.push([field, raw]);
  }
  for (const [key, child] of ownEntries(error)) {
    if (!(key in out) && !fields.some(([field]) => field === key)) fields.push([key, child]);
  }
  Object.assign(out, walkFields(fields, depth, state, true));
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && !("cause" in out)) {
    out.cause = walk(cause, depth + 1, state, "cause", true);
  }
  return out;
}

/** A Date, Map or Set that carries own properties keeps them, scrubbed, beside its value. */
function withOwnFields(value: object, base: unknown, depth: number, state: WalkState): unknown {
  const own = ownEntries(value);
  if (own.length === 0) return base;
  const fields = walkFields(own, depth, state, false);
  return isRecord(base) ? { ...base, ...fields } : { value: base, ...fields };
}

/**
 * `key`: the field this value sits under (list items keep their list's key; `""`
 * is "no known key", undefined is the top level). `inError`: the value sits under
 * an error key (`error`, `errors`, `cause`).
 */
function walkObject(
  value: object,
  depth: number,
  state: WalkState,
  key: string | undefined,
  inError: boolean,
): unknown {
  // Headers first: Bun's Headers has a toJSON that would hide them from the header allowlist.
  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return scrubHeaders([...value.entries()], depth, state);
  }
  // `toJSON` decides what a serializer sends: resolve it first (a Date's is its time).
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function" && !(value instanceof Date) && !(value instanceof Error)) {
    const resolved: unknown = toJSON.call(value, key ?? "");
    if (resolved !== value) return walk(resolved, depth + 1, state, key, inError);
  }
  if (value instanceof Date || value instanceof RegExp) {
    const text =
      value instanceof RegExp || Number.isNaN(value.getTime())
        ? String(value)
        : value.toISOString();
    return withOwnFields(value, Object.keys(value).length === 0 ? value : text, depth, state);
  }
  if (value instanceof Map) {
    return withOwnFields(
      value,
      walk(Object.fromEntries(value), depth + 1, state, undefined, inError),
      depth,
      state,
    );
  }
  const listKey = key ?? "";
  if (value instanceof Set) {
    const items = [...value].map((item) => walk(item, depth + 1, state, listKey, inError));
    return withOwnFields(value, items, depth, state);
  }
  if (Array.isArray(value) && isStructuralKey(listKey)) {
    // A TanStack Query key: its namespace, numbers, booleans and UUIDs (`structuralKey`).
    return value.map((item, index) =>
      index === 0 && typeof item === "string"
        ? scrubText(item, state.text)
        : typeof item === "object" && item !== null
          ? "[redacted]"
          : walk(item, depth + 1, state, listKey, inError),
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, depth + 1, state, listKey, inError));
  }
  if (value instanceof Error) return walkError(value, depth, state);
  const entries = ownEntries(value);
  return walkFields(entries, depth, state, isErrorShaped(entries, inError));
}

function walk(
  value: unknown,
  depth: number,
  state: WalkState,
  key?: string,
  inError = false,
): unknown {
  if (value === null || typeof value !== "object") {
    if (key === undefined) {
      if (typeof value === "string") return scrubText(value, state.text);
      if (typeof value === "function") return "[function]";
      return typeof value === "bigint" ? String(value) : value;
    }
    const action = fieldAction(key, value, false);
    return applyAction(action, key, value, depth, state);
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "[binary]";
  if (typeof URL !== "undefined" && value instanceof URL) {
    return key === undefined
      ? scrubText(value.href, state.text)
      : walk(value.href, depth, state, key);
  }
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) {
    return key === undefined
      ? scrubText(value.toString(), { ...state.text, bareQuery: true })
      : walk(value.toString(), depth, state, key);
  }
  if (state.active.has(value)) return "[Circular]";
  if (state.done.has(value)) return state.done.get(value);
  if (depth > MAX_DEPTH) return TRUNCATED;

  state.active.add(value);
  try {
    let result: unknown;
    try {
      result = walkObject(value, depth, state, key, inError);
    } catch {
      // A revoked Proxy, a throwing toJSON or getter: this value goes, never raw; the report stays.
      result = UNREADABLE;
    }
    state.done.set(value, result);
    return result;
  } finally {
    state.active.delete(value);
  }
}

/** Deep copy of `value`: structured data through the key allowlist, text through the text scrubber. */
export function scrubValue(value: unknown, options?: ScrubOptions): unknown {
  return walk(value, 0, walkState(options));
}

// ---------------------------------------------------------------------------
// Sentry items
// ---------------------------------------------------------------------------

/** Sentry's own metadata (the SDK, its packages and integrations, module versions): text, field by field. */
function sentryText(value: unknown, state: WalkState, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value, state.text);
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") {
    return typeof value === "object" && value !== null ? TRUNCATED : value;
  }
  if (Array.isArray(value)) return value.map((item) => sentryText(item, state, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, child] of ownEntries(value)) {
    out[scrubText(key, state.text)] = sentryText(child, state, depth + 1);
  }
  return out;
}

/** Sentry's `request.query_string` can also be an object or a list of pairs. */
function scrubQueryStringField(value: unknown, state: WalkState): unknown {
  if (typeof value === "string") return scrubText(value, { ...state.text, bareQuery: true });
  if (Array.isArray(value)) {
    return value.map((pair) =>
      Array.isArray(pair) && pair.length === 2
        ? [pair[0], redactQueryValue(String(pair[0]), String(pair[1] ?? ""))]
        : "[redacted]",
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      ownEntries(value).map(([key, val]) => [key, redactQueryValue(key, String(val ?? ""))]),
    );
  }
  return value;
}

const keySet = (keys: string) => new Set(keys.split(" ")) as ReadonlySet<string>;

/** Fields the SDK writes in its own contexts; any other field, and any other context, is data. */
const SDK_CONTEXT_FIELDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["os", keySet("name version build kernelversion rawdescription")],
  ["clientos", keySet("name version build kernelversion rawdescription")],
  ["browser", keySet("name version")],
  ["runtime", keySet("name version rawdescription")],
  ["clientruntime", keySet("name version rawdescription")],
  [
    "device",
    keySet(
      "model family brand manufacturer modelid arch memorysize freememory processorcount processorfrequency cpudescription boottime screenresolution screendensity screendpi simulator orientation batterylevel charging online lowmemory storagesize freestorage",
    ),
  ],
  ["trace", keySet("traceid spanid parentspanid op status origin")],
  ["culture", keySet("locale timezone calendar is24hourformat displayname")],
]);

function scrubContexts(
  contexts: Record<string, unknown>,
  state: WalkState,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const nameOf = keyNamer(state);
  for (const [name, context] of ownEntries(contexts)) {
    const fields = SDK_CONTEXT_FIELDS.get(normalizeKey(name));
    let value: unknown;
    if (fields && isRecord(context)) {
      const scrubbed: Record<string, unknown> = {};
      for (const [field, child] of ownEntries(context)) {
        const normalized = normalizeKey(field);
        if (normalizeKey(name) === "device" && normalized === "name") continue;
        if (fields.has(normalized) && typeof child !== "object") {
          scrubbed[field] = typeof child === "string" ? scrubText(child, state.text) : child;
          continue;
        }
        const action = fieldAction(field, child, false);
        if (action !== "drop") scrubbed[field] = applyAction(action, field, child, 2, state);
      }
      value = scrubbed;
    } else {
      value = walk(context, 1, state);
    }
    out[nameOf(name)] = value;
  }
  return out;
}

const FRAME_PATH_FIELDS = keySet("filename abspath module function");
const FRAME_SOURCE_FIELDS = keySet("contextline precontext postcontext");

/** A stack frame: file names keep their path (source maps match on them), source lines are text, `vars` are data. */
function scrubFrame(frame: unknown, state: WalkState): unknown {
  if (!isRecord(frame)) return walk(frame, 3, state, "");
  const pathOptions = { ...state.text, paths: false };
  const out: Record<string, unknown> = {};
  for (const [field, child] of ownEntries(frame)) {
    const normalized = normalizeKey(field);
    if (FRAME_PATH_FIELDS.has(normalized) && typeof child === "string") {
      out[field] = scrubText(child, pathOptions);
    } else if (FRAME_SOURCE_FIELDS.has(normalized)) {
      out[field] = sentryText(child, state);
    } else if (typeof child !== "object" || child === null) {
      // lineno, colno, in_app, platform, instruction_addr: positions and flags.
      out[field] = typeof child === "string" ? scrubText(child, pathOptions) : child;
    } else {
      out[field] = walk(child, 3, state, field);
    }
  }
  return out;
}

/**
 * Exception types the SDK writes for what is not an Error: `UnhandledRejection`,
 * an event's constructor (`Event`, `CustomEvent`, `PromiseRejectionEvent`), `<unknown>`.
 * src: @sentry/browser 10.75.2 eventFromException, run on an Event and a CustomEvent · 2026-10-07
 */
const SDK_EXCEPTION_TYPE = /^(?:(?:[A-Z][A-Za-z0-9]{0,60})?(?:Event|Rejection)|<unknown>)$/;

function scrubExceptionValue(value: unknown, state: WalkState): unknown {
  if (!isRecord(value)) return walk(value, 2, state, "");
  const out: Record<string, unknown> = {};
  for (const [field, child] of ownEntries(value)) {
    const normalized = normalizeKey(field);
    if (normalized === "type" && typeof child === "string") {
      // The type is the error's name: an error class or an SDK type, never `e.name = "Jane Doe"`.
      out[field] =
        isErrorClassName(child) || SDK_EXCEPTION_TYPE.test(child)
          ? scrubText(child, state.text)
          : "[redacted]";
    } else if ((normalized === "value" || normalized === "module") && typeof child === "string") {
      out[field] = scrubText(child, state.text);
    } else if (normalized === "stacktrace" && isRecord(child)) {
      const stacktrace: Record<string, unknown> = {};
      for (const [part, partValue] of ownEntries(child)) {
        stacktrace[part] =
          part === "frames" && Array.isArray(partValue)
            ? partValue.map((frame) => scrubFrame(frame, state))
            : walk(partValue, 3, state, part);
      }
      out[field] = stacktrace;
    } else {
      const action = fieldAction(field, child, true);
      if (action !== "drop") out[field] = applyAction(action, field, child, 2, state);
    }
  }
  return out;
}

const REQUEST_TEXT = keySet("url method");

/**
 * Headers whose values are kept (scrubbed as text): the SDK's own allowlist
 * (sentry-options `dataCollection.httpHeaders`) plus tracing, caching and
 * content negotiation. A `referer` keeps its route; the path rules still run.
 */
const SAFE_HEADERS = keySet(
  "accept accept-encoding accept-language baggage cache-control content-encoding content-length content-type host origin referer sentry-trace traceparent tracestate user-agent x-request-id x-vercel-cache x-vercel-id",
);

/**
 * Request headers, on the event or as a `Headers` object: kept only from the
 * header allowlist. Credentials become `[Filtered]`, IP-bearing headers go, any
 * other value is `[redacted]`.
 */
function scrubHeaders(
  entries: ReadonlyArray<readonly [string, unknown]>,
  depth: number,
  state: WalkState,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const nameOf = keyNamer(state);
  for (const [header, value] of entries) {
    if (isIdentifyingKey(header)) continue;
    const name = nameOf(header);
    if (value === undefined || value === null || value === "") out[name] = value;
    else if (isSecretKey(header)) out[name] = "[Filtered]";
    else if (SAFE_HEADERS.has(header.toLowerCase()) && typeof value === "string") {
      out[name] = scrubText(value, state.text);
    } else if (SAFE_HEADERS.has(header.toLowerCase()) && Array.isArray(value)) {
      out[name] = walk(value, depth + 1, state);
    } else out[name] = "[redacted]";
  }
  return out;
}

function scrubRequest(request: unknown, state: WalkState): unknown {
  if (!isRecord(request)) return walk(request, 1, state, "request");
  const out: Record<string, unknown> = {};
  for (const [field, child] of ownEntries(request)) {
    const normalized = normalizeKey(field);
    if (normalized === "cookies") continue;
    if (REQUEST_TEXT.has(normalized) && typeof child === "string") {
      out[field] = scrubText(child, state.text);
    } else if (normalized === "querystring") {
      out[field] = scrubQueryStringField(child, state);
    } else if (normalized === "headers" && isRecord(child)) {
      out[field] = scrubHeaders(ownEntries(child), 1, state);
    } else {
      // `data` (a body, string or object) and `env` are data on the allowlist.
      const action = fieldAction(field, child, false);
      if (action !== "drop") out[field] = applyAction(action, field, child, 1, state);
    }
  }
  return out;
}

function scrubDebugMeta(meta: unknown, state: WalkState): unknown {
  if (!isRecord(meta) || !Array.isArray(meta.images)) return sentryText(meta, state);
  const pathOptions = { ...state.text, paths: false };
  return {
    ...meta,
    images: meta.images.map((image) => {
      if (!isRecord(image)) return sentryText(image, state);
      const out: Record<string, unknown> = {};
      for (const [field, child] of ownEntries(image)) {
        out[field] =
          normalizeKey(field) === "debugid"
            ? child
            : typeof child === "string"
              ? scrubText(child, pathOptions)
              : child;
      }
      return out;
    }),
  };
}

const CRUMB_TEXT = keySet("category type level message");

/**
 * One breadcrumb: its category, type, level and message are text; `data` is
 * data. A `ui.*` message is the clicked element: in the `beforeBreadcrumb` hook
 * it is rebuilt from the element in the hint, or redacted when there is none; in
 * the event pass only a message this module rebuilt survives.
 */
function scrubCrumb(
  crumb: Record<string, unknown>,
  hint: unknown,
  state: WalkState,
  pass: "hook" | "event",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, child] of ownEntries(crumb)) {
    const normalized = normalizeKey(field);
    if (CRUMB_TEXT.has(normalized) && typeof child === "string") {
      out[field] = scrubText(child, state.text);
    } else if (normalized === "data") {
      // Data under the key `data`: an object is walked field by field; a string
      // (or a toJSON that gives one) is data under an unknown key, so it goes.
      out[field] = walk(child, 1, state, "data");
    } else {
      const action = fieldAction(field, child, false);
      if (action !== "drop") out[field] = applyAction(action, field, child, 1, state);
    }
  }
  const { category, message } = crumb;
  if (typeof category === "string" && category.startsWith("ui.")) {
    if (pass === "hook") {
      const selector = selectorFromElement(hintTarget(hint));
      if (selector !== undefined) out.message = selector;
      else if (message !== undefined) out.message = "[redacted]";
    } else if (message !== undefined) {
      out.message =
        typeof message === "string" && isRebuiltSelector(message) ? message : "[redacted]";
    }
    const data = uiData(crumb.data);
    if (data) out.data = data;
    else delete out.data;
  }
  return out;
}

const SPAN_TEXT = keySet("description");

function scrubSpan(span: unknown, state: WalkState): unknown {
  return isRecord(span)
    ? walkFields(ownEntries(span), 2, state, false, SPAN_TEXT)
    : walk(span, 2, state, "");
}

/** Event fields with their own handling; everything else goes through the allowlist. */
const EVENT_TEXT = keySet("message transaction");
/** Set by the deploy, not by anyone's data: `mila-admin@1.2.3` is a release, not an address. */
const DEPLOY_FIELDS = keySet("release dist environment");

/**
 * Scrubs a Sentry event (error or transaction). The user is reduced to its id
 * alone and the server's host name is dropped. Cookies and IP-bearing headers are
 * dropped here, independent of the SDK's own settings. Sentry's own structure
 * (exception type, value and frames, the event and breadcrumb messages, SDK and
 * OS/browser/runtime context fields, release, ids) is read field by field; every
 * other field, `extra`, `tags` and custom contexts included, is data on the key
 * allowlist. The SDK's internal `sdkProcessingMetadata` is passed through
 * untouched; it is never serialized into the envelope and holds live scope objects.
 */
export function scrubEvent<T extends object>(event: T, options?: ScrubOptions): T {
  const state = walkState(options);
  const out: Record<string, unknown> = {};
  for (const [field, value] of ownEntries(event)) {
    if (value === undefined) continue;
    const normalized = normalizeKey(field);
    switch (normalized) {
      case "sdkprocessingmetadata":
        out[field] = value;
        continue;
      case "servername":
        continue;
      case "user": {
        const id = (value as { id?: unknown } | null)?.id;
        if ((typeof id === "string" && id !== "") || typeof id === "number") {
          out.user = { id: String(id) };
        }
        continue;
      }
      case "exception": {
        const values = isRecord(value) ? value.values : undefined;
        out[field] = Array.isArray(values)
          ? { values: values.map((item) => scrubExceptionValue(item, state)) }
          : walk(value, 1, state, field);
        continue;
      }
      case "breadcrumbs": {
        const list = Array.isArray(value) ? value : isRecord(value) ? value.values : undefined;
        const crumbs = Array.isArray(list)
          ? list.map((crumb) =>
              isRecord(crumb) ? scrubCrumb(crumb, undefined, state, "event") : "[redacted]",
            )
          : "[redacted]";
        out[field] = Array.isArray(value) ? crumbs : { values: crumbs };
        continue;
      }
      case "contexts":
        out[field] = isRecord(value) ? scrubContexts(value, state) : walk(value, 1, state, field);
        continue;
      case "request":
        out[field] = scrubRequest(value, state);
        continue;
      case "spans":
        out[field] = Array.isArray(value)
          ? value.map((span) => scrubSpan(span, state))
          : "[redacted]";
        continue;
      case "logentry":
        out[field] = isRecord(value)
          ? walkFields(ownEntries(value), 1, state, false, keySet("message"))
          : walk(value, 1, state, field);
        continue;
      case "sdk":
      case "modules":
        out[field] = sentryText(value, state);
        continue;
      case "debugmeta":
        out[field] = scrubDebugMeta(value, state);
        continue;
    }
    if (DEPLOY_FIELDS.has(normalized) && typeof value === "string") {
      out[field] = value;
    } else if (EVENT_TEXT.has(normalized) && typeof value === "string") {
      out[field] = scrubText(value, state.text);
    } else {
      const action = fieldAction(field, value, false);
      if (action !== "drop") out[field] = applyAction(action, field, value, 0, state);
    }
  }
  return out as T;
}

/**
 * Scrubs a breadcrumb's message and data (URLs, console arguments, clicked
 * elements, …). `hint` is what Sentry passes to `beforeBreadcrumb`: for a click,
 * the DOM event, whose element the selector is rebuilt from.
 */
export function scrubBreadcrumb<T extends object>(
  breadcrumb: T,
  hint?: unknown,
  options?: ScrubOptions,
): T {
  return scrubCrumb(breadcrumb as Record<string, unknown>, hint, walkState(options), "hook") as T;
}

/** Log attributes set by the deploy and the SDK, never by anyone's data. */
const LOG_DEPLOY_ATTRIBUTES = new Set([
  "sentry.release",
  "sentry.environment",
  "sentry.sdk.name",
  "sentry.sdk.version",
  // The staff member's Supabase id: the one identity Sentry keeps.
  "user.id",
]);

/** Scrubs a structured log's message and attributes; the server's host name is dropped. */
export function scrubLog<T extends { message: unknown; attributes?: Record<string, unknown> }>(
  log: T,
  options?: ScrubOptions,
): T {
  const state = walkState(options);
  let scrubbed: Record<string, unknown> | undefined;
  if (log.attributes) {
    const data: Array<readonly [string, unknown]> = [];
    const kept: Record<string, unknown> = {};
    for (const [key, value] of ownEntries(log.attributes)) {
      if (key === "server.address") continue;
      if (LOG_DEPLOY_ATTRIBUTES.has(key) && typeof value === "string") kept[key] = value;
      else data.push([key, value]);
    }
    scrubbed = { ...walkFields(data, 0, state, false), ...kept };
  }
  // `Sentry.logger.fmt` hands over a String object; the SDK sends String(message).
  const { message } = log;
  return {
    ...log,
    message:
      typeof message === "string" || message instanceof String
        ? scrubText(String(message), state.text)
        : message,
    ...(scrubbed ? { attributes: scrubbed } : {}),
  };
}

/**
 * A TanStack Query key reduced to what is safe to report: the namespace (first
 * part), numbers, booleans and UUIDs. Search text, table names and filter
 * objects are dropped: a key like ["admin:database-table", table, page, search]
 * carries whatever staff typed.
 */
export function structuralKey(key: readonly unknown[] | undefined): unknown[] | undefined {
  if (!Array.isArray(key)) return undefined;
  return key.filter(
    (part, index) =>
      (index === 0 && typeof part === "string") ||
      typeof part === "number" ||
      typeof part === "boolean" ||
      (typeof part === "string" && UUID.test(part)),
  );
}

/**
 * Router `redirect()` and `notFound()` are thrown on purpose to steer
 * navigation. They are not errors and must not page anyone.
 */
export function isControlFlowThrow(value: unknown): boolean {
  return isRedirect(value) || isNotFound(value);
}
