import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { notFound, redirect } from "@tanstack/react-router";
import {
  MAX_SCRUB_LENGTH,
  isControlFlowThrow,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
  scrubQueryString,
  scrubString,
  scrubValue,
  structuralKey,
} from "./scrub";

// Built from parts so no scanner mistakes a fixture for a live credential.
const JWT = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "c2lnbmF0dXJlLXZhbHVl"].join(
  ".",
);
const DATA_URI = `data:image/png;base64,${"iVBORw0KGgo".repeat(20)}`;

// Absolute wall-clock limits are a tripwire for a catastrophe only: an exponential
// regex costs seconds to hours, far over these. They are loose on purpose so a busy
// CI runner cannot flake them. Linear versus quadratic is the scaling test's job.
const WALL_CLOCK_LIMIT_MS = 500;
const WALL_CLOCK_LIMIT_LARGE_MS = 1000;

describe("scrubString", () => {
  test("redacts email addresses", () => {
    expect(scrubString("could not invite jane.doe+mila@example.co.uk today")).toBe(
      "could not invite [email] today",
    );
  });

  test("redacts JWTs and bearer tokens", () => {
    expect(scrubString(`token ${JWT} rejected`)).toBe("token [jwt] rejected");
    expect(scrubString("Authorization: Bearer abc.def-123_xyz")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  test("redacts data URIs and long base64 runs", () => {
    expect(scrubString(`avatar ${DATA_URI} too big`)).toBe("avatar [data-uri] too big");
    expect(scrubString(`blob ${"QUJD".repeat(40)} end`)).toBe("blob [base64] end");
  });

  test("redacts credentials carried in URL query strings and fragments", () => {
    expect(
      scrubString("https://x.supabase.co/auth/v1/verify?token=abc123&type=signup&redirect_to=/x"),
      // redirect_to is not on the safe-key list: it can carry a whole URL with its own query.
    ).toBe(
      "https://x.supabase.co/auth/v1/verify?token=[redacted]&type=signup&redirect_to=[redacted]",
    );
    // Round 5: `type` keeps only Supabase's auth link types.
    expect(
      scrubString("https://admin.mila.app/#access_token=aaa&refresh_token=bbb&type=recovery"),
    ).toBe(
      "https://admin.mila.app/#access_token=[redacted]&refresh_token=[redacted]&type=recovery",
    );
    expect(scrubString("https://admin.mila.app/#access_token=aaa&type=x")).toBe(
      "https://admin.mila.app/#access_token=[redacted]&type=[redacted]",
    );
    // Round 5 (N11): a Storage object path is the member's, after the bucket.
    expect(scrubString("/storage/v1/object/sign/posts/a.jpg?token=zzz")).toBe(
      "/storage/v1/object/sign/posts/:path?token=[redacted]",
    );
  });

  test("redacts secret fields inside JSON text and Supabase API keys", () => {
    // Round 5: `plan` is not a debug key, so its value goes too (with its length).
    expect(scrubString('{"password":"hunter2","plan":"pro"}')).toBe(
      '{"password":"[redacted]","plan":"[redacted]"}',
    );
    expect(scrubString("key sb_secret_AbC123-xyz leaked")).toBe("key [supabase-key] leaked");
  });

  test("leaves ordinary text and stack lines alone; a member's id becomes :uuid (round 4)", () => {
    const plain =
      "TypeError: Cannot read properties of undefined (reading 'id')\n    at loadMembers (/assets/members-Bx12.js:1:200)";
    expect(scrubString(plain)).toBe(plain);
    expect(scrubString("member 0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10 not found")).toBe(
      "member :uuid not found",
    );
  });
});

describe("scrubValue", () => {
  test("walks nested objects and arrays, filtering secret-named keys", () => {
    const out = scrubValue({
      email: "jane@example.com",
      nested: { authorization: "Bearer x", list: ["ok", "bob@example.com"], count: 3 },
      access_token: "abc",
      refreshToken: "def",
      apikey: "k",
      id: "u-1",
    });
    // Round 5: structured data is on a key allowlist. `email` and `list` are not
    // debug keys, so their strings go, with their length; `count` stays.
    expect(out).toEqual({
      email: "[redacted]",
      nested: { authorization: "[Filtered]", list: ["[redacted]", "[redacted]"], count: 3 },
      access_token: "[Filtered]",
      refreshToken: "[Filtered]",
      apikey: "[Filtered]",
      id: "[redacted]",
    });
    expect(scrubValue({ id: "0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10", status: "active" })).toEqual({
      id: ":uuid",
      status: "active",
    });
  });

  test("survives cycles and class instances without throwing", () => {
    // `kind`, a debug key: a word-shaped value under it stays.
    const a: Record<string, unknown> = { kind: "a" };
    a.self = a;
    const out = scrubValue({ a, when: new Date(0) }) as Record<string, unknown>;
    expect((out.a as Record<string, unknown>).kind).toBe("a");
    expect(out.when).toBeInstanceOf(Date);
  });
});

describe("scrubEvent", () => {
  test("keeps only the user id and scrubs every string in the event", () => {
    const event = scrubEvent({
      message: "failed for jane@example.com",
      user: { id: "staff-1", email: "jane@example.com", ip_address: "203.0.113.9", username: "j" },
      exception: { values: [{ type: "Error", value: `bad token ${JWT}` }] },
      request: {
        url: "https://admin.mila.app/reset?token=abc",
        cookies: { "sb-access-token": "x" },
        headers: { Authorization: "Bearer y", "User-Agent": "UA" },
        data: { email: "jane@example.com" },
      },
      breadcrumbs: [{ message: "POST jane@example.com", category: "fetch" }],
      extra: { queryKey: ["members", "jane@example.com"] },
    });
    expect(event?.user).toEqual({ id: "staff-1" });
    expect(event?.message).toBe("failed for [email]");
    expect(event?.exception?.values?.[0]?.value).toBe("bad token [jwt]");
    expect(event?.request?.url).toBe("https://admin.mila.app/reset?token=[redacted]");
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.headers).toEqual({ Authorization: "[Filtered]", "User-Agent": "UA" });
    expect(JSON.stringify(event)).not.toContain("example.com");
  });

  test("drops the user entirely when there is no id", () => {
    expect(scrubEvent({ user: { email: "jane@example.com" } })?.user).toBeUndefined();
  });

  test("never touches the SDK's internal processing metadata", () => {
    const internal = { capturedSpanScope: { anything: "jane@example.com" } };
    const event = scrubEvent({ message: "x", sdkProcessingMetadata: internal });
    expect(event?.sdkProcessingMetadata).toBe(internal);
  });
});

describe("scrubBreadcrumb and scrubLog", () => {
  test("scrub breadcrumb messages and data", () => {
    expect(
      scrubBreadcrumb({
        category: "fetch",
        message: "GET jane@example.com",
        data: { url: "https://x.supabase.co/rest/v1/profiles?apikey=sb_publishable_abc" },
      }),
    ).toEqual({
      category: "fetch",
      message: "GET [email]",
      data: { url: "https://x.supabase.co/rest/v1/profiles?apikey=[redacted]" },
    });
  });

  test("scrub log messages and attributes", () => {
    expect(
      scrubLog({
        level: "error",
        message: "invite failed for jane@example.com",
        attributes: { "sentry.message.parameter.0": "jane@example.com", "user.id": "staff-1" },
      }),
    ).toEqual({
      level: "error",
      message: "invite failed for [email]",
      // Round 6 (R5-M6): a log parameter is an id or a word; the message carries the text.
      attributes: { "sentry.message.parameter.0": "[redacted]", "user.id": "staff-1" },
    });
  });
});

describe("isControlFlowThrow", () => {
  test("recognises router redirects and not-found throws, nothing else", () => {
    expect(isControlFlowThrow(redirect({ to: "/" }))).toBe(true);
    expect(isControlFlowThrow(notFound())).toBe(true);
    expect(isControlFlowThrow(new Error("boom"))).toBe(false);
    expect(isControlFlowThrow(new Response("x", { status: 500 }))).toBe(false);
    expect(isControlFlowThrow(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Review round 1 (O2-review.md). Sample inputs are the reviewer's.
// ---------------------------------------------------------------------------

/** The Database browser's GET server function: the search box ends up in ?payload=. */
const searchUrl = (search: string) =>
  `/_serverFn/abc123?payload=${encodeURIComponent(
    JSON.stringify({ data: { table: "profiles", page: 0, search } }),
  )}`;

describe("C1: query values are secret unless the key is known-safe", () => {
  test("a search for an email or a name in ?payload= is redacted", () => {
    expect(
      scrubString(
        "/_serverFn/abc123?payload=%7B%22data%22%3A%7B%22table%22%3A%22profiles%22%2C%22page%22%3A0%2C%22search%22%3A%22jane%40example.com%22%7D%7D",
      ),
    ).toBe("/_serverFn/abc123?payload=[redacted]");
    expect(scrubString(searchUrl("Jane Doe"))).toBe("/_serverFn/abc123?payload=[redacted]");
  });

  test("a PostgREST filter carrying the search is redacted, structural params survive", () => {
    expect(
      scrubString(
        "https://x.supabase.co/rest/v1/profiles?select=*&or=(full_name.ilike.%25Jane%2520Doe%25)&order=created_at.desc&limit=50",
      ),
    ).toBe(
      "https://x.supabase.co/rest/v1/profiles?select=*&or=[redacted]&order=created_at.desc&limit=50",
    );
    expect(
      scrubString(
        "https://x.supabase.co/rest/v1/profiles?select=id&email=eq.jane%40example.com&limit=1",
      ),
    ).toBe("https://x.supabase.co/rest/v1/profiles?select=id&email=[redacted]&limit=1");
  });

  test("safe keys keep structural values only", () => {
    const structural =
      "/database?table=profiles&page=2&type=recovery&order=created_at.desc&limit=50";
    expect(scrubString(structural)).toBe(structural);
    expect(scrubString("/?redirect=%2Fmembers")).toBe("/?redirect=%2Fmembers");
    expect(scrubString("/?redirect=%2Fdatabase%3Fsearch%3Djane")).toBe("/?redirect=[redacted]");
    expect(scrubString("/database?search=Jane%20Doe&table=profiles")).toBe(
      "/database?search=[redacted]&table=profiles",
    );
  });

  test("URL-encoded and Unicode emails are recognised", () => {
    expect(scrubString("contact jane%40example.com now")).toBe("contact [email] now");
    expect(scrubString("jane%2Bmila%40example.com")).toBe("[email]");
    expect(scrubString("jané@exämple.com")).toBe("[email]");
  });

  test("every URL surface of an event is redacted: request, breadcrumbs, spans", () => {
    const url = `https://admin.mila.app${searchUrl("jane@example.com")}`;
    const event = scrubEvent({
      request: { url, query_string: "search=Jane%20Doe&table=profiles", headers: { referer: url } },
      breadcrumbs: [{ category: "fetch", data: { url, method: "GET" } }],
      spans: [
        {
          description: `GET ${url}`,
          data: {
            "url.full": url,
            "http.url": url,
            "http.query": "?search=Jane%20Doe&page=1",
            "url.query": "search=Jane%20Doe&page=1",
          },
        },
      ],
    });
    const text = JSON.stringify(event);
    expect(text).not.toContain("jane");
    expect(text).not.toContain("Jane");
    expect(event.request.url).toBe("https://admin.mila.app/_serverFn/abc123?payload=[redacted]");
    expect(event.request.query_string).toBe("search=[redacted]&table=profiles");
    expect(event.spans[0].data["url.query"]).toBe("search=[redacted]&page=1");
    expect(event.spans[0].data["http.query"]).toBe("?search=[redacted]&page=1");
  });

  test("query_string in object or pair-list form is redacted per key", () => {
    expect(
      scrubEvent({ request: { query_string: { search: "Jane", page: "1" } } }).request.query_string,
    ).toEqual({ search: "[redacted]", page: "1" });
    expect(
      scrubEvent({
        request: {
          query_string: [
            ["search", "Jane"],
            ["page", "1"],
          ],
        },
      }).request.query_string,
    ).toEqual([
      ["search", "[redacted]"],
      ["page", "1"],
    ]);
  });

  test("values under search-like keys are redacted wherever they appear", () => {
    expect(scrubValue({ search: "Jane Doe", q: "jane", query: "Doe", page: 2 })).toEqual({
      search: "[redacted]",
      q: "[redacted]",
      query: "[redacted]",
      page: 2,
    });
  });
});

describe("C2: structuralKey keeps a query key's namespace, numbers and ids only", () => {
  test("search text and table names are dropped", () => {
    expect(structuralKey(["admin:database-table", "profiles", 0, "Jane Doe"])).toEqual([
      "admin:database-table",
      0,
    ]);
    expect(structuralKey(["admin:shop-items", { brand: "x" }, 3])).toEqual(["admin:shop-items", 3]);
  });

  test("UUIDs and booleans survive, a missing key stays missing", () => {
    const id = "0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10";
    expect(structuralKey(["admin:member-billing", id, true])).toEqual([
      "admin:member-billing",
      id,
      true,
    ]);
    expect(structuralKey(undefined)).toBeUndefined();
  });
});

describe("I1: a bare query string's first parameter is redacted", () => {
  test("token, code and token_hash at the start of the string", () => {
    expect(scrubString("token=abc123&type=signup")).toBe("token=[redacted]&type=signup");
    expect(scrubString("code=abc123&type=recovery")).toBe("code=[redacted]&type=recovery");
    expect(scrubQueryString("token_hash=abc&type=email")).toBe("token_hash=[redacted]&type=email");
    expect(scrubQueryString("search=Jane")).toBe("search=[redacted]");
  });

  test("Sentry's bare request.query_string", () => {
    expect(
      scrubEvent({ request: { query_string: "code=abc123&type=recovery" } }).request.query_string,
    ).toBe("code=[redacted]&type=recovery");
  });

  test("prose with = signs is not mistaken for a query", () => {
    expect(scrubString("retry count=3 status=500 code=PGRST205")).toBe(
      "retry count=3 status=500 code=PGRST205",
    );
    expect(scrubString("failed (code: 42P01)")).toBe("failed (code: 42P01)");
  });
});

describe("I2: scrubbing is linear and capped", () => {
  const time = (input: string) => {
    const start = performance.now();
    scrubString(input);
    return performance.now() - start;
  };

  test("a 2 MB string is cut to the cap and finishes well inside the wall-clock limit", () => {
    scrubString("warm up jane@example.com");
    expect(time("a".repeat(2_000_000))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
  });

  test("adversarial inputs stay fast", () => {
    const inputs = [
      "a".repeat(200_000),
      "a.".repeat(100_000),
      "a@".repeat(100_000),
      `x@${"a.".repeat(100_000)}1`,
      "%40".repeat(70_000),
      "?a".repeat(100_000),
      `"${"a".repeat(200_000)}`,
      '"a'.repeat(100_000),
      "sb-".repeat(70_000),
      "eyJ".repeat(70_000),
      "Bearer ".repeat(30_000),
      "password: '".repeat(20_000),
      `data:${"a/b;".repeat(50_000)}`,
      "a=b&".repeat(50_000),
    ];
    for (const input of inputs) {
      expect(time(input)).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    }
  });

  test("long strings are cut to the cap without leaving half an email at the end", () => {
    const filler = "x ".repeat(MAX_SCRUB_LENGTH / 2 - 4);
    const out = scrubString(`${filler}jane.doe@example.com and more text`);
    expect(out.endsWith("[truncated]")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_SCRUB_LENGTH + "[truncated]".length);
    expect(out).not.toContain("jane");
  });
});

describe("I3: credential text forms", () => {
  test("Cookie headers and Supabase auth cookies", () => {
    expect(scrubString("Cookie: session=abcdef0123456789; sb-abcdef-auth-token=base64-AAAA")).toBe(
      "Cookie: [redacted]",
    );
    expect(scrubString("sb-abcdefghijklmnopqrst-auth-token=base64-eyJhY2Nlc3NfdG9rZW4i")).toBe(
      "sb-[ref]-auth-token=[redacted]",
    );
    expect(scrubString("sb-abcdef-auth-token.0=%7B%22access_token%22%3A%22abc%22%7D")).toBe(
      "sb-[ref]-auth-token=[redacted]",
    );
  });

  test("Basic and Digest auth after an Authorization header, without eating prose", () => {
    expect(scrubString("Authorization: Basic dXNlcjpwYXNz")).toBe(
      "Authorization: Basic [redacted]",
    );
    expect(scrubString("Proxy-Authorization: Digest username123")).toBe(
      "Proxy-Authorization: Digest [redacted]",
    );
    expect(scrubString("Basic subscription renewed")).toBe("Basic subscription renewed");
  });

  test("unquoted, single-quoted and camelCase secret fields", () => {
    expect(scrubString("refresh_token: abcdefghijkl")).toBe("refresh_token: [redacted]");
    // Round 5: `plan` is not a debug key.
    expect(scrubString("{ password: 'hunter2', plan: 'pro' }")).toBe(
      "{ password: [redacted], plan: '[redacted]' }",
    );
    expect(scrubString("service_role_key=abcdef")).toBe("service_role_key=[redacted]");
    expect(
      scrubString(
        '{"accessToken":"abc","refreshToken":"abcdefghijkl","captchaToken":"cap","plan":"pro"}',
      ),
    ).toBe(
      '{"accessToken":"[redacted]","refreshToken":"[redacted]","captchaToken":"[redacted]","plan":"[redacted]"}',
    );
  });

  test("two-segment and truncated JWTs", () => {
    expect(scrubString("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdGFmZiJ9")).toBe("[jwt]");
    expect(scrubString(`x ${JWT.slice(0, 60)}`)).toBe("x [jwt]");
  });

  test("non-base64 data URIs", () => {
    expect(scrubString("img data:image/svg+xml;utf8,<svg>jane</svg> end")).toBe(
      "img [data-uri] end",
    );
    expect(scrubString("data:text/plain,hello%20world")).toBe("[data-uri]");
  });

  test("proxy-authorization and x-supabase-* header keys are filtered", () => {
    expect(
      scrubValue({
        "proxy-authorization": "Basic abc",
        "x-supabase-auth": "abc",
        "content-type": "application/json",
      }),
    ).toEqual({
      "proxy-authorization": "[Filtered]",
      "x-supabase-auth": "[Filtered]",
      // Round 5: a header name that is not a debug key loses its value (request headers
      // in an event are Sentry structure and keep theirs: see the scrubEvent tests).
      "content-type": "[redacted]",
    });
  });

  test("token_hash is filtered; code is judged by its value", () => {
    expect(scrubValue({ routeSearch: { code: "abc", token_hash: "def" } })).toEqual({
      routeSearch: { code: "[redacted]", token_hash: "[Filtered]" },
    });
    for (const code of ["PGRST205", "42P01", "23505", "invalid_credentials", "ECONNRESET"]) {
      expect(scrubValue({ code })).toEqual({ code });
    }
    expect(scrubValue({ code: 400 })).toEqual({ code: 400 });
    expect(scrubValue({ code: "0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10" })).toEqual({
      code: "[redacted:36]",
    });
  });
});

describe("I4: IP-bearing headers are dropped by the scrubber itself", () => {
  test("request headers", () => {
    const event = scrubEvent({
      request: {
        headers: {
          "x-forwarded-for": "203.0.113.9",
          "x-real-ip": "203.0.113.9",
          "x-vercel-forwarded-for": "203.0.113.9",
          "x-vercel-ip-city": "Manila",
          "cf-connecting-ip": "203.0.113.9",
          forwarded: "for=203.0.113.9",
          "user-agent": "UA",
        },
        env: { REMOTE_ADDR: "203.0.113.9" },
      },
    });
    expect(event.request.headers).toEqual({ "user-agent": "UA" });
    expect(JSON.stringify(event)).not.toContain("203.0.113.9");
    expect(JSON.stringify(event)).not.toContain("Manila");
  });

  test("the same headers written out as text", () => {
    expect(scrubString("x-forwarded-for: 203.0.113.9, 10.0.0.1")).toBe(
      "x-forwarded-for: [redacted]",
    );
    expect(scrubString("X-Real-IP=203.0.113.9")).toBe("X-Real-IP=[redacted]");
  });

  test("the same headers and client addresses as span attributes", () => {
    const out = scrubValue({
      "http.request.header.x_forwarded_for": "203.0.113.9",
      "http.request.header.x-real-ip": "203.0.113.9",
      "client.address": "203.0.113.9",
      "http.method": "GET",
    });
    expect(JSON.stringify(out)).not.toContain("203.0.113.9");
    expect((out as Record<string, unknown>)["http.method"]).toBe("GET");
  });
});

describe("M1: the walk keeps data it can safely keep", () => {
  test("a shared, non-cyclic reference is scrubbed in both places", () => {
    // `error` is a debug key whose text is kept, scrubbed.
    const shared = { error: "failed for jane@example.com" };
    expect(scrubValue({ a: shared, b: shared })).toEqual({
      a: { error: "failed for [email]" },
      b: { error: "failed for [email]" },
    });
  });

  test("Map, Set, URL, URLSearchParams and Headers are scrubbed, not emptied", () => {
    const out = scrubValue({
      map: new Map([["who", "jane@example.com"]]),
      set: new Set(["jane@example.com"]),
      url: new URL("https://a.co/x?search=Jane"),
      params: new URLSearchParams("search=Jane&page=1"),
      headers: new Headers({ authorization: "Bearer abcdefgh", accept: "x" }),
    });
    // Round 5: Map, Set and Headers contents go through the key allowlist. Round 6:
    // `params` is a list of ids and words (R5-M6); Headers keep the header allowlist (R5-M8).
    expect(out).toEqual({
      map: { who: "[redacted]" },
      set: ["[redacted]"],
      url: "https://a.co/x?search=[redacted]",
      params: "[redacted]",
      headers: { authorization: "[Filtered]", accept: "x" },
    });
  });

  test("object keys are scrubbed too", () => {
    // Round 6 (R5-M4): an address used as a key goes as a key.
    expect(scrubValue({ "jane@example.com": 1 })).toEqual({ "[key]": 1 });
  });
});

describe("browser compatibility", () => {
  test("no regex lookbehind: Safari before 16.4 cannot parse it, and this module loads with the page", () => {
    for (const file of ["./scrub.ts", "./scrub-email.ts", "./scrub-keys.ts", "./scrub-ui.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/\(\?<[=!]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Review round 2 (O2-rereview.md). Sample inputs are the reviewer's.
// ---------------------------------------------------------------------------

const timed = (run: () => unknown) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

describe("N1: click breadcrumbs keep the element path, never the member text", () => {
  const click = (message: string) =>
    scrubBreadcrumb({ category: "ui.click", message }) as { message: string };

  // Round 5 (N10): without the clicked element nothing in the text can be trusted, so
  // the message is redacted whole. With the element (the real SDK always passes it)
  // the path is rebuilt: click-breadcrumbs.test.ts and scrub.round5.test.ts.
  test("title, aria-label and alt values never survive without the element", () => {
    for (const message of [
      'tr.row > td.px-5.truncate[title="Jane Doe"]',
      'td.px-5.py-3.truncate[title="I feel anxious about my ex, how do I tell my mom"]',
      'div.flex > button[role=switch][aria-label="Steward role for Jane Doe"]',
      'button.h-8.px-3[aria-label="Delete post by Jane Doe"][title="Delete"]',
      'input.h-9[type="text"][name="search"]',
      'img.avatar[alt="Photo of Jane Doe"]',
    ]) {
      expect(click(message).message).toBe("[redacted]");
    }
  });

  test("quotes inside a value and an over-long value cannot leak the rest", () => {
    expect(click('button[title="He said "hi" to Jane"]').message).toBe("[redacted]");
    const long = click(`td.cell[title="${"Jane Doe ".repeat(400)}"]`).message;
    expect(long).toBe("[redacted]");
  });

  test("ui.input and other ui.* breadcrumbs too; other categories keep their text", () => {
    const input = scrubBreadcrumb({
      category: "ui.input",
      message: 'input[aria-label="Note about Jane"]',
    }) as { message: string };
    expect(input.message).toBe("[redacted]");
    const consoleCrumb = scrubBreadcrumb({
      category: "console",
      message: 'button[title="Delete"] clicked',
    }) as { message: string };
    // Round 6 (R5-M1): `title="…"` reads like its JSON form, so a title outside an error goes.
    expect(consoleCrumb.message).toBe('button[title="[redacted]"] clicked');
  });

  test("linear on hostile input", () => {
    expect(timed(() => click('[title="'.repeat(4_000)))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    expect(timed(() => click(`a[title="${'x"]'.repeat(10_000)}`))).toBeLessThan(
      WALL_CLOCK_LIMIT_MS,
    );
  });
});

describe("N2: the walk is linear on shared references", () => {
  // The output keeps shared references shared, so it is inspected node by node:
  // JSON.stringify would expand a diamond into 2^depth copies. (Sentry itself
  // normalizes breadcrumb data to a small depth before serializing it.)
  const strings = (value: unknown, seen = new WeakSet<object>(), found: string[] = []) => {
    if (typeof value === "string") found.push(value);
    else if (value && typeof value === "object" && !seen.has(value)) {
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        found.push(key);
        strings(child, seen, found);
      }
    }
    return found;
  };

  test("a 60-level diamond finishes inside the wall-clock limit and keeps both branches", () => {
    let node: Record<string, unknown> = { v: "jane@example.com" };
    for (let i = 0; i < 60; i++) node = { l: node, r: node };
    let out: unknown;
    expect(timed(() => (out = scrubValue(node)))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    const top = out as { l: unknown; r: unknown };
    expect(top.r).toBe(top.l);
    expect(strings(out)).toContain("[truncated]");
  });

  test("a 2000-node fiber-like graph finishes inside the wall-clock limit", () => {
    const nodes: Array<Record<string, unknown>> = Array.from({ length: 2000 }, (_, i) => ({
      tag: i,
      memoizedProps: { i, title: "jane@example.com" },
      stateNode: { i },
    }));
    nodes.forEach((fiber, i) => {
      fiber.return = nodes[Math.max(0, (i - 1) >> 1)];
      fiber.child = nodes[2 * i + 1] ?? null;
      fiber.sibling = nodes[i + 1] ?? null;
      fiber.alternate = { ...fiber, alternate: fiber };
    });
    let out: unknown;
    expect(timed(() => (out = scrubValue(nodes[0])))).toBeLessThan(WALL_CLOCK_LIMIT_LARGE_MS);
    const found = strings(out);
    // `title` is not a debug key (round 5): the value goes with its length.
    expect(found).toContain("[redacted]");
    expect(found.some((text) => text.includes("jane@"))).toBe(false);
  });

  test("cycles are still marked, shared references still kept", () => {
    const shared = { kind: "x" };
    const cyclic: Record<string, unknown> = { a: shared, b: shared };
    cyclic.self = cyclic;
    expect(scrubValue(cyclic)).toEqual({ a: { kind: "x" }, b: { kind: "x" }, self: "[Circular]" });
  });
});

describe("N3: Postgres errors keep the constraint and column, never the row values", () => {
  const uuid = "0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10";

  test("the four templates, raw", () => {
    expect(scrubString("Key (username)=(janedoe) already exists.")).toBe(
      "Key (username)=([redacted]) already exists.",
    );
    expect(scrubString(`Key (user_id, role)=(${uuid}, admin) already exists.`)).toBe(
      "Key (user_id, role)=([redacted]) already exists.",
    );
    expect(scrubString(`Key (user_id)=(${uuid}) is not present in table "users".`)).toBe(
      'Key (user_id)=([redacted]) is not present in table "users".',
    );
    expect(scrubString(`Failing row contains (${uuid}, Jane Doe, 0917 123 4567, null).`)).toBe(
      "Failing row contains ([redacted]).",
    );
    expect(scrubString('invalid input syntax for type uuid: "Jane Doe"')).toBe(
      'invalid input syntax for type uuid: "[redacted]"',
    );
    expect(
      scrubString(
        "failed to parse logic tree ((full_name.ilike.%Jane Doe%,username.ilike.%Jane Doe%))",
      ),
    ).toBe("failed to parse logic tree ([redacted])");
    expect(
      scrubString('"failed to parse logic tree ((full_name.ilike.%Jane Doe%))" (line 1, column 6)'),
    ).toBe('"failed to parse logic tree ([redacted])" (line 1, column 6)');
  });

  test("JSON-escaped, as the SDK formats an error inside a log line", () => {
    const json = JSON.stringify({
      code: "22P02",
      details: 'invalid input syntax for type uuid: "Jane Doe"',
      message: "query failed",
    });
    expect(scrubString(json)).toBe(
      JSON.stringify({
        code: "22P02",
        details: 'invalid input syntax for type uuid: "[redacted]"',
        message: "query failed",
      }),
    );
    const row = JSON.stringify({
      details: "Failing row contains (1, Jane Doe, 0917).",
      code: "23514",
    });
    expect(scrubString(row)).toBe(
      JSON.stringify({ details: "Failing row contains ([redacted]).", code: "23514" }),
    );
  });

  test("constraint names, codes and the rest of the message stay readable", () => {
    const keep = 'duplicate key value violates unique constraint "profiles_username_key"';
    expect(scrubString(keep)).toBe(keep);
    expect(scrubString("Key (a)=(x) conflicts with existing key (a)=(y).")).toBe(
      "Key (a)=([redacted]) conflicts with existing key (a)=([redacted]).",
    );
  });

  test("an over-long or oddly closed value is still removed", () => {
    expect(scrubString(`Failing row contains (${"Jane Doe, ".repeat(400)}`)).not.toContain("Jane");
    expect(scrubString('invalid input syntax for type uuid: "Jane \\"JD\\" Doe"')).not.toContain(
      "Jane",
    );
  });

  test("linear on hostile input", () => {
    for (const input of [
      "Key (a)=(".repeat(4_000),
      "Failing row contains (".repeat(1_500),
      'invalid input syntax for type uuid: "'.repeat(900),
      "failed to parse logic tree (".repeat(1_200),
    ]) {
      expect(timed(() => scrubString(input))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    }
  });

  test("an Error keeps its code, hint and details (scrubbed) in breadcrumbs", () => {
    const error = Object.assign(new Error("query failed"), {
      code: "23505",
      details: "Key (username)=(janedoe) already exists.",
      hint: "Use another username",
    });
    expect(scrubValue({ arguments: ["[adminBrowseTable] query failed", error] })).toMatchObject({
      arguments: [
        "[adminBrowseTable] query failed",
        {
          name: "Error",
          message: "query failed",
          code: "23505",
          details: "Key (username)=([redacted]) already exists.",
          hint: "Use another username",
        },
      ],
    });
  });
});

describe("the owner sees every error: error text is never over-redacted", () => {
  test("messages, stack traces, route ids and codes pass through unchanged", () => {
    for (const text of [
      'new row violates row-level security policy for table "profiles"',
      'duplicate key value violates unique constraint "profiles_username_key"',
      "Could not find the 'avatar' column of 'profiles' in the schema cache",
      "JWT expired",
      "Invariant failed: Could not find match for from: /_authed/members/$memberId",
      "TypeError: Cannot read properties of undefined (reading 'id')\n    at loadMembers (https://admin.mila.app/assets/members-Bx12.js:1:200)",
      "loadMembers@https://admin.mila.app/assets/members-Bx12.js:1:200",
      "onClick@https://admin.mila.app/assets/index-abc.js:1:2",
      "code: PGRST116, status: 406, hint: null",
      "Request failed with status code 500 (ECONNRESET)",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
    // The route stays readable; the member's id in it does not (round 4).
    expect(scrubString("route /_authed/members/0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10 failed")).toBe(
      "route /_authed/members/:id failed",
    );
  });
});

describe("N4 to N7: tighter safe keys, debuggable ids, search and member fields", () => {
  const uuid = "0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10";

  test("N4: safe keys accept only the value shape they really carry", () => {
    for (const url of [
      "/x?type=Jane+Doe",
      "/x?select=Jane%20Doe",
      "/x?order=Jane%20Marie%20Santos",
      "/x?limit=09171234567",
      "/x?redirect=members",
    ]) {
      expect(scrubString(url)).toMatch(/=\[redacted\]$/);
    }
    expect(scrubString("/x?table=profiles&table=Jane%20Doe")).toBe(
      "/x?table=profiles&table=[redacted]",
    );
    // A key that names an Object.prototype member is just an unknown key.
    expect(scrubString("/x?constructor=Jane&__proto__=Doe")).toBe(
      "/x?constructor=[redacted]&__proto__=[redacted]",
    );
  });

  test("N5: an id-shaped value never reopens a credential key", () => {
    expect(scrubString(`/auth/callback?code=${uuid}`)).toBe("/auth/callback?code=[redacted]");
    expect(scrubString(`/x?token=eq.${uuid}`)).toBe("/x?token=[redacted]");
  });

  test("N5: UUID filters keep their shape (the id is :uuid since round 4), !inner selects and the Vercel request id stay", () => {
    expect(scrubString(`/rest/v1/user_roles?user_id=eq.${uuid}&select=role`)).toBe(
      "/rest/v1/user_roles?user_id=eq.:uuid&select=role",
    );
    expect(scrubString(`/rest/v1/posts?id=in.(${uuid},${uuid})`)).toBe(
      "/rest/v1/posts?id=in.(:uuid,:uuid)",
    );
    expect(scrubString("/rest/v1/user_roles?user_id=eq.jane")).toBe(
      "/rest/v1/user_roles?user_id=[redacted]",
    );
    expect(scrubString("/rest/v1/posts?select=id,profiles!inner(full_name)")).toBe(
      "/rest/v1/posts?select=id,profiles!inner(full_name)",
    );
    const vercelId = "iad1::sfo1::abcde-1791311596541-0a1b2c3d4e5f";
    const event = scrubEvent({ request: { headers: { "x-vercel-id": vercelId } } }) as {
      request: { headers: Record<string, string> };
    };
    expect(event.request.headers["x-vercel-id"]).toBe(vercelId);
  });

  test("N5: a Firefox or Safari stack frame is not mistaken for an email", () => {
    // Real frames carry a URL after the at-sign. A bare file name there is an
    // address-shaped token and is redacted since round 4 (no TLD is validated).
    expect(scrubString("onClick@https://admin.mila.app/assets/index-abc.js:1:2")).toBe(
      "onClick@https://admin.mila.app/assets/index-abc.js:1:2",
    );
    expect(scrubString("render@webpack:///./src/members.tsx:42:10")).toBe(
      "render@webpack:///./src/members.tsx:42:10",
    );
    expect(scrubString("onClick@index-abc.js:1:2")).toBe("[email]:1:2");
    expect(scrubString("write to jane@example.com")).toBe("write to [email]");
  });

  test("N6: search keys inside JSON text", () => {
    expect(scrubString('x {"search":"Jane","page":1}')).toBe('x {"search":"[redacted]","page":1}');
  });

  test("N7: member fields are redacted wherever an object carries them", () => {
    expect(
      scrubValue({
        id: "u1",
        full_name: "Jane Doe",
        username: "janedoe",
        phone: "0917",
        content: "my private chat",
        author_name: "Jane Doe",
        status: "active",
      }),
    ).toEqual({
      // Round 5: strings under non-debug keys become [redacted:<length>]; "u1" is not id-shaped.
      id: "[redacted]",
      full_name: "[redacted]",
      username: "[redacted]",
      phone: "[redacted]",
      content: "[redacted]",
      author_name: "[redacted]",
      status: "active",
    });
  });
});

// ---------------------------------------------------------------------------
// Review round 3 (O2-rereview2.md): NEW-1, NEW-2, NEW-3. Samples are the reviewer's.
// ---------------------------------------------------------------------------

/** Best of `runs`: one timing is mostly scheduler noise on a shared machine. */
const bestOf = (runs: number, run: () => unknown) => {
  let best = Infinity;
  for (let i = 0; i < runs; i++) best = Math.min(best, timed(run));
  return best;
};

describe("NEW-1: the email rule stays cheap on long dotted domains", () => {
  const dotted = (size: number) => `a@${"b.".repeat(size / 2)}`;
  const label = (size: number) => `a@${"b".repeat(size)}`;

  test("a 32 KB dotted domain costs about what one 32 KB label does", () => {
    // Relative, so a slow runner slows both sides alike. The extension check used to sit
    // in a lookahead of the regex and made every dot a second scan of the domain.
    scrubString(dotted(32_000));
    scrubString(label(32_000));
    const dots = bestOf(5, () => scrubString(dotted(32_000)));
    const single = bestOf(5, () => scrubString(label(32_000)));
    expect(dots).toBeLessThan(4 * single);
  });

  test("time scales with the input: 64 KB takes under 4x the time of 32 KB (best of 3)", () => {
    const shapes: Array<(size: number) => string> = [
      dotted,
      label,
      (size) => `x@${"a.".repeat(size / 2)}1`,
      (size) => `a%40${"bb.".repeat(size / 3)}`,
      (size) => "a@".repeat(size / 2),
    ];
    for (const shape of shapes) {
      scrubString(shape(32_768));
      const half = bestOf(3, () => scrubString(shape(32_768)));
      const full = bestOf(3, () => scrubString(shape(65_536)));
      expect(full).toBeLessThan(4 * half);
    }
  });

  test("below the cap, four times the input costs well under sixteen times the time", () => {
    // The cap hides growth above 32 KB (64 KB is cut to 32 KB first), so growth
    // below it is checked too: linear is 4x, quadratic would be 16x.
    for (const shape of [dotted, label]) {
      scrubString(shape(8_192));
      const small = bestOf(5, () => scrubString(shape(8_192)));
      const large = bestOf(5, () => scrubString(shape(32_768)));
      expect(large).toBeLessThan(10 * small);
    }
  });

  test("a Firefox or Safari stack frame is still not an address; a real address still is", () => {
    for (const frame of [
      "onClick@https://admin.mila.app/assets/index-abc.js:1:2",
      "foo@https://admin.mila.app/assets/bar.js:12:3",
      "x@http://localhost:3000/y.json:1:1",
      "fn@/assets/a.tsx",
      "render@webpack:///./src/members.tsx:42:10",
      "w@https://admin.mila.app/assets/chunk.mjs:3:4",
      "h@file:///var/task/a.cjs:1:1",
      "c@https://admin.mila.app/assets/theme.css:9:9",
    ]) {
      expect(scrubString(frame)).toBe(frame);
    }
    expect(scrubString("jane@example.com")).toBe("[email]");
    expect(scrubString("me@site.map.org")).toBe("[email]");
    expect(scrubString("jane+x@mail.example.co.uk")).toBe("[email]");
    expect(scrubString("jane%40example.com")).toBe("[email]");
    expect(scrubString("write jane@example.com:8080 now")).toBe("write [email]:8080 now");
    // A TLD that merely starts like a source extension is still a TLD.
    expect(scrubString("a@b.html5")).toBe("[email]");
    expect(scrubString("a@b.jsonx")).toBe("[email]");
  });
});

describe("NEW-2: member fields in JSON text, as in an object", () => {
  const row = {
    id: "u1",
    full_name: "Jane Doe",
    username: "janedoe",
    phone: "0917 123 4567",
    content: "my private chat",
    status: "active",
  };

  test("a logged row in JSON text loses its member fields", () => {
    const text = scrubString(JSON.stringify({ err: "write failed", row }));
    expect(text).not.toMatch(/Jane|janedoe|0917|private chat/);
    expect(JSON.parse(text)).toEqual({
      err: "write failed",
      // The phone rule writes [phone] in text before the JSON pass sees the row.
      row: { ...(scrubValue(row) as object), phone: "[phone]" },
    });
  });

  test("the reviewer's sample", () => {
    expect(
      scrubString('{"full_name":"Jane Doe","phone":"0917 123 4567","content":"my chat"}'),
    ).toBe('{"full_name":"[redacted]","phone":"[phone]","content":"[redacted]"}');
  });

  test("same key styles as the object rule: camelCase, kebab-case, spaced, any case", () => {
    expect(
      scrubString(
        '{"fullName":"Jane","Full-Name":"Jane","display name":"Jane","AUTHOR_NAME":"Jane"}',
      ),
    ).toBe(
      '{"fullName":"[redacted]","Full-Name":"[redacted]","display name":"[redacted]","AUTHOR_NAME":"[redacted]"}',
    );
  });

  test("pretty-printed text, escaped quotes and non-ASCII values are covered", () => {
    const pretty = JSON.stringify(
      { row: { full_name: "José Ñandú", bio: 'He said "hi"' } },
      null,
      2,
    );
    const out = scrubString(pretty);
    expect(out).not.toMatch(/Jos|andú|hi/);
    expect(JSON.parse(out)).toEqual({ row: { full_name: "[redacted]", bio: "[redacted]" } });
    expect(scrubString('{"phone" : "0917"}')).toBe('{"phone" : "[redacted]"}');
  });

  test("the Sentry log body carries no member field either", () => {
    const log = scrubLog({
      message: `write failed 2 ${JSON.stringify({ err: "x", row: { full_name: "Jane Doe" } })}`,
    });
    expect(log.message).not.toContain("Jane");
    expect(log.message).toContain('"full_name":"[redacted]"');
  });

  test("debug keys, non-string values and error text keep their value", () => {
    // Round 5: `plan` is not a debug key any more; `status` is.
    expect(scrubString('{"plan":"pro","status":"active"}')).toBe(
      '{"plan":"[redacted]","status":"active"}',
    );
    for (const text of [
      '{"code":"PGRST116","message":"JSON object requested, multiple (or no) rows returned"}',
      // A member field with a number is redacted since round 4 (L4): `likes` is not one.
      '{"phone":null,"likes":42}',
      'duplicate key value violates unique constraint "profiles_username_key"',
      'null value in column "content" violates not-null constraint',
      'Unexpected token in JSON: "full_name" is required',
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });

  test("linear on hostile input", () => {
    for (const input of [
      '"full_name":"'.repeat(4_000),
      '"full_name":"\\'.repeat(4_000),
      '"full_name"'.repeat(4_000),
      '"phone" '.repeat(8_000),
      `"${"a ".repeat(30)}"`.repeat(500),
      '"a":'.repeat(8_000),
      `{"content":"${'x\\"'.repeat(10_000)}`,
    ]) {
      expect(timed(() => scrubString(input))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    }
  });
});

describe("NEW-3: an attribute value with quote-bracket punctuation ends where the attribute ends", () => {
  const click = (message: string) =>
    scrubBreadcrumb({ category: "ui.click", message }) as { message: string };

  // Round 5 (N10): without the element, a click message is redacted whole.
  test("quote-bracket punctuation in a value, with no element to rebuild from", () => {
    for (const message of [
      'td.px-5[title="ok"] > Jane Doe lives at 12 Mabini St"]',
      'button[aria-label="Delete"] > Jane Doe lives at 12 Mabini St"]',
      'td.px-5[title="ok"][Jane Doe lives at 12 Mabini St"]',
      'img.avatar[alt="x"][Jane Doe"]',
      'td[title="He said \\"] > Jane\\" ok"]',
      'td[type="text"][title="a \\"][Jane\\" b"]',
    ]) {
      expect(click(message).message).toBe("[redacted]");
    }
  });

  test("a value that itself starts with a redaction marker is still redacted", () => {
    const sneaky = click(`td.cell[title="[redacted]"] ${"Jane Doe ".repeat(60)}"]`).message;
    expect(sneaky).not.toContain("Jane");
  });

  test("a clean selector without its element is redacted too; the event pass keeps only rebuilt ones", () => {
    for (const message of [
      'div.card[title="Jane Doe"] > button.x[aria-label="Delete"][title="Delete"]',
      'td[title="Jane"] > input#q.h-9[type="text"][name="q"]',
      'form > input#q.h-9[type="text"][name="q"]',
      'form > input[type="text"][name="search"][aria-label="Find Jane"]',
    ]) {
      expect(click(message).message).toBe("[redacted]");
    }
  });

  test("linear on hostile input", () => {
    for (const message of [
      '[title="a"] > '.repeat(5_000),
      '[title="x"]"'.repeat(5_000),
      '"] > '.repeat(8_000),
      `a[title="${'x\\"]['.repeat(8_000)}`,
      `a[title="${"\\".repeat(20_000)}`,
    ]) {
      expect(timed(() => click(message))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    }
  });
});
