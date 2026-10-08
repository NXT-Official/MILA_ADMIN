import { describe, expect, test } from "bun:test";
import { sentryConnectSources } from "./csp";

describe("sentryConnectSources", () => {
  test("always allows the sentry.io ingest hosts (any region)", () => {
    expect(sentryConnectSources(undefined)).toEqual(["https://*.sentry.io"]);
    expect(sentryConnectSources("https://k@o123.ingest.us.sentry.io/45")).toEqual([
      "https://*.sentry.io",
    ]);
    expect(sentryConnectSources("https://k@o123.ingest.de.sentry.io/45")).toEqual([
      "https://*.sentry.io",
    ]);
  });

  test("adds a self-hosted DSN's origin", () => {
    expect(sentryConnectSources("https://k@errors.example.org/3")).toEqual([
      "https://*.sentry.io",
      "https://errors.example.org",
    ]);
  });

  test("ignores a malformed DSN", () => {
    expect(sentryConnectSources("not a dsn")).toEqual(["https://*.sentry.io"]);
  });

  test("never opens the CSP to a plain-http remote host", () => {
    expect(sentryConnectSources("http://k@errors.example.org/3")).toEqual(["https://*.sentry.io"]);
  });
});
