import type { NodeOptions } from "@sentry/tanstackstart-react";
import { parseDsn } from "./dsn";
import {
  SAFE_QUERY_KEYS,
  isControlFlowThrow,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
} from "./scrub";

export type SentryRuntime = "client" | "server";

/** The options both runtimes share. Integrations are added by each runtime's init. */
export type SharedSentryOptions = Required<
  Pick<
    NodeOptions,
    | "dsn"
    | "tracesSampleRate"
    | "enableLogs"
    | "dataCollection"
    | "initialScope"
    | "beforeSend"
    | "beforeSendTransaction"
    | "beforeSendLog"
    | "beforeBreadcrumb"
  >
> &
  Pick<NodeOptions, "environment" | "release">;

/**
 * Explicit, conservative data collection. Setting `dataCollection` at all makes
 * the SDK fall back to its permissive defaults for any omitted field, so every
 * category that can carry personal data is listed here.
 * src: node_modules/@sentry/core/build/esm/utils/data-collection/resolveDataCollectionOptions.js · 10.75.2
 *
 * Headers and query params are allowlists (the first version used the SDK's
 * IP/user deny snippets, which still let search text and unknown headers
 * through). This is defence in depth: ./scrub enforces the same policy on
 * whatever the SDK collects.
 * src: node_modules/@sentry/core/build/types/types/datacollection.d.ts (CollectBehavior `{ allow }`) · 10.75.2
 */
export const SENTRY_DATA_COLLECTION: NonNullable<NodeOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    // x-vercel-id is an opaque request id: it ties a Sentry event to the Vercel
    // runtime log and carries no personal data.
    request: {
      allow: ["content-type", "content-length", "user-agent", "accept", "x-vercel-id"],
    },
    response: { allow: ["content-type", "content-length", "x-vercel-id"] },
  },
  httpBodies: [],
  urlQueryParams: { allow: [...SAFE_QUERY_KEYS] },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
};

/** First value that is set and not blank. */
export function firstSet(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export { parseDsn };

/**
 * Builds the Sentry options for one runtime, or `null` when there is no usable
 * DSN. Fail-closed: no DSN means `Sentry.init` is never called and every
 * reporting call becomes a no-op.
 *
 * Every `beforeSend*` hook scrubs (see ./scrub). If scrubbing itself throws the
 * item is dropped rather than sent unscrubbed.
 */
export function buildSentryOptions(
  runtime: SentryRuntime,
  input: { dsn: string | undefined; environment?: string; release?: string },
): SharedSentryOptions | null {
  const dsn = parseDsn(input.dsn);
  if (!dsn) return null;

  return {
    dsn,
    environment: input.environment,
    release: input.release,
    // Unchanged from the previous sentry-client.ts / sentry.server.ts setup.
    tracesSampleRate: 0.1,
    // src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/ · 10.75.2
    enableLogs: true,
    dataCollection: SENTRY_DATA_COLLECTION,
    initialScope: { tags: { app: "mila-admin", runtime } },
    beforeSend(event, hint) {
      if (isControlFlowThrow(hint?.originalException)) return null;
      try {
        return scrubEvent(event);
      } catch {
        return null;
      }
    },
    beforeSendTransaction(event) {
      try {
        return scrubEvent(event);
      } catch {
        return null;
      }
    },
    beforeSendLog(log) {
      try {
        return scrubLog(log);
      } catch {
        return null;
      }
    },
    // The hint carries the clicked element: a click selector is rebuilt from it
    // (tag, id, classes, type, name) without reading any attribute value.
    // src: @sentry/browser 10.75.2 breadcrumbs integration passes { event, name, global } as the hint
    beforeBreadcrumb(breadcrumb, hint) {
      try {
        return scrubBreadcrumb(breadcrumb, hint);
      } catch {
        return null;
      }
    },
  };
}
