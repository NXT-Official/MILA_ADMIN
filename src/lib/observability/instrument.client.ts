import * as Sentry from "@sentry/tanstackstart-react";
import { logErrorOnce } from "./observability";
import { buildSentryOptions, firstSet, type SharedSentryOptions } from "./sentry-options";

type Env = Record<string, unknown>;

const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Browser Sentry options from the build-time env, or `null` without
 * VITE_SENTRY_DSN. VITE_SENTRY_ENVIRONMENT / VITE_SENTRY_RELEASE are baked in by
 * vite.config.ts from the Vercel deployment. Session Replay is off in the staff
 * suite: no replay integration and both sample rates at zero.
 */
export function clientSentryOptions(env: Env):
  | (SharedSentryOptions & {
      integrations: ReturnType<typeof Sentry.consoleLoggingIntegration>[];
      replaysSessionSampleRate: number;
      replaysOnErrorSampleRate: number;
    })
  | null {
  const options = buildSentryOptions("client", {
    dsn: text(env.VITE_SENTRY_DSN),
    environment: firstSet(text(env.VITE_SENTRY_ENVIRONMENT), text(env.MODE)),
    release: firstSet(text(env.VITE_SENTRY_RELEASE)),
  });
  if (!options) return null;
  return {
    ...options,
    // src: node_modules/@sentry/core/build/types/logs/console-integration.d.ts · 10.75.2
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  };
}

/**
 * Starts browser Sentry once, before hydration. Called from src/client.tsx as
 * an explicit call rather than a bare import: package.json declares
 * `"sideEffects": false`, which lets the production build drop bare imports.
 * src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/#configure-client-side-sentry · 10.75.2
 *
 * Returns whether reporting is on. Never throws.
 */
export function initClientObservability(env: Env = import.meta.env): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (Sentry.getClient()) return Sentry.isEnabled();
    const options = clientSentryOptions(env);
    if (!options) return false;
    Sentry.init(options);
    return Sentry.isEnabled();
  } catch {
    return false;
  }
}

/**
 * React 19 `onCaughtError` root hook. React hands errors caught by an error
 * boundary (TanStack Router's route boundaries included) to this hook instead of
 * `window.onerror`, so without it they would never reach Sentry. Keeps React's
 * default behaviour of logging the error to the console.
 * Uncaught and recoverable errors keep React's default (`reportError`), which
 * Sentry's global error handlers already capture.
 * src: node_modules/@sentry/react/build/esm/error.js (reactErrorHandler) · 10.75.2
 */
export function onCaughtError(error: unknown, errorInfo: { componentStack?: string }): void {
  // Once: the route's error screen logs the same error after it renders.
  logErrorOnce(error);
  // React's own handler also prints where in the tree the error happened.
  if (errorInfo.componentStack) {
    console.error(`The above error occurred in:${errorInfo.componentStack}`);
  }
  try {
    if (!Sentry.isEnabled()) return;
    Sentry.captureReactException(error, errorInfo, {
      mechanism: { handled: true, type: "auto.function.react.error_handler" },
    });
  } catch {
    // Reporting must never break rendering.
  }
}
