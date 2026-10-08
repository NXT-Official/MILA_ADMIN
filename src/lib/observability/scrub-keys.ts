/**
 * Which keys carry what, for everything ./scrub sends to Sentry.
 *
 * Structured data (an object, JSON text, a Map, an array) is kept on a key
 * ALLOWLIST: a value survives only under a debug key (codes, statuses, routes,
 * methods, kinds, tables, counts, durations, timestamps, ids) and only in that
 * key's shape. Any other string becomes `[redacted]` (`[redacted:<length>]` only
 * for a long value under a key that is not a member field); a number stays
 * unless it is shaped like a phone number; booleans stay. The member-field list
 * is a second layer: under those keys a value goes whatever its type. A key can
 * itself be data (a name, a handle, an address used as a key): it becomes `[key]`.
 *
 * One decision (`fieldAction`) serves the object walk and the JSON text pass, so
 * a field is treated the same in an object, in JSON text and in JSON nested
 * inside a JSON string.
 */

/** Case, separators and compatibility forms do not matter: `Full-Name`, `fullName`, `ＦＵＬＬ_NAME`. */
export function normalizeKey(key: string): string {
  return key
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** A key's words: `sentry.trace.parent_span_id` and `parentSpanId` both end in `id`. */
function keyWords(key: string): string[] {
  return key
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const SECRET_KEYS = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "tokenhash",
  "auth",
  "authorization",
  "cookie",
  "cookies",
  "setcookie",
  "apikey",
  "jwt",
  "otp",
  "servicerolekey",
  "privatekey",
  "secretkey",
  "accesskey",
  "signingkey",
  "clientsecret",
  "sessionid",
]);

export function isSecretKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SECRET_KEYS.has(normalized) ||
    normalized.startsWith("xsupabase") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("cookie") ||
    normalized.endsWith("authorization")
  );
}

/** Keys whose values are whatever someone typed into a search box. */
export const USER_INPUT_KEYS: ReadonlySet<string> = new Set([
  "search",
  "searchterm",
  "searchquery",
  "q",
  "query",
  "term",
  "keyword",
  "keywords",
]);

/**
 * Member profile and content fields: under these a value goes whatever its type
 * (a numeric phone, an address object). The allowlist already redacts their
 * strings; this list also catches numbers, booleans and objects.
 */
export const MEMBER_FIELD_KEYS: ReadonlySet<string> = new Set([
  "fullname",
  "firstname",
  "lastname",
  "name",
  "displayname",
  "username",
  "email",
  "phone",
  "phonenumber",
  "address",
  "street",
  "defaultlocation",
  "location",
  "city",
  "caption",
  "content",
  "body",
  "message",
  "bio",
  "gender",
  "heightcm",
  "weightkg",
  "birthday",
  "dateofbirth",
  "dob",

  "middlename",
  "authorname",
  "membername",
  "mobile",
  "mobilenumber",
  "streetaddress",
  "birthdate",
  // Error text that is a member's text as often as not (a concierge chat title,
  // a problem+json detail): redacted even on an error.
  "title",
  "description",
  "detail",
]);

/**
 * The text of an error: readable inside an error-shaped object (`name` only when
 * it is an error class), redacted anywhere else.
 */
export const ERROR_TEXT_KEYS: ReadonlySet<string> = new Set([
  "message",
  "msg",
  "name",
  "errormessage",
  "errordescription",
  "details",
  "hint",
  "stack",
]);

/** Error fields under the member rule (always redacted) that still do not make an error a row. */
const ERROR_NEUTRAL_KEYS: ReadonlySet<string> = new Set(["title", "description", "detail"]);

const ERROR_CLASS_NAME = /^(?:[A-Z][A-Za-z0-9]{0,60})?(?:Error|Exception)$/;

/** `TypeError`, `PostgrestError`, `AuthApiError`: an error's class, never a person. */
export function isErrorClassName(value: unknown): boolean {
  return typeof value === "string" && ERROR_CLASS_NAME.test(value);
}

/** A Postgres, PostgREST, Supabase Auth, Node or HTTP error code; anything else under `code` is a credential. */
export const ERROR_CODE =
  /^(?:[A-Z][A-Z0-9_]{1,39}|[0-9][0-9A-Z]{4}|[a-z]+(?:_[a-z0-9]+)+|\d{1,4})$/;

// ---------------------------------------------------------------------------
// The debug-key allowlist
// ---------------------------------------------------------------------------

/**
 * What a debug key's value may look like. `text` and `query` are free text (the
 * text scrubber still runs); `list` is a list of ids and words (`params`,
 * `fingerprint`, log parameters); `structural` is a TanStack Query key, kept
 * only as its namespace, numbers, booleans and UUIDs.
 */
type Shape =
  | "text"
  | "query"
  | "word"
  | "code"
  | "id"
  | "path"
  | "count"
  | "time"
  | "version"
  | "reason"
  | "list"
  | "structural";

type PatternShape = Exclude<Shape, "text" | "query" | "reason" | "list" | "structural">;

const SHAPES: Record<PatternShape, RegExp> = {
  /** An enum value or a dotted name: `active`, `member.credits_granted`, `auto.function`. */
  word: /^[A-Za-z0-9][\w.:/-]{0,63}$/,
  code: ERROR_CODE,
  /**
   * A UUID, a hex or numeric id, a Vercel request id, or a prefixed id of 20 to 64
   * characters holding a digit (`ctm_01h8…`, 26 after the prefix): `maria_santos88`
   * is a handle, not an id.
   */
  id: /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{8,64}|\d{1,19}|[a-z]{2,8}_(?=[0-9a-z]{0,63}\d)[0-9a-z]{20,64}|[a-z0-9]{2,8}(?:::[a-z0-9]{2,8})*::[a-z0-9]+-\d+-[0-9a-f]+)$/i,
  /** A path, a URL or a query: the text rules still run over it. */
  path: /^(?:\/|https?:\/\/|\?|#)\S{0,4000}$/,
  count: /^-?\d{1,19}(?:\.\d+)?$/,
  time: /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
  version: /^v?\d+(?:\.\d+){0,3}(?:[-+][\w.-]{1,40})?$/,
};

/**
 * HTTP reason phrases (RFC 9110 and the IANA registry, with older spellings): a
 * `statusText` is one of these or it is not a status text.
 */
const HTTP_REASON_PHRASES: ReadonlySet<string> = new Set([
  "continue",
  "switching protocols",
  "processing",
  "early hints",
  "ok",
  "created",
  "accepted",
  "non-authoritative information",
  "no content",
  "reset content",
  "partial content",
  "multi-status",
  "already reported",
  "im used",
  "multiple choices",
  "moved permanently",
  "found",
  "see other",
  "not modified",
  "use proxy",
  "temporary redirect",
  "permanent redirect",
  "bad request",
  "unauthorized",
  "payment required",
  "forbidden",
  "not found",
  "method not allowed",
  "not acceptable",
  "proxy authentication required",
  "request timeout",
  "conflict",
  "gone",
  "length required",
  "precondition failed",
  "content too large",
  "payload too large",
  "request entity too large",
  "uri too long",
  "request-uri too long",
  "unsupported media type",
  "range not satisfiable",
  "requested range not satisfiable",
  "expectation failed",
  "i'm a teapot",
  "misdirected request",
  "unprocessable content",
  "unprocessable entity",
  "locked",
  "failed dependency",
  "too early",
  "upgrade required",
  "precondition required",
  "too many requests",
  "request header fields too large",
  "unavailable for legal reasons",
  "internal server error",
  "not implemented",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "http version not supported",
  "variant also negotiates",
  "insufficient storage",
  "loop detected",
  "not extended",
  "network authentication required",
]);

/** Sentry's fingerprint variables: `{{ default }}`, `{{ transaction }}`. */
const SENTRY_TEMPLATE = /^\{\{ ?[\w.]{1,40} ?\}\}$/;

const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shapeFits(shape: Shape, value: string): boolean {
  switch (shape) {
    case "text":
    case "query":
      return true;
    case "reason":
      return HTTP_REASON_PHRASES.has(value.toLowerCase());
    case "list":
      return SHAPES.id.test(value) || SHAPES.word.test(value) || SENTRY_TEMPLATE.test(value);
    case "structural":
      return UUID_VALUE.test(value);
    default:
      return SHAPES[shape].test(value);
  }
}

/**
 * Keys the admin's own logs and Sentry's SDK use (grep of src/ for console.*,
 * captureError extra/tags, logger and addBreadcrumb, plus Sentry's breadcrumb,
 * span and log attributes). Normalized: `target_type` and `targetType` are one.
 */
const DEBUG_KEYS: ReadonlyMap<string, Shape> = new Map<string, Shape>([
  // Free text: error strings and console arguments (the same text the log body carries).
  ["error", "text"],
  ["err", "text"],
  ["arguments", "text"],
  ["sentrymessagetemplate", "text"],
  // Lists of ids and words; a TanStack Query key keeps only its structure.
  ["params", "list"],
  ["fingerprint", "list"],
  ["querykey", "structural"],
  ["mutationkey", "structural"],
  // Codes and statuses.
  ["code", "code"],
  ["errorcode", "code"],
  ["sqlstate", "code"],
  ["pgcode", "code"],
  ["authcode", "code"],
  ["status", "word"],
  ["statuscode", "count"],
  ["statustext", "reason"],
  ["statusmessage", "reason"],
  ["errno", "count"],
  ["syscall", "word"],
  // What happened, and where.
  ["kind", "word"],
  ["type", "word"],
  ["method", "word"],
  ["table", "word"],
  ["schema", "word"],
  ["function", "word"],
  ["functionname", "word"],
  ["fn", "word"],
  ["step", "word"],
  ["operation", "word"],
  ["op", "word"],
  ["origin", "word"],
  ["event", "word"],
  ["policy", "word"],
  ["action", "word"],
  ["targettype", "word"],
  ["source", "word"],
  ["level", "word"],
  ["logger", "word"],
  ["app", "word"],
  ["runtime", "word"],
  ["environment", "word"],
  ["platform", "word"],
  ["mechanism", "word"],
  ["handled", "word"],
  ["unit", "word"],
  ["component", "word"],
  ["componentname", "word"],
  ["uicomponentname", "word"],
  ["severity", "word"],
  ["locale", "word"],
  ["timezone", "word"],
  ["sentryop", "word"],
  ["sentryorigin", "word"],
  ["sentrysource", "word"],
  ["otelkind", "word"],
  ["dbsystem", "word"],
  ["serveraddress", "word"],
  // Routes and URLs (the path and query rules still run over them).
  ["url", "path"],
  ["href", "path"],
  ["from", "path"],
  ["to", "path"],
  ["path", "path"],
  ["pathname", "path"],
  ["route", "path"],
  ["routeid", "path"],
  ["referer", "path"],
  ["referrer", "path"],
  ["httpurl", "path"],
  ["urlfull", "path"],
  ["urlpath", "path"],
  ["httptarget", "path"],
  ["httproute", "path"],
  ["transaction", "path"],
  ["documentationurl", "path"],
  ["querystring", "query"],
  ["urlquery", "query"],
  ["httpquery", "query"],
  // Counts, sizes and durations.
  ["count", "count"],
  ["total", "count"],
  ["amount", "count"],
  ["page", "count"],
  ["limit", "count"],
  ["offset", "count"],
  ["size", "count"],
  ["length", "count"],
  ["attempt", "count"],
  ["attempts", "count"],
  ["retry", "count"],
  ["retries", "count"],
  ["duration", "count"],
  ["elapsed", "count"],
  ["timeout", "count"],
  ["latency", "count"],
  ["index", "count"],
  ["line", "count"],
  ["lineno", "count"],
  ["colno", "count"],
  ["port", "count"],
  ["depth", "count"],
  ["credits", "count"],
  ["totalcredits", "count"],
  ["dailyallowance", "count"],
  // Timestamps and versions.
  ["timestamp", "time"],
  ["time", "time"],
  ["ts", "time"],
  ["starttimestamp", "time"],
  ["version", "version"],
  ["sdkversion", "version"],
]);

/** Shapes by a key's last word: `user_id`, `createdAt`, `duration_ms`, `http.request.method`. */
const LAST_WORD_SHAPES: ReadonlyMap<string, Shape> = new Map<string, Shape>([
  ["id", "id"],
  ["ids", "id"],
  ["at", "time"],
  ["ms", "count"],
  ["seconds", "count"],
  ["bytes", "count"],
  ["count", "count"],
  ["total", "count"],
  ["size", "count"],
  ["tokens", "count"],
  ["credits", "count"],
  ["method", "word"],
  ["version", "version"],
]);

function debugShape(words: readonly string[], normalized: string): Shape | undefined {
  const exact = DEBUG_KEYS.get(normalized);
  if (exact) return exact;
  // A console argument as a log attribute: the log body carries its text already.
  if (normalized.startsWith("sentrymessageparameter")) return "list";
  const last = words[words.length - 1];
  if (last === "code") {
    const before = words[words.length - 2];
    if (before === "status") return "count";
    if (before === "error" || before === "pg" || before === "sql" || before === "auth") {
      return "code";
    }
  }
  return last ? LAST_WORD_SHAPES.get(last) : undefined;
}

/** True when `key` is on the debug allowlist (its values still have to fit the key's shape). */
export function isDebugKey(key: string): boolean {
  return debugShape(keyWords(key), normalizeKey(key)) !== undefined;
}

/** A string under `key` that the allowlist keeps. */
export function debugValueFits(key: string, value: string): boolean {
  const shape = debugShape(keyWords(key), normalizeKey(key));
  return shape !== undefined && shapeFits(shape, value);
}

/** A TanStack Query key field (`queryKey`, `mutationKey`): only its structure is kept. */
export function isStructuralKey(key: string): boolean {
  return debugShape(keyWords(key), normalizeKey(key)) === "structural";
}

/** Sentry's own ids (event, trace, span, debug, replay ids): never a member, always kept raw. */
const SENTRY_ID_WORDS = new Set([
  "event",
  "trace",
  "span",
  "debug",
  "replay",
  "profile",
  "profiler",
  "segment",
]);
const SENTRY_ID_VALUE =
  /^(?:[0-9a-f]{16}|[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-[0-9a-f]{1,16})?)$/i;

/** A trace, request or commit id: hex only, never a name. */
const HEX_ID_VALUE = /^(?:[0-9a-f]{16}|[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$/i;
/** A value an earlier rule wrote. */
const MARKER_VALUE =
  /^(?:\[(?:redacted(?::\d+)?|email|jwt|data-uri|base64|supabase-key|secret|phone|truncated|Filtered|unreadable|function|binary|Circular)\]|:(?:uuid|id|token|query|path|text))$/;

/**
 * A number shaped like a phone number: an integer of 7 to 15 digits. Under a time
 * key (`timestamp`, `*_at`) a Unix time in seconds or milliseconds is a time;
 * anywhere else it is not: US area codes 201–219 fall in the seconds window.
 */
export function isPhoneShapedNumber(value: number | bigint, timeKey = false): boolean {
  const digits = String(value).replace(/^-/, "");
  if (!/^\d{7,15}$/.test(digits)) return false;
  if (!timeKey) return true;
  const magnitude = Number(digits);
  const epochSeconds = magnitude >= 1e9 && magnitude < 2.2e9;
  const epochMillis = magnitude >= 1e12 && magnitude < 2.2e12;
  return !epochSeconds && !epochMillis;
}

/** A source position: a minified bundle's column runs past a million. */
const POSITION_KEYS = new Set([
  "line",
  "lineno",
  "linenumber",
  "col",
  "colno",
  "column",
  "columnnumber",
]);

/** Words that make a key a time (`created_at_ms`, `expires`, `iat`): a Unix time under it is a time. */
const TIME_WORDS = new Set([
  "at",
  "time",
  "timestamp",
  "ts",
  "date",
  "epoch",
  "expires",
  "expiry",
  "exp",
  "iat",
  "nbf",
  "since",
  "until",
]);
const isTimeKey = (words: readonly string[]) => words.some((word) => TIME_WORDS.has(word));

/** A string value's length is sent only when it is long: a short one can be the value (an enum). */
const LENGTH_MARKER_MIN = 32;

/**
 * What a redacted field becomes: `[redacted]`, or `[redacted:<length>]` for a
 * string of 32 or more characters under a key that is not a member field. Under
 * a member key the length of `Non-binary` would name it.
 */
export function redactedMarker(key: string, value: unknown): string {
  if (typeof value !== "string" || value.length < LENGTH_MARKER_MIN) return "[redacted]";
  const normalized = keyWords(key).join("");
  return MEMBER_FIELD_KEYS.has(normalized) || USER_INPUT_KEYS.has(normalized)
    ? "[redacted]"
    : `[redacted:${value.length}]`;
}

// ---------------------------------------------------------------------------
// Keys that are data
// ---------------------------------------------------------------------------

/**
 * First segments of dotted attribute names the SDK, OpenTelemetry and this app
 * write (`sentry.message.template`, `http.response.status_code`, `ui.component_name`).
 */
const KEY_NAMESPACES = new Set([
  "admin",
  "ai",
  "app",
  "auth",
  "browser",
  "cache",
  "client",
  "cloud",
  "cls",
  "code",
  "connection",
  "container",
  "culture",
  "db",
  "deployment",
  "device",
  "enduser",
  "environment",
  "error",
  "event",
  "exception",
  "faas",
  "fcp",
  "fid",
  "file",
  "fp",
  "frame",
  "genai",
  "gen_ai",
  "host",
  "http",
  "inp",
  "k8s",
  "lcp",
  "log",
  "logger",
  "member",
  "memory",
  "messaging",
  "mutation",
  "navigation",
  "net",
  "network",
  "os",
  "otel",
  "paddle",
  "peer",
  "performance",
  "pg",
  "postgres",
  "process",
  "profile",
  "query",
  "react",
  "release",
  "replay",
  "request",
  "resend",
  "resource",
  "response",
  "router",
  "rpc",
  "runtime",
  "sdk",
  "sentry",
  "server",
  "service",
  "session",
  "source",
  "span",
  "staff",
  "storage",
  "supabase",
  "telemetry",
  "thread",
  "trace",
  "transaction",
  "ttfb",
  "ui",
  "url",
  "user",
  "vercel",
]);

/** A field name the scrubber knows, by its whole normalized form (never by its last word). */
function isKnownKeyName(normalized: string): boolean {
  return (
    MEMBER_FIELD_KEYS.has(normalized) ||
    USER_INPUT_KEYS.has(normalized) ||
    ERROR_TEXT_KEYS.has(normalized) ||
    SECRET_KEYS.has(normalized) ||
    DEBUG_KEYS.has(normalized)
  );
}

/**
 * A key that is itself member text, not a field name: a name (`"Jane Doe"`), an
 * address or a handle with an at-sign, a dotted handle (`jane.doe88`), anything
 * outside printable ASCII, or a key over 64 characters. Field names stay:
 * `fullName`, `full_name`, `Full Name`, `x-vercel-id`, `sentry.message.template`.
 * A handle with no dot (`jane_doe1988`) reads as a field name and stays.
 */
export function isDataKey(key: string): boolean {
  if (key === "") return false;
  if (key.length > 64) return true;
  const plain = key.normalize("NFKC");
  if (/[^\x21-\x7e]|@/.test(plain)) return !isKnownKeyName(normalizeKey(plain));
  const dot = plain.indexOf(".");
  if (dot === -1) return false;
  const first = plain.slice(0, dot).toLowerCase();
  return !(KEY_NAMESPACES.has(first) || /^\d+$/.test(first) || isKnownKeyName(normalizeKey(plain)));
}

// ---------------------------------------------------------------------------
// Error shape
// ---------------------------------------------------------------------------

/** Keys a row has and an error never does. */
const ROW_KEYS = new Set(["id", "userid", "createdat", "updatedat"]);

/**
 * A code that only an error carries: a Node errno (`ECONNRESET`), a prefixed code
 * (`PGRST116`, `P2002`), a SQLSTATE (`23505`, `42P01`, `P0001`), `ERR_*` or a
 * snake_case API code (`invalid_credentials`), an HTTP status. A short word
 * (`ABC`) can be any table's `code` column, so it does not make a row an error.
 */
const STRONG_ERROR_CODE =
  /^(?:E[A-Z]{3,}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{1,8}\d{2,}|[0-9][0-9A-Z]{4}|[a-z]+(?:_[a-z0-9]+)+|\d{3,4})$/;

/**
 * What one key says about the object holding it: `strong` (only an error has
 * it), `row` (only data has it) or `none`.
 */
export function errorSignal(key: string, value: unknown): "strong" | "row" | "none" {
  const normalized = normalizeKey(key);
  if (ROW_KEYS.has(normalized)) return "row";
  switch (normalized) {
    case "stack":
    case "hint":
      return typeof value === "string" && value.trim() !== "" ? "strong" : "none";
    case "name":
      // An error's name is its class or a code (`validation_error`); a person's name is a row.
      if (isErrorClassName(value)) return "strong";
      return typeof value === "string" && value !== "" && !ERROR_CODE.test(value) ? "row" : "none";
    case "code":
    case "errorcode":
    case "sqlstate":
      return (typeof value === "string" && STRONG_ERROR_CODE.test(value)) ||
        (typeof value === "number" && value >= 400 && value <= 599)
        ? "strong"
        : "none";
    case "errno":
    case "syscall":
      return value !== undefined && value !== null && value !== "" ? "strong" : "none";
    case "status":
    case "statuscode":
      return typeof value === "number" && value >= 400 && value <= 599 ? "strong" : "none";
    case "isautherror":
      return value === true ? "strong" : "none";
  }
  if (ERROR_TEXT_KEYS.has(normalized) || ERROR_NEUTRAL_KEYS.has(normalized)) return "none";
  // Any other non-empty string that the allowlist would not keep is a row's column.
  return typeof value === "string" && value !== "" && !debugValueFits(key, value) ? "row" : "none";
}

/**
 * Strictly error-shaped: a strong marker (a real error code, a non-empty stack or
 * hint, `errno`/`syscall`, an HTTP 4xx/5xx status, `__isAuthError`, an error-class
 * `name`) or a place under an error key, AND no row key. `{ code: "x", message }`
 * and `{ id, code: "ABC", message }` are rows. An `Error` instance is decided by
 * `instanceof` before this is asked.
 */
export function isErrorShaped(
  entries: Iterable<readonly [string, unknown]>,
  inError: boolean,
): boolean {
  let strong = inError;
  for (const [key, value] of entries) {
    const signal = errorSignal(key, value);
    if (signal === "row") return false;
    if (signal === "strong") strong = true;
  }
  return strong;
}

/**
 * Keys that hold an error: what sits under them (`{"error":{"message":…}}`, a
 * GraphQL `errors` list, an Error's `cause`) is an error unless it also carries a
 * row key.
 */
const ERROR_CONTAINER_KEYS = new Set([
  "error",
  "errors",
  "err",
  "cause",
  "exception",
  "originalerror",
  "innererror",
]);

export function isErrorContainerKey(key: string): boolean {
  return ERROR_CONTAINER_KEYS.has(normalizeKey(key));
}

const IDENTIFYING_HEADER =
  /^(?:x-forwarded-.*|x-real-ip|forwarded|via|x-client-ip|true-client-ip|cf-connecting-ip|fastly-client-ip|x-cluster-client-ip|x-vercel-forwarded-for|x-vercel-ip-.*)$/;
const IDENTIFYING_KEYS = new Set([
  "client.address",
  "client.ip",
  "http.client_ip",
  "net.sock.peer.addr",
  "ip",
  "ip_address",
  "remote_addr",
]);

/** IP-bearing headers and client addresses, as headers or as span attributes. */
export function isIdentifyingKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (IDENTIFYING_KEYS.has(lower)) return true;
  const header = lower.replace(/^http\.(?:request|response)\.header\./, "").replace(/_/g, "-");
  return IDENTIFYING_HEADER.test(header);
}

// ---------------------------------------------------------------------------
// The decision for one field
// ---------------------------------------------------------------------------

/**
 * What one field of structured data becomes:
 * - `drop`: an IP-bearing key (the walk removes it, JSON text redacts it);
 * - `secret`: a credential-named key (`[Filtered]`);
 * - `redact`: `[redacted]` (`redactedMarker`: a length only for a long non-member string);
 * - `keep`: sent as is (numbers, booleans, null, Sentry ids, hex ids, markers);
 * - `text` / `query`: a kept string, still through the free-text scrubber;
 * - `walk`: an object or a list, walked key by key (list items keep this key);
 * - `function`: a function, sent as `[function]`.
 */
export type FieldAction =
  "drop" | "secret" | "redact" | "keep" | "text" | "query" | "walk" | "function";

function unknownKeyAction(value: unknown, words: readonly string[]): FieldAction {
  switch (typeof value) {
    case "boolean":
      return "keep";
    case "number":
    case "bigint":
      return isPhoneShapedNumber(value, isTimeKey(words)) ? "redact" : "keep";
    case "string":
      if (UUID_VALUE.test(value)) return "text";
      return HEX_ID_VALUE.test(value) || MARKER_VALUE.test(value) ? "keep" : "redact";
    case "object":
      return "walk";
    default:
      return "redact";
  }
}

/**
 * The decision for one key and its value. `errorHolder` says whether the object
 * holding the key is error-shaped, which keeps its error text readable.
 */
export function fieldAction(key: string, value: unknown, errorHolder: boolean): FieldAction {
  if (isIdentifyingKey(key)) return "drop";
  if (value === undefined || value === null || value === "") return "keep";
  if (typeof value === "function") return "function";
  if (isSecretKey(key)) return "secret";
  const words = keyWords(key);
  const normalized = words.join("");
  const isObject = typeof value === "object";
  if (typeof value === "string" && MARKER_VALUE.test(value)) return "keep";
  if (ERROR_TEXT_KEYS.has(normalized)) {
    if (isObject) return "walk";
    if (errorHolder && typeof value === "string") {
      return normalized !== "name" || isErrorClassName(value) ? "text" : "redact";
    }
    return "redact";
  }
  if (MEMBER_FIELD_KEYS.has(normalized) || USER_INPUT_KEYS.has(normalized)) return "redact";
  const shape = debugShape(words, normalized);
  if (shape === undefined) return unknownKeyAction(value, words);
  if (typeof value === "number" || typeof value === "bigint") {
    if (POSITION_KEYS.has(normalized)) return "keep";
    return isPhoneShapedNumber(value, shape === "time" || isTimeKey(words)) ? "redact" : "keep";
  }
  if (typeof value === "boolean") return "keep";
  // A query key's filter object carries what staff typed; its list is walked item by item.
  if (isObject) return shape === "structural" && !Array.isArray(value) ? "redact" : "walk";
  if (typeof value !== "string") return "redact";
  if (shape === "text") return "text";
  if (shape === "query") return "query";
  if (shape === "id" && words.some((word) => SENTRY_ID_WORDS.has(word))) {
    if (SENTRY_ID_VALUE.test(value)) return "keep";
  }
  return shapeFits(shape, value) ? "text" : "redact";
}
