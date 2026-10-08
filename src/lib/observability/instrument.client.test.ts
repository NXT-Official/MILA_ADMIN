import { afterEach, describe, expect, mock, test } from "bun:test";
import { clientSentryOptions, initClientObservability, onCaughtError } from "./instrument.client";
import { logErrorOnce } from "./observability";

const DSN = "https://k@o1.ingest.sentry.io/2";
const originalConsoleError = console.error;
afterEach(() => {
  console.error = originalConsoleError;
});

describe("client options (fail-closed)", () => {
  test("no VITE_SENTRY_DSN means no options", () => {
    expect(clientSentryOptions({ MODE: "production" })).toBeNull();
    expect(clientSentryOptions({ VITE_SENTRY_DSN: "", MODE: "production" })).toBeNull();
  });

  test("environment and release come from the build, replay stays off", () => {
    const options = clientSentryOptions({
      VITE_SENTRY_DSN: DSN,
      VITE_SENTRY_ENVIRONMENT: "preview",
      VITE_SENTRY_RELEASE: "abc123",
      MODE: "production",
      PROD: true,
    });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "preview",
      release: "abc123",
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      enableLogs: true,
      initialScope: { tags: { app: "mila-admin", runtime: "client" } },
    });
    const names = options?.integrations.map((integration) => integration.name);
    expect(names).toEqual(["ConsoleLogs"]);
    expect(names).not.toContain("Replay");
  });

  test("falls back to the Vite mode when no environment was baked in", () => {
    expect(clientSentryOptions({ VITE_SENTRY_DSN: DSN, MODE: "development" })).toMatchObject({
      environment: "development",
      release: undefined,
    });
  });
});

describe("client init and React hooks never break the page", () => {
  test("initClientObservability is a no-op outside a browser", () => {
    expect(initClientObservability({ VITE_SENTRY_DSN: DSN, MODE: "production" })).toBe(false);
  });

  test("onCaughtError keeps React's console output, component stack included, and never throws", () => {
    const logged = mock((..._args: unknown[]) => {});
    console.error = logged;
    const error = new Error("render failed");
    expect(() => onCaughtError(error, { componentStack: "\n    at Members" })).not.toThrow();
    expect(logged).toHaveBeenCalledWith(error);
    expect(logged).toHaveBeenCalledWith("The above error occurred in:\n    at Members");
  });

  test("a caught render error is logged once, even when the route error screen logs it too", () => {
    const logged = mock((..._args: unknown[]) => {});
    console.error = logged;
    const error = new Error("render failed once");
    onCaughtError(error, {});
    logErrorOnce(error); // what the root ErrorComponent's effect does next
    expect(logged.mock.calls.filter(([first]) => first === error)).toHaveLength(1);
  });
});
