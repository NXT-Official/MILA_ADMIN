import { withIsolationScope, wrapFetchWithSentry } from "@sentry/tanstackstart-react";

// `any` for the second argument: TanStack Start's RequestHandler types it from
// the app's Register, and this wrapper only forwards it untouched.
type ServerFetch = (request: Request, opts?: any) => Promise<Response> | Response;

/**
 * Wraps the TanStack Start request handler for Sentry.
 *
 * - `withIsolationScope` gives every request its own scope, so the staff id set
 *   by the auth middleware for one request can never label another request's
 *   error, even when two run at once on the same warm function.
 * - `wrapFetchWithSentry` adds the request/server-function spans and flushes
 *   before a serverless function freezes.
 *
 * src: node_modules/@sentry/tanstackstart-react/build/types/server/wrapFetchWithSentry.d.ts · 10.75.2
 * src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/#instrument-the-server-entry-point · 10.75.2
 */
export function createObservedServerEntry<F extends ServerFetch>(fetch: F): { fetch: F } {
  const sentryEntry = wrapFetchWithSentry({ fetch });
  const observed: ServerFetch = (request, opts) =>
    withIsolationScope(() => sentryEntry.fetch(request, opts));
  return { fetch: observed as F };
}
