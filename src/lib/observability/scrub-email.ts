/**
 * Email addresses in free text, found in one left-to-right pass.
 *
 * Every form of the at-sign counts: `@`, fullwidth `＠`, small `﹫`, `%40`,
 * `%2540` (and deeper), `&#64;` / `&#x40;` / `&commat;` and the JSON escape
 * `@`. A URL userinfo (`//user:pw@host`) counts as one too, so the user and
 * the password go with the host. The local part is the run of letters, marks,
 * digits and `._%+'-` before the at-sign; the domain is the whole run of labels
 * after it, whatever the last label is: no TLD is validated, so
 * `jane.doe@gmail.com.json` is one address and goes whole.
 *
 * The one exception is a Firefox or Safari stack frame, `fn@<url>`: when the
 * text after the at-sign starts with a URL scheme or a path, it is kept.
 *
 * Linear: the at-sign finder is a plain scan; each local part is read backwards
 * no further than the previous at-sign, and each domain forwards no further than
 * the next character that cannot be in a domain (every at-sign form starts with
 * one), so no character is read more than a fixed number of times. No
 * lookbehind (Safari before 16.4 cannot parse it).
 */

const AT_SIGN = /@|＠|﹫|%(?:25)*40|&#0*64;?|&#x0*40;?|&commat;|\\u0040/gi;
/** Cheap pre-check: text without any of these characters holds no at-sign form. */
const AT_SIGN_HINT = /[@＠﹫%&\\]/;
/** One character form of the at-sign: the only forms a URL userinfo ends with. */
const PLAIN_AT_SIGN = /^[@＠﹫]$/;

/** After the at-sign of a stack frame: a URL scheme or a bundler path. */
const STACK_FRAME_TARGET =
  /^(?:https?:|file:|webpack(?:-internal)?:|moz-extension:|chrome-extension:|safari(?:-web)?-extension:|blob:|app:|\/)/i;

/** The domain: labels of letters, marks, digits, `_` and `-`, joined by dots. */
const DOMAIN_RUN = /[\p{L}\p{M}\p{N}_-]+(?:\.[\p{L}\p{M}\p{N}_-]+)*/uy;
const NON_ASCII_LOCAL = /^[\p{L}\p{M}\p{N}’]$/u;
const NON_ASCII_USERINFO = /^[\p{L}\p{M}\p{N}]$/u;
const HEX4 = /^u[0-9A-Fa-f]{4}/;

const asciiTable = (chars: RegExp) => {
  const table = new Array<boolean>(128);
  for (let code = 0; code < 128; code++) table[code] = chars.test(String.fromCharCode(code));
  return table;
};
const LOCAL_ASCII = asciiTable(/[A-Za-z0-9._%+'~!$*^-]/);
const USERINFO_ASCII = asciiTable(/[A-Za-z0-9._~%!$&'()*+,;=:-]/);
/** Characters a local part may start with but an address never does: a quote or dots before it. */
const LEADING_PUNCTUATION = /['’.]/;

/** The character (one code point) that ends at `end`, and its length in UTF-16 units. */
function charBefore(text: string, end: number, floor: number): string {
  const low = text.charCodeAt(end - 1);
  if (low >= 0xdc00 && low <= 0xdfff && end - 2 >= floor) {
    const high = text.charCodeAt(end - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(end - 2, end);
  }
  return text[end - 1];
}

function isLocalChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 128 ? LOCAL_ASCII[code] : NON_ASCII_LOCAL.test(char);
}

/** Start of the local part that ends at `at`, never before `floor`. */
function localStart(text: string, at: number, floor: number): number {
  let start = at;
  while (start > floor) {
    const char = charBefore(text, start, floor);
    if (isLocalChar(char)) {
      start -= char.length;
    } else if (char === "\\" && HEX4.test(text.slice(start, start + 5))) {
      // A JSON \u escape inside the name: its `u` and hex digits were already read as letters.
      start -= 1;
    } else {
      break;
    }
  }
  // A backslash escape before the name (`\njane@…` in JSON text) owns its letter.
  if (start > floor && start < at && text[start - 1] === "\\") start += 1;
  while (start < at && LEADING_PUNCTUATION.test(text[start])) start += 1;
  return start;
}

/** Start of a URL userinfo (`//user:pw@`) that ends at `at`, or -1 when there is none. */
function userinfoStart(text: string, at: number, floor: number): number {
  let start = at;
  let colon = false;
  while (start > floor) {
    const char = charBefore(text, start, floor);
    const code = char.charCodeAt(0);
    if (code < 128 ? !USERINFO_ASCII[code] : !NON_ASCII_USERINFO.test(char)) break;
    if (char === ":") colon = true;
    start -= char.length;
  }
  return colon && start >= 2 && text[start - 1] === "/" && text[start - 2] === "/" ? start : -1;
}

/** Longest quoted local part (`"jane doe"@…`) or domain literal (`…@[10.0.0.1]`) read. */
const MAX_QUOTED = 64;
const DOMAIN_LITERAL = /^\[(?:IPv6:)?[0-9A-Fa-f.:]{2,60}\]/;
/** `react-dom@19.1.0-rc.1`, `@sentry/browser@10.75.2`: a package version, never an address. */
const VERSION = /^\d+\.\d+(?:\.\d+)?(?:-[\p{L}\p{N}.-]+)?$/u;

/** Start of a quoted local part ending at `at` (`"jane doe"@`), or -1. */
function quotedLocalStart(text: string, at: number, floor: number): number {
  if (text[at - 1] !== '"') return -1;
  for (let i = at - 2; i >= floor && i >= at - 2 - MAX_QUOTED; i--) {
    const char = text[i];
    if (char === "\n" || char === "\r") return -1;
    if (char === '"') return i < at - 2 ? i : -1;
  }
  return -1;
}

/** End of the domain after the at-sign: a label run, or a bracketed IP literal. */
function domainEnd(text: string, after: number, userinfo: boolean): number {
  if (text[after] === "[") {
    const literal = DOMAIN_LITERAL.exec(text.slice(after, after + MAX_QUOTED + 2));
    return literal ? after + literal[0].length : after;
  }
  DOMAIN_RUN.lastIndex = after;
  const domain = DOMAIN_RUN.exec(text);
  if (!domain) return after;
  return !userinfo && VERSION.test(domain[0]) ? after : after + domain[0].length;
}

/** Replaces every email address (and URL userinfo with its host) with `[email]`. */
export function redactEmails(text: string): string {
  if (!AT_SIGN_HINT.test(text)) return text;
  let out = "";
  let copied = 0;
  // Nothing before `floor` belongs to a later address: it is the previous at-sign or a redaction.
  let floor = 0;
  AT_SIGN.lastIndex = 0;
  for (let match = AT_SIGN.exec(text); match; match = AT_SIGN.exec(text)) {
    const at = match.index;
    const after = at + match[0].length;
    if (at < floor) continue;
    // A userinfo may hold an encoded at-sign (`pa%40ss@host`): it is read back to the
    // last redaction, but never past a plain at-sign (not a userinfo character).
    const userinfo = PLAIN_AT_SIGN.test(match[0]) ? userinfoStart(text, at, copied) : -1;
    const quoted = userinfo === -1 ? quotedLocalStart(text, at, floor) : -1;
    const start = userinfo !== -1 ? userinfo : quoted !== -1 ? quoted : localStart(text, at, floor);
    const end = domainEnd(text, after, userinfo !== -1);
    // An encoded at-sign inside a URL password (`//user:pa%40ss@host`): the plain
    // at-sign right after it ends the userinfo, and takes the whole of it.
    const insideUserinfo =
      userinfo === -1 &&
      PLAIN_AT_SIGN.test(text.charAt(end)) &&
      userinfoStart(text, end, copied) !== -1;
    const isAddress =
      userinfo !== -1 ||
      (!insideUserinfo &&
        start < at &&
        end > after &&
        !STACK_FRAME_TARGET.test(text.slice(after, after + 24)));
    if (!isAddress) {
      floor = after;
      continue;
    }
    out += `${text.slice(copied, start)}[email]`;
    copied = end;
    floor = end;
    if (AT_SIGN.lastIndex < end) AT_SIGN.lastIndex = end;
  }
  return copied === 0 ? text : out + text.slice(copied);
}
