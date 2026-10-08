import { describe, expect, test } from "bun:test";
import { redirect } from "@tanstack/react-router";
import { SAFE_QUERY_KEYS } from "./scrub";
import { buildSentryOptions, firstSet, parseDsn } from "./sentry-options";

const DSN = "https://publickey@o123.ingest.us.sentry.io/4507";

describe("parseDsn (fail-closed)", () => {
  test("accepts a well-formed DSN and trims it", () => {
    expect(parseDsn(`  ${DSN} `)).toBe(DSN);
    expect(parseDsn("http://k@127.0.0.1:9999/1")).toBe("http://k@127.0.0.1:9999/1");
  });

  test("treats unset, blank and malformed values as no DSN", () => {
    expect(parseDsn(undefined)).toBeUndefined();
    expect(parseDsn("")).toBeUndefined();
    expect(parseDsn("   ")).toBeUndefined();
    expect(parseDsn("not a url")).toBeUndefined();
    expect(parseDsn("https://o123.ingest.sentry.io/4507")).toBeUndefined();
    expect(parseDsn("ftp://k@o123.ingest.sentry.io/4507")).toBeUndefined();
    expect(parseDsn("https://k@o123.ingest.sentry.io/")).toBeUndefined();
  });

  test("plain http is accepted only for a local ingest", () => {
    expect(parseDsn("http://k@localhost:9999/1")).toBe("http://k@localhost:9999/1");
    expect(parseDsn("http://k@[::1]:9999/1")).toBe("http://k@[::1]:9999/1");
    expect(parseDsn("http://k@o123.ingest.sentry.io/4507")).toBeUndefined();
    expect(parseDsn("http://k@errors.example.org/3")).toBeUndefined();
  });
});

describe("firstSet", () => {
  test("returns the first non-blank value", () => {
    expect(firstSet(undefined, "", "  ", "preview", "production")).toBe("preview");
    expect(firstSet(undefined, "")).toBeUndefined();
  });
});

describe("buildSentryOptions", () => {
  test("returns null without a usable DSN, so nothing initialises", () => {
    expect(buildSentryOptions("server", { dsn: undefined })).toBeNull();
    expect(buildSentryOptions("client", { dsn: "nope" })).toBeNull();
  });

  test("sets environment, release, logs and conservative data collection", () => {
    const options = buildSentryOptions("server", {
      dsn: DSN,
      environment: "preview",
      release: "abc123",
    });
    expect(options).not.toBeNull();
    expect(options?.dsn).toBe(DSN);
    expect(options?.environment).toBe("preview");
    expect(options?.release).toBe("abc123");
    expect(options?.enableLogs).toBe(true);
    expect(options?.tracesSampleRate).toBe(0.1);
    expect(options?.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      // The SDK collects only allowlisted query params and headers (no IPs, no search text).
      urlQueryParams: { allow: [...SAFE_QUERY_KEYS] },
      httpHeaders: {
        // x-vercel-id: opaque request id that ties a Sentry event to the Vercel runtime log.
        request: {
          allow: ["content-type", "content-length", "user-agent", "accept", "x-vercel-id"],
        },
        response: { allow: ["content-type", "content-length", "x-vercel-id"] },
      },
    });
    expect(options?.initialScope).toEqual({ tags: { app: "mila-admin", runtime: "server" } });
  });

  test("beforeSend drops router control flow and scrubs everything else", () => {
    const options = buildSentryOptions("client", { dsn: DSN });
    const beforeSend = options?.beforeSend;
    if (!beforeSend) throw new Error("beforeSend missing");

    expect(
      beforeSend({ type: undefined, message: "x" }, { originalException: redirect({ to: "/" }) }),
    ).toBeNull();

    const event = beforeSend(
      {
        type: undefined,
        message: "invite failed for jane@example.com",
        user: { id: "staff-1", email: "jane@example.com" },
      },
      { originalException: new Error("invite failed") },
    );
    expect(event).toMatchObject({ message: "invite failed for [email]", user: { id: "staff-1" } });
    expect(JSON.stringify(event)).not.toContain("example.com");
  });

  test("beforeSend never sends what it cannot scrub raw", () => {
    const options = buildSentryOptions("server", { dsn: DSN });
    // A field whose getter throws is written as [unreadable] (round 4); the error still arrives.
    const hostile = { type: undefined, message: "jane@example.com" } as Record<string, unknown>;
    Object.defineProperty(hostile, "extra", {
      enumerable: true,
      get() {
        throw new Error("getter blew up");
      },
    });
    expect(options?.beforeSend?.(hostile as never, {})).toEqual({
      message: "[email]",
      extra: "[unreadable]",
    } as never);
    // An event that cannot be read at all is dropped.
    const revoked = Proxy.revocable({ message: "jane@example.com" }, {});
    revoked.revoke();
    expect(options?.beforeSend?.(revoked.proxy as never, {})).toBeNull();
  });

  test("transactions, breadcrumbs and logs are scrubbed too", () => {
    const options = buildSentryOptions("server", { dsn: DSN });
    expect(
      options?.beforeSendTransaction?.(
        { type: "transaction", transaction: "GET /reset?token=abc" },
        {},
      ),
    ).toMatchObject({ transaction: "GET /reset?token=[redacted]" });
    expect(options?.beforeBreadcrumb?.({ message: "jane@example.com" })).toEqual({
      message: "[email]",
    });
    expect(options?.beforeSendLog?.({ level: "warn", message: "jane@example.com" })).toEqual({
      level: "warn",
      message: "[email]",
    });
  });
});
