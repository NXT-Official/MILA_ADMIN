import { captureError } from "./observability/observability";

// Kept as a thin delegate so existing callers (the root error screen) keep
// working. Sentry itself now starts once, in src/client.tsx (see
// ./observability/instrument.client.ts), and stays off when VITE_SENTRY_DSN is
// unset. Do not use requireEnv here.

/** Reports a client-side error to Sentry. No-op when VITE_SENTRY_DSN is unset or on the server. */
export function captureClientException(error: unknown): void {
  if (typeof window === "undefined") return;
  captureError(error);
}
