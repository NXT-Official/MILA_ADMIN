import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/tanstackstart-react";
import { initServerObservability, serverSentryOptions } from "./instrument.server";
import { createObservedServerEntry } from "./server-entry.server";
import { identify } from "./observability";
import { structuralKey } from "./scrub";

// Built from parts so no scanner mistakes the fixture for a live credential.
const JWT = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiJzdGFmZiJ9", "c2lnbmF0dXJl"].join(".");
// Search terms for the Database-browser case. Kept up here, far from the code
// that throws: the SDK ships a few source lines around each stack frame, and a
// literal written next to a frame would show up in that context.
const SEARCHED_EMAIL = ["jane", "example.com"].join("@");
const SEARCHED_NAME = ["Jane", "Doe"].join(" ");
// Postgres `details` that echo row values (review N3), built the same way.
const PG_DETAILS = [
  `Key (username)=(${["jane", "doe"].join("")}) already exists.`,
  `Failing row contains (0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10, ${SEARCHED_NAME}, ${["0917", "123", "4567"].join(" ")}, null).`,
  `invalid input syntax for type uuid: "${SEARCHED_NAME}"`,
];

interface EnvelopeItem {
  header: { type?: string };
  payload: Record<string, unknown>;
}

/** Envelope format: a header line, then (item header line, item payload line) pairs. */
function parseEnvelope(text: string): EnvelopeItem[] {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const items: EnvelopeItem[] = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    items.push({ header: JSON.parse(lines[i]), payload: JSON.parse(lines[i + 1]) });
  }
  return items;
}

const received: string[] = [];
let ingest: ReturnType<typeof Bun.serve>;
const originalConsoleError = console.error;

describe("server options (fail-closed)", () => {
  test("no SENTRY_DSN means no options, so the SDK never starts", () => {
    expect(serverSentryOptions({})).toBeNull();
    expect(serverSentryOptions({ SENTRY_DSN: "  " })).toBeNull();
  });

  test("environment and release come from Vercel unless overridden", () => {
    const dsn = "https://k@o1.ingest.sentry.io/2";
    expect(
      serverSentryOptions({
        SENTRY_DSN: dsn,
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_SHA: "abc",
        NODE_ENV: "production",
      }),
    ).toMatchObject({ environment: "preview", release: "abc" });
    expect(
      serverSentryOptions({
        SENTRY_DSN: dsn,
        SENTRY_ENVIRONMENT: "staging",
        SENTRY_RELEASE: "v1",
        VERCEL_ENV: "preview",
      }),
    ).toMatchObject({ environment: "staging", release: "v1" });
    const integrations = serverSentryOptions({ SENTRY_DSN: dsn })?.integrations;
    expect(Array.isArray(integrations) && integrations.map((i) => i.name)).toEqual(["ConsoleLogs"]);
  });
});

describe("a thrown server function reaches Sentry", () => {
  beforeAll(() => {
    ingest = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const raw = new Uint8Array(await request.arrayBuffer());
        const body = request.headers.get("content-encoding") === "gzip" ? Bun.gunzipSync(raw) : raw;
        received.push(new TextDecoder().decode(body));
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    // Keep the test output quiet; the console integration wraps whatever is installed.
    console.error = () => {};
    const started = initServerObservability({
      SENTRY_DSN: `http://publickey@127.0.0.1:${ingest.port}/1`,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    });
    expect(started).toBe(true);
  });

  afterAll(async () => {
    await Sentry.close(2000);
    console.error = originalConsoleError;
    ingest.stop(true);
  });

  test("each concurrent request reports its own staff id, scrubbed, with its logs", async () => {
    // What a staff server function does: the auth middleware identifies the
    // caller, then the handler throws. Sentry's global function middleware is
    // the first in start.ts, exactly as here.
    const entry = createObservedServerEntry(async (request: Request) => {
      const staffId = request.headers.get("x-test-staff") ?? "";
      const run = Sentry.sentryGlobalFunctionMiddleware.options.server;
      if (!run) throw new Error("sentry function middleware has no server handler");
      try {
        return (await run({
          next: async () => {
            identify(staffId);
            console.error(`grant failed for jane@example.com (${staffId})`);
            throw new Error(`grant failed for jane@example.com with ${JWT}`);
          },
          serverFnMeta: { id: "fn-id", name: "grantCredits", filename: "member-billing.ts" },
        })) as Response;
      } catch {
        return new Response("error", { status: 500 });
      }
    });

    const call = (staffId: string) =>
      entry.fetch(
        new Request("http://localhost/_serverFn/grantCredits", {
          method: "POST",
          headers: { "x-test-staff": staffId },
        }),
      );
    const responses = await Promise.all([call("staff-a"), call("staff-b")]);
    expect(responses.map((r) => r.status)).toEqual([500, 500]);

    expect(await Sentry.flush(5000)).toBe(true);

    const items = received.flatMap(parseEnvelope);
    const events = items.filter((item) => item.header.type === "event").map((i) => i.payload);
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e.user as { id: string }).id).sort()).toEqual(["staff-a", "staff-b"]);
    for (const event of events) {
      expect(Object.keys(event.user as object)).toEqual(["id"]);
      expect(event.environment).toBe("preview");
      expect(event.release).toBe("abc123");
      const value = (event.exception as { values: Array<{ value: string }> }).values[0].value;
      expect(value).toBe("grant failed for [email] with [jwt]");
    }

    const logs = items
      .filter((item) => item.header.type === "log")
      .flatMap((item) => (item.payload as { items: Array<{ body: string; level: string }> }).items);
    const errorLogs = logs.filter((log) => log.level === "error").map((log) => log.body);
    expect(errorLogs.sort()).toEqual([
      "grant failed for [email] (staff-a)",
      "grant failed for [email] (staff-b)",
    ]);

    const everything = received.join("\n");
    expect(everything).not.toContain("example.com");
    expect(everything).not.toContain(JWT);
  });

  test("a Database search for an email or a name arrives scrubbed (review C1, C2, I4)", async () => {
    received.length = 0;
    // The Database browser is a GET server function: the search box travels in
    // ?payload=. The request data is attached the way the SDK's HTTP
    // instrumentation does on a deployed server, client IP header included.
    const entry = createObservedServerEntry(async (request: Request) => {
      const url = new URL(request.url);
      Sentry.getIsolationScope().setSDKProcessingMetadata({
        normalizedRequest: {
          url: request.url,
          method: request.method,
          query_string: url.search.slice(1),
          headers: {
            "x-forwarded-for": "203.0.113.9",
            "user-agent": "staff-browser",
            referer: request.url,
          },
        },
      });
      Sentry.addBreadcrumb({
        category: "fetch",
        type: "http",
        data: { method: "GET", url: request.url, status_code: 500 },
      });
      const run = Sentry.sentryGlobalFunctionMiddleware.options.server;
      if (!run) throw new Error("sentry function middleware has no server handler");
      try {
        return (await run({
          next: async () => {
            identify("staff-c");
            const search = new URL(request.url).searchParams.get("payload") ?? "";
            const key = ["admin:database-table", "profiles", 0, JSON.parse(search).data.search];
            Sentry.setExtra("queryKey", structuralKey(key));
            throw new Error("adminBrowseTable failed");
          },
          serverFnMeta: {
            id: "fn-id",
            name: "adminBrowseTable",
            filename: "database.functions.ts",
          },
        })) as Response;
      } catch {
        return new Response("error", { status: 500 });
      }
    });

    const searchFor = (search: string) =>
      entry.fetch(
        new Request(
          `https://admin.mila.app/_serverFn/adminBrowseTable?payload=${encodeURIComponent(
            JSON.stringify({ data: { table: "profiles", page: 0, search } }),
          )}`,
        ),
      );
    await searchFor(SEARCHED_EMAIL);
    await searchFor(SEARCHED_NAME);
    expect(await Sentry.flush(5000)).toBe(true);

    const events = received
      .flatMap(parseEnvelope)
      .filter((item) => item.header.type === "event")
      .map((item) => item.payload as Record<string, any>);
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event.user).toEqual({ id: "staff-c" });
      expect(event.request.url).toBe(
        "https://admin.mila.app/_serverFn/adminBrowseTable?payload=[redacted]",
      );
      expect(event.request.query_string).toBe("payload=[redacted]");
      expect(event.request.headers).toEqual({
        "user-agent": "staff-browser",
        referer: "https://admin.mila.app/_serverFn/adminBrowseTable?payload=[redacted]",
      });
      expect(event.extra.queryKey).toEqual(["admin:database-table", 0]);
      const fetchCrumb = event.breadcrumbs.find((crumb: any) => crumb.category === "fetch");
      expect(fetchCrumb.data.url).toBe(
        "https://admin.mila.app/_serverFn/adminBrowseTable?payload=[redacted]",
      );
    }

    const everything = received.join("\n");
    for (const leak of ["jane", "Jane", "%40", "example.com", "203.0.113.9"]) {
      expect(everything).not.toContain(leak);
    }
  });

  test("a Postgres error logged by a server function keeps its code, not the row (review N3)", async () => {
    received.length = 0;
    // What database.functions.ts / admin.functions.ts do on a failed query: the
    // SDK turns this console.error into a log whose text embeds the error JSON.
    const { PostgrestError } = await import("@supabase/postgrest-js");
    for (const details of PG_DETAILS) {
      console.error(
        "[adminBrowseTable] query failed",
        "profiles",
        new PostgrestError({ message: "query failed", details, hint: "", code: "23505" }),
      );
    }
    expect(await Sentry.flush(5000)).toBe(true);

    const bodies = received
      .flatMap(parseEnvelope)
      .filter((item) => item.header.type === "log")
      .flatMap((item) => (item.payload as { items: Array<{ body: string }> }).items)
      .map((log) => log.body);
    expect(bodies).toHaveLength(PG_DETAILS.length);
    for (const body of bodies) {
      expect(body).toContain("[adminBrowseTable] query failed");
      expect(body).toContain("23505");
      expect(body).toContain("[redacted]");
    }
    const everything = received.join("\n");
    for (const leak of ["janedoe", "Jane", "0917", "123 4567"]) {
      expect(everything).not.toContain(leak);
    }
  });

  test("round 5: the reviewer's real-SDK probes (o2-r4-rr sdk.ts, sdk2.ts) send no member data", async () => {
    received.length = 0;
    const name = SEARCHED_NAME;
    const handle = ["jane", "doe88"].join(".");
    const toJSON = () => ({ full_name: name });
    // A, F: an own toJSON through a log attribute, a console argument, a breadcrumb and extra.
    Sentry.logger.error("[A1] attr toJSON", { member: { toJSON } });
    console.error("[A2] console toJSON", { toJSON });
    Sentry.addBreadcrumb({ category: "x", message: "[F1] crumb", data: { m: { toJSON } } });
    Sentry.captureException(new Error("[F2] extra toJSON"), { extra: { m: { toJSON } } });
    // B: a member message beside a short code, in a log and in extra.
    console.error("[B1] support row", { id: 1, code: "ABC", message: `${name} here` });
    Sentry.captureException(new Error("[B2] boom"), {
      extra: { row: { code: "ABC", message: `${name} here` } },
    });
    // C: a Postgres expression index with a cast. D: an unquoted key. E: a numeric phone.
    console.error("[C1] pg", {
      code: "23505",
      details: `Key (lower((username)::text))=(${handle}) already exists.`,
      message: "duplicate key",
    });
    console.error(`[D1] updating full_name: ${name}`);
    Sentry.logger.warn("[E1] contact", { contact: 9171234567 });
    expect(await Sentry.flush(5000)).toBe(true);

    const everything = received.join("\n");
    expect(everything).toContain("[B2] boom");
    expect(everything).toContain("[C1] pg");
    for (const leak of ["Jane", handle, "9171234567"]) {
      expect(everything).not.toContain(leak);
    }
  });

  test("round 6: the re-review's reproducers (o2-r5-rr) send no member data through the SDK", async () => {
    received.length = 0;
    const name = SEARCHED_NAME;
    const other = ["Maria", "Cruz"].join(" ");
    const handle = ["jane", "doe88"].join(".");
    const gender = ["Non", "binary"].join("-");
    // I1: an enum's length. M4: keys that are names and handles. M6: a query key, a phone-shaped amount.
    Sentry.logger.info("[R6-1] profile", { gender });
    console.error("[R6-2] keyed", { [name]: 1, counts: { [other]: 3 } });
    Sentry.captureException(new Error("[R6-3] query"), {
      extra: { queryKey: ["admin:database-table", "profiles", 1, name], amount: 9171234567 },
      fingerprint: ["{{ default }}", name],
    });
    // M5: an Error subclass's own title, and a person's name as an Error's name.
    class TitledError extends Error {
      title = `${name}'s outfit`;
    }
    Sentry.captureException(new TitledError("[R6-4] titled"));
    const named = new Error("[R6-5] named");
    named.name = name;
    Sentry.captureException(named);
    // M1, M2: error-text and capitalised, dotted and unspaced keys in log text.
    console.error(`[R6-6] FULL_NAME: ${name}; profile.full_name: ${name}; title: ${name}`);
    console.error(`[R6-7] full_name:${name} member.username=${handle}`);
    // M8: breadcrumb data that is a string.
    Sentry.addBreadcrumb({ category: "custom", message: "[R6-8] crumb", data: name as never });
    Sentry.captureException(new Error("[R6-9] after crumb"));
    expect(await Sentry.flush(5000)).toBe(true);

    const everything = received.join("\n");
    for (const marker of [
      "[R6-3] query",
      "[R6-4] titled",
      "[R6-5] named",
      "admin:database-table",
    ]) {
      expect(everything).toContain(marker);
    }
    for (const leak of ["Jane", "Maria", handle, "9171234567", gender, "[redacted:10]"]) {
      expect(everything).not.toContain(leak);
    }
  });
});
