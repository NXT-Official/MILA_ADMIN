const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * A DSN looks like `https://<publicKey>@<host>/<projectId>`. Anything else is
 * treated as unset: reporting switches off and the app keeps working.
 * Plain `http:` is accepted only for a local ingest (tests, a local relay):
 * events must never cross the network unencrypted, and the CSP built from this
 * must never open to a plain-http host.
 *
 * Dependency-free on purpose: vite.config.ts imports it (through ./csp).
 */
export function parseDsn(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
    if (url.protocol !== "https:" && !local) return undefined;
    if (!url.username) return undefined;
    if (!/^\/(?:.*\/)?\d+$/.test(url.pathname)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
