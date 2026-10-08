import { parseDsn } from "./dsn";

/**
 * CSP `connect-src` entries the browser SDK needs to deliver events: every
 * sentry.io ingest host (`o<org>.ingest[.<region>].sentry.io`), plus the DSN's
 * own origin when it points at a self-hosted Sentry.
 * Imported by vite.config.ts, so it must stay dependency-free.
 */
export function sentryConnectSources(dsn: string | undefined): string[] {
  const sources = ["https://*.sentry.io"];
  const parsed = parseDsn(dsn);
  if (parsed) {
    const url = new URL(parsed);
    const onSentryIo = url.hostname === "sentry.io" || url.hostname.endsWith(".sentry.io");
    if (!onSentryIo) sources.push(url.origin);
  }
  return sources;
}
