import { captureError } from "./observability/observability";

// Kept as a thin delegate so existing callers (auth-handler.server.ts,
// hcaptcha.server.ts) keep working. Sentry itself now starts once, in
// src/server.ts (see ./observability/instrument.server.ts), and stays off when
// SENTRY_DSN is unset: a missing DSN must not hard-fail the app.

/** Reports a server-side error to Sentry. No-op when SENTRY_DSN is unset. */
export function captureServerException(error: unknown): void {
  captureError(error);
}
