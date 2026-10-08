import * as Sentry from "@sentry/tanstackstart-react";
import { buildSentryOptions, firstSet, type SharedSentryOptions } from "./sentry-options";

type Env = Record<string, string | undefined>;

/**
 * Server Sentry options from the environment, or `null` without SENTRY_DSN.
 * Environment and release follow the Vercel deployment unless overridden.
 * Session Replay does not exist on the server; logs capture console warn/error.
 */
export function serverSentryOptions(
  env: Env,
):
  | (SharedSentryOptions & { integrations: ReturnType<typeof Sentry.consoleLoggingIntegration>[] })
  | null {
  const options = buildSentryOptions("server", {
    dsn: env.SENTRY_DSN,
    environment: firstSet(env.SENTRY_ENVIRONMENT, env.VERCEL_ENV, env.NODE_ENV),
    release: firstSet(env.SENTRY_RELEASE, env.VERCEL_GIT_COMMIT_SHA),
  });
  if (!options) return null;
  return {
    ...options,
    // src: node_modules/@sentry/core/build/types/logs/console-integration.d.ts · 10.75.2
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
  };
}

/**
 * Starts server-side Sentry once. Called from the top of src/server.ts (an
 * explicit call, not a bare side-effect import: package.json declares
 * `"sideEffects": false`, which lets the production build drop bare imports).
 *
 * Deployed on Vercel, so this is the "without --import flag" setup: error
 * capture works in full, automatic tracing is limited to native fetch/http.
 * src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/#without---import-flag · 10.75.2
 *
 * Returns whether reporting is on. Never throws: a broken SDK leaves the app running.
 */
export function initServerObservability(env: Env = process.env): boolean {
  try {
    if (Sentry.getClient()) return Sentry.isEnabled();
    const options = serverSentryOptions(env);
    if (!options) return false;
    Sentry.init(options);
    return Sentry.isEnabled();
  } catch {
    return false;
  }
}
