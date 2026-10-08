import {
  hasPermission,
  staffHome,
  STAFF_ROUTE_PERMISSIONS,
  STAFF_ROUTES,
  type AppRole,
  type StaffRoute,
} from "./authorization";

// Nothing legitimate is longer: the longest staff path is under 30 characters.
const MAX_REDIRECT_LENGTH = 2048;

// Only a base for resolving the value. It never leaves this module.
const PROBE_ORIGIN = "https://staff.invalid";

// A backslash, any control character or any whitespace. The URL parser strips
// tabs and newlines and reads `\` as `/`, so "/\t/evil.example" would resolve
// to the protocol-relative "//evil.example" if it were let through.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\\\s\u0000-\u001f\u007f]/;

/**
 * The staff screen a `redirect` value names, or undefined for anything else.
 *
 * The sign-in form sends a member of staff on to this path, so the value is
 * treated as hostile: a string, one leading slash, no characters the URL parser
 * would rewrite, resolving inside this origin, and landing on a screen this
 * suite actually has. Returning a route name rather than the input means no
 * caller can forward an attacker's string. Query and hash are dropped on purpose.
 */
export function safeRedirectPath(value: unknown): StaffRoute | undefined {
  if (typeof value !== "string" || value.length > MAX_REDIRECT_LENGTH) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || UNSAFE_CHARACTERS.test(value)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.origin !== PROBE_ORIGIN) return undefined;

  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return STAFF_ROUTES.find((route) => route === path);
}

/** The search params for the sign-in route: where to go once signed in, if anywhere. */
export function signInRedirectSearch(pathname: string): { redirect?: StaffRoute } {
  const redirect = safeRedirectPath(pathname);
  return redirect ? { redirect } : {};
}

/**
 * Where a signed-in member of staff lands. The screen they asked for when they
 * may open it, otherwise their own home, so a moderator who followed an
 * admin-only link is not bounced through a guard to get there.
 */
export function postLoginDestination(
  requested: StaffRoute | undefined,
  roles: readonly AppRole[],
): StaffRoute {
  if (requested && hasPermission(roles, STAFF_ROUTE_PERMISSIONS[requested])) return requested;
  return staffHome(roles);
}
