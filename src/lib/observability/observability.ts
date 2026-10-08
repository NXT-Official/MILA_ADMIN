import * as Sentry from "@sentry/tanstackstart-react";

/**
 * The one reporting surface for the staff suite. Every error, identity change
 * and structured log goes through here, never straight to an SDK, so that:
 *
 * - no DSN means every call is a no-op and the app works exactly as before;
 * - a broken or blocked SDK can never throw into the screen that called it;
 * - only a Supabase user id is ever attached as identity.
 *
 * Isomorphic: `@sentry/tanstackstart-react` resolves to the browser SDK in the
 * client bundle and to the Node SDK on the server, and both expose the calls below.
 * src: node_modules/@sentry/tanstackstart-react/package.json "exports" · 10.75.2
 */

type Attributes = Record<string, unknown>;

export interface ErrorContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ObservabilitySdk {
  isEnabled(): boolean;
  captureException(error: unknown, context?: ErrorContext): unknown;
  setUser(user: { id: string } | null): void;
  addBreadcrumb(breadcrumb: {
    category: string;
    message: string;
    data?: Attributes;
    level: "info";
  }): void;
  logger: {
    info(message: string, attributes?: Attributes): void;
    warn(message: string, attributes?: Attributes): void;
    error(message: string, attributes?: Attributes): void;
  };
}

export function createObservability(sdk: ObservabilitySdk) {
  function safely(run: () => void): void {
    try {
      if (sdk.isEnabled()) run();
    } catch {
      // Reporting must never break the screen or request that called it.
    }
  }

  function reset(): void {
    safely(() => sdk.setUser(null));
  }

  return {
    /** Reports an error with optional tags and extra context (scrubbed before sending). */
    captureError(error: unknown, context?: ErrorContext): void {
      safely(() => {
        sdk.captureException(error, context);
      });
    },
    /** Attaches the signed-in Supabase user id, and nothing else, to later reports. */
    identify(userId: string | null | undefined): void {
      if (!userId) {
        reset();
        return;
      }
      safely(() => sdk.setUser({ id: userId }));
    },
    reset,
    /** Records a product action as a breadcrumb, shown alongside any later error. */
    track(name: string, properties?: Attributes): void {
      safely(() =>
        sdk.addBreadcrumb({ category: "track", message: name, data: properties, level: "info" }),
      );
    },
    log: {
      info(message: string, attributes?: Attributes): void {
        safely(() => sdk.logger.info(message, attributes));
      },
      warn(message: string, attributes?: Attributes): void {
        safely(() => sdk.logger.warn(message, attributes));
      },
      error(message: string, attributes?: Attributes): void {
        safely(() => sdk.logger.error(message, attributes));
      },
    },
  };
}

const sentrySdk: ObservabilitySdk = {
  isEnabled: () => Sentry.isEnabled(),
  captureException: (error, context) => Sentry.captureException(error, context),
  setUser: (user) => Sentry.setUser(user),
  addBreadcrumb: (breadcrumb) => {
    Sentry.addBreadcrumb(breadcrumb);
  },
  logger: {
    info: (message, attributes) => Sentry.logger.info(message, attributes),
    warn: (message, attributes) => Sentry.logger.warn(message, attributes),
    error: (message, attributes) => Sentry.logger.error(message, attributes),
  },
};

export const observability = createObservability(sentrySdk);
export const { captureError, identify, reset, track, log } = observability;

const loggedErrors = new WeakSet<object>();

/**
 * `console.error(error)`, once per error object. A render error caught by a
 * route boundary reaches both React's `onCaughtError` and the route's error
 * screen; each logs it, and console errors are shipped as logs, so without this
 * the same error was logged twice. Non-object errors are always logged.
 */
export function logErrorOnce(
  error: unknown,
  write: (...args: unknown[]) => void = console.error,
): void {
  if (error !== null && typeof error === "object") {
    if (loggedErrors.has(error)) return;
    loggedErrors.add(error);
  }
  write(error);
}
