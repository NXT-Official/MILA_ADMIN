import { describe, expect, test } from "bun:test";
import {
  MAX_SCRUB_LENGTH,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
  scrubString,
  scrubValue,
} from "./scrub";

// ---------------------------------------------------------------------------
// Review round 4 (O2-round3-security-review.md L1 to L10, and the mobile review
// O3-review.md "Scrubber leaks"). Samples are the reviewers'. The design rulings:
// when in doubt, redact; error text, stacks, codes and Sentry ids stay readable.
// ---------------------------------------------------------------------------

/** Anything a member typed or is: names, phones, emails, addresses, chat text. */
const PII =
  /jane|doe\b|0917|917 123|9171234567|mabini|makati|cebu|gmail|example\.com|juan|santos|josé|jose|anxious|hunter2|opaqueopaque/i;
const WALL_CLOCK_LIMIT_MS = 500;

const timed = (run: () => unknown) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};
const bestOf = (runs: number, run: () => unknown) => {
  let best = Infinity;
  for (let i = 0; i < runs; i++) best = Math.min(best, timed(run));
  return best;
};

const click = (message: string, hint?: { event?: unknown }) =>
  (scrubBreadcrumb({ category: "ui.click", message }, hint) as { message: string }).message;

/** A DOM element as @sentry/browser reads it (tagName, id, className, getAttribute, parentNode). */
const element = (
  tag: string,
  attributes: Record<string, string>,
  parentNode: unknown = null,
): Record<string, unknown> => ({
  tagName: tag.toUpperCase(),
  id: attributes.id ?? "",
  className: attributes.class ?? "",
  getAttribute: (name: string) => attributes[name] ?? null,
  parentNode,
});

describe("L1, L2: an address followed by a file extension, and real TLDs, are redacted whole", () => {
  test("the reviewer's L1 table", () => {
    expect(scrubString("GET https://admin.mila.app/api/exports/jane.doe@gmail.com.json")).toBe(
      "GET https://admin.mila.app/api/exports/[email]",
    );
    expect(scrubString("/storage/v1/object/receipts/jane.doe@gmail.com.html")).toBe(
      // Round 5 (N11): everything after a Storage bucket is the object path.
      "/storage/v1/object/receipts/:path",
    );
    expect(scrubString("/exports/jane.doe%40gmail.com.json")).toBe("/exports/[email]");
    for (const text of [
      "jane.doe@gmail.com.json",
      "JANE.DOE@GMAIL.COM.JSON",
      "josé.santos@exämple.com.json",
      "jane@gmail.com.min.js",
      "jane+vip@gmail.com.ts",
      "jane@mail.example.co.uk.js",
      "a@b.co.json",
      "jane@gmail.com.js.map",
      "jane.doe@gmail.com.csv",
      "JANE@COMPANY.JS",
    ]) {
      expect(scrubString(text)).toBe("[email]");
    }
    expect(scrubString("https://admin.mila.app/#/members/jane.doe@gmail.com.json")).not.toMatch(
      PII,
    );
  });

  test("L2: .map is a real TLD", () => {
    expect(scrubString("juan@santos.map")).toBe("[email]");
    expect(scrubString("jane@mail.company.map")).toBe("[email]");
  });

  test("a bare file name after the at-sign is no longer taken for a stack frame", () => {
    expect(scrubString("onClick@index-abc.js:1:2")).toBe("[email]:1:2");
    expect(scrubString("fn@vendor.abc123.js:1:2")).toBe("[email]:1:2");
  });

  test("real Firefox and Safari frames (a URL scheme or a path after the at-sign) are kept", () => {
    for (const frame of [
      "loadMembers@https://admin.mila.app/assets/members-Bx12.js:1:200",
      "onClick@http://localhost:3000/src/routes/members.tsx:42:10",
      "render@webpack:///./src/members.tsx:42:10",
      "fn@webpack-internal:///./src/x.ts:1:1",
      "fn@moz-extension://abc/content.js:1:1",
      "fn@chrome-extension://abc/content.js:1:1",
      "fn@blob:https://admin.mila.app/abc:1:2",
      "fn@app:///index.android.bundle:1:2",
      "fn@file:///var/task/server.mjs:1:2",
      "fn@/assets/index-abc.js:1:2",
      "@https://admin.mila.app/assets/index-abc.js:3:4",
      "forEach@[native code]",
    ]) {
      expect(scrubString(frame)).toBe(frame);
    }
  });
});

describe("L3: member fields inside JSON text nested in JSON strings", () => {
  const row = { id: 1, full_name: "Jane Doe", phone: "0917 123 4567" };

  test("one level down, as a request body logged inside an object", () => {
    const text = JSON.stringify({ body: JSON.stringify(row) });
    expect(text).toBe(
      '{"body":"{\\"id\\":1,\\"full_name\\":\\"Jane Doe\\",\\"phone\\":\\"0917 123 4567\\"}"}',
    );
    // `body` is itself a member field (a post or message body): it goes whole.
    expect(scrubString(text)).toBe('{"body":"[redacted]"}');
    // Under a key that is not a debug key the whole string goes (round 5)...
    expect(scrubString(JSON.stringify({ data: JSON.stringify(row) }))).toBe(
      '{"data":"[redacted:49]"}',
    );
    // ...and under one whose text is kept, the inner JSON is parsed, scrubbed and written back.
    const out = scrubString(JSON.stringify({ error: JSON.stringify(row) }));
    expect(out).not.toMatch(PII);
    expect(JSON.parse(JSON.parse(out).error)).toEqual({
      id: 1,
      full_name: "[redacted]",
      phone: "[phone]",
    });
  });

  test("array form, two levels down, a whole-string literal, escaped quotes and backslashes", () => {
    for (const text of [
      '["{\\"full_name\\":\\"Jane Doe\\"}"]',
      JSON.stringify({ a: JSON.stringify({ body: JSON.stringify(row) }) }),
      JSON.stringify(JSON.stringify(row)),
      JSON.stringify({ body: JSON.stringify({ full_name: 'Jane "JD" Doe' }) }),
      JSON.stringify({ body: JSON.stringify({ full_name: "Jane Doe\\", x: "y" }) }),
      JSON.stringify({ a: JSON.stringify({ b: JSON.stringify({ c: JSON.stringify(row) }) }) }),
    ]) {
      expect(scrubString(text)).not.toMatch(PII);
    }
  });

  test("a key written with a \\u escape", () => {
    expect(scrubString('{"full\\u005fname":"Jane Doe"}')).not.toMatch(PII);
  });

  test("the Sentry log body of console.error with a request body, and a template literal", () => {
    const body = `[probe] request body string ${JSON.stringify({
      url: "/rest/v1/profiles",
      init: { method: "PATCH", body: JSON.stringify(row) },
    })}`;
    const log = scrubLog({ message: body });
    expect(log.message).not.toMatch(PII);
    expect(log.message).toContain("[probe] request body string");
    expect(log.message).toContain("/rest/v1/profiles");
    expect(
      scrubString(`[probe] template ${JSON.stringify({ body: JSON.stringify(row) })}`),
    ).not.toMatch(PII);
  });

  test("a stray quoted pair before the row, and a member after a long non-member value", () => {
    expect(scrubString('update "bio": "x {"full_name":"Jane Doe"}')).not.toMatch(PII);
    expect(scrubString(`{"note":"${"z ".repeat(17000)}","full_name":"Jane Doe"}`)).not.toMatch(PII);
  });
});

describe("L4: member fields with any value type, and the full key list", () => {
  test("numbers, objects and arrays in JSON text", () => {
    const out = scrubString('{"phone":9171234567,"address":{"street":"12 Mabini St"}}');
    expect(out).not.toMatch(PII);
    // A Philippine mobile written as a JSON number is [phone] before the JSON pass runs.
    expect(JSON.parse(out)).toEqual({ phone: "[phone]", address: "[redacted]" });
    expect(scrubString('{"location":["Makati","Cebu"],"height_cm":170}')).toBe(
      '{"location":"[redacted]","height_cm":"[redacted]"}',
    );
  });

  test("numbers, objects and arrays in an object", () => {
    expect(
      scrubValue({
        phone: 9171234567,
        address: { street: "12 Mabini St" },
        location: ["Makati"],
        height_cm: 170,
        weight_kg: 60,
        gender: "female",
        id: 7,
      }),
    ).toEqual({
      phone: "[redacted]",
      address: "[redacted]",
      location: "[redacted]",
      height_cm: "[redacted]",
      weight_kg: "[redacted]",
      gender: "[redacted]",
      id: 7,
    });
  });

  test("every key on the list, in snake_case, camelCase and any case", () => {
    const keys = [
      "full_name",
      "first_name",
      "last_name",
      "name",
      "display_name",
      "username",
      "email",
      "phone",
      "phone_number",
      "address",
      "street",
      "default_location",
      "location",
      "city",
      "caption",
      "content",
      "body",
      "message",
      "bio",
      "gender",
      "height_cm",
      "weight_kg",
      "birthday",
      "date_of_birth",
      "dob",
    ];
    const camel = (key: string) => key.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase());
    for (const key of keys) {
      for (const variant of [key, camel(key), key.toUpperCase()]) {
        expect(scrubValue({ [variant]: "Jane Doe" })).toEqual({ [variant]: "[redacted]" });
        expect(scrubString(JSON.stringify({ [variant]: "Jane Doe" }))).toBe(
          JSON.stringify({ [variant]: "[redacted]" }),
        );
      }
    }
  });

  test("null and empty values carry nothing and stay", () => {
    expect(scrubString('{"phone":null,"likes":42}')).toBe('{"phone":null,"likes":42}');
    expect(scrubValue({ phone: null, bio: "" })).toEqual({ phone: null, bio: "" });
  });
});

describe("L5: JS / util.inspect form", () => {
  test("single, double quoted and numeric values", () => {
    expect(scrubString("{ full_name: 'Jane Doe', phone: '0917 123 4567' }")).toBe(
      "{ full_name: '[redacted]', phone: '[phone]' }",
    );
    expect(scrubString('full_name: "Jane Doe"')).toBe('full_name: "[redacted]"');
    const numeric = scrubString("{ phone: 9171234567, plan: 'pro' }");
    expect(numeric).not.toMatch(PII);
    // Round 5: `plan` is not a debug key, so its value goes too.
    expect(numeric).toContain("plan: '[redacted]'");
    expect(scrubString("{ address: { street: '12 Mabini St' }, plan: 'pro' }")).not.toMatch(PII);
  });
});

describe("L6 to L8: click and keypress breadcrumbs are rebuilt from an allowlist grammar", () => {
  test("text only: a value never survives, whatever it holds", () => {
    const BS = String.fromCharCode(92);
    for (const [message, sent] of [
      ['td.truncate[title="ok"] > Jane Doe, 0917 123 4567 [title="x"]', "td.truncate"],
      ['td.truncate[title="ok"][name="Jane Doe 0917 123 4567"]', "td.truncate"],
      [`td.truncate[title="ok"] > Jane Doe 0917 123 4567 ${"z ".repeat(17000)}`, "td.truncate"],
      ['td.truncate[title="ok"] > Jane [title="x"] > Doe"]', "td.truncate"],
      ['div#a"b > td[title="ok"] > Jane Doe"]', "div#a"],
      [`td[title="${(BS + "x").repeat(200)}"] > Jane Doe [title="x"]`, "td"],
      [`td[title="${(BS + "n").repeat(160)}"] > Jane Doe 0917 [name="q"]`, "td"],
      [`td[title="${"a".repeat(290)}"] > Jane Doe [title="x"]`, "td"],
      ['td[title="ok"] > jane[title="x"]', "td"],
      ['img[alt="ok"] > Jane Doe [alt="x"]', "img"],
      ['td[title="ok"][type="Jane Doe"]', "td"],
      ['div[title="A"] > td[title="ok"] > Jane [title="x"] > Doe"]', "div"],
      ['MemberRow > td[title="ok"] > Jane Doe [title="x"]', "MemberRow > td"],
      [`td[title="ok"] > ${"Jane Doe ".repeat(4000)}"]`, "td"],
      [`button[aria-label="x"] > Jane Doe lives at 12 Mabini St ${"z ".repeat(17000)}"]`, "button"],
    ] as const) {
      // Round 5 (N10): without the element the whole message goes; `sent` was the
      // round-4 grammar prefix, kept here to show what the text alone used to keep.
      expect(sent.length).toBeGreaterThan(0);
      expect(click(message)).toBe("[redacted]");
    }
  });

  test("text only: even a clean selector goes without its element (round 5, N10)", () => {
    for (const message of [
      'input.h-9[type="text"][name="search"]',
      'form > input#q.h-9[type="text"][name="full_name"]',
      'tr.row > td.px-5.truncate[title="Jane Doe"]',
      'button.h-8.px-3[aria-label="Delete post by Jane Doe"][title="Delete"]',
      'input[name="Jane Doe"]',
      'div.flex > button[role=switch][aria-label="Steward role"]',
    ]) {
      expect(click(message)).toBe("[redacted]");
    }
  });

  test("with the DOM element in the hint, the whole path is rebuilt and values are never read", () => {
    const titles = [
      'ok"] > Jane Doe, 0917 123 4567 [title="x',
      'ok"] > Jane [title="x"] > Doe"]',
      'ok"][name="Jane Doe 0917 123 4567',
      `ok"] > Jane Doe 0917 123 4567 ${"z ".repeat(17000)}`,
    ];
    for (const title of titles) {
      const target = element("td", { class: "truncate", title });
      const raw = `td.truncate[title="${title}"]`;
      expect(click(raw, { event: { type: "click", target } })).toBe("td.truncate");
    }
    const input = element(
      "input",
      { class: "h-9", type: "text", name: "search", "aria-label": "Find Jane" },
      element("td", { class: "px-5", title: "Jane Doe" }, element("tr", { class: "row" })),
    );
    expect(click("ignored", { event: { target: input } })).toBe(
      'tr.row > td.px-5 > input.h-9[type="text"][name="search"]',
    );
    const named = element("input", { type: "text", name: "Jane Doe 0917" });
    expect(click("ignored", { event: { target: named } })).toBe('input[type="text"]');
  });

  test("ui breadcrumb data keeps the component name only", () => {
    const crumb = scrubBreadcrumb({
      category: "ui.click",
      message: "td.x",
      data: { "ui.component_name": "MemberRow", textContent: "Jane Doe", label: "Jane Doe" },
    }) as { data: Record<string, unknown> };
    expect(crumb.data).toEqual({ "ui.component_name": "MemberRow" });
  });
});

describe("L9, L10: Unicode marks and every form of the at-sign", () => {
  test("NFD names and domains", () => {
    expect(scrubString("josé.santos@gmail.com")).toBe("[email]");
    expect(scrubString("jane@exámple.com")).toBe("[email]");
    expect(scrubString("write to jane@éxample.com and jané@example.com")).toBe(
      "write to [email] and [email]",
    );
  });

  test("fullwidth, small, double-encoded, HTML entity and JSON escape at-signs", () => {
    expect(scrubString("jane.doe＠gmail.com")).toBe("[email]");
    expect(scrubString("jane.doe﹫gmail.com")).toBe("[email]");
    expect(scrubString("/m/jane.doe%2540gmail.com")).toBe("/m/[email]");
    expect(scrubString("jane.doe&#64;gmail.com")).toBe("[email]");
    expect(scrubString("jane.doe&#x40;gmail.com")).toBe("[email]");
    expect(scrubString("jane%2540example.com and jane&#64;example.com")).toBe(
      "[email] and [email]",
    );
    expect(scrubString('{"e":"jane.doe@gmail.com"}')).toBe('{"e":"[email]"}');
    expect(scrubString('{"e":"jane.doe\\u0040gmail.com"}')).toBe('{"e":"[email]"}');
  });

  test("URL userinfo counts as the at-sign", () => {
    expect(scrubString("https://jane.doe:pw@gmail.com/")).toBe("https://[email]/");
    expect(scrubString("postgres://postgres:s3cret@db.mila.internal:5432/postgres")).toBe(
      "postgres://[email]:5432/postgres",
    );
  });
});

describe("message is a member field in data, never in an error", () => {
  test("an Error and an error-shaped object keep their message", () => {
    const error = Object.assign(new Error("query failed for profiles"), { code: "42P01" });
    expect(scrubValue(error)).toMatchObject({ message: "query failed for profiles" });
    expect(
      scrubValue({ code: "23505", message: "duplicate key value", details: "x", hint: null }),
    ).toMatchObject({ message: "duplicate key value" });
    expect(
      scrubValue({ name: "AuthApiError", message: "Invalid login credentials", status: 400 }),
    ).toEqual({ name: "AuthApiError", message: "Invalid login credentials", status: 400 });
    expect(
      scrubValue({ message: "boom", stack: "Error: boom\n    at x (/a.js:1:2)" }),
    ).toMatchObject({ message: "boom" });
  });

  test("an object held under an error key is an error: API and GraphQL error bodies", () => {
    const stripe = '{"error":{"message":"No such customer: x","type":"invalid_request_error"}}';
    // The message is kept; inside it, an unquoted `customer: x` loses its value (round 5, N8),
    // and the sentence still says which lookup failed.
    expect(scrubString(stripe)).toBe(
      '{"error":{"message":"No such customer: [redacted]","type":"invalid_request_error"}}',
    );
    expect(scrubValue({ errors: [{ message: "Field 'plan' is required" }] })).toEqual({
      errors: [{ message: "Field 'plan' is required" }],
    });
    expect(scrubValue({ cause: { message: "socket hang up" } })).toEqual({
      cause: { message: "socket hang up" },
    });
    expect(scrubValue({ data: { message: "I feel anxious" } })).toEqual({
      data: { message: "[redacted]" },
    });
  });

  test("a data row's message and name are redacted", () => {
    expect(scrubValue({ id: "1", kind: "bug", message: "I feel anxious" })).toEqual({
      id: "1",
      kind: "bug",
      message: "[redacted]",
    });
    expect(scrubValue({ id: 1, name: "Jane Doe" })).toEqual({ id: 1, name: "[redacted]" });
  });

  test("the same decision in JSON text", () => {
    expect(scrubString('{"id":"1","kind":"bug","message":"I feel anxious"}')).toBe(
      '{"id":"1","kind":"bug","message":"[redacted]"}',
    );
    const error =
      '{"code":"PGRST116","details":null,"hint":null,"message":"JSON object requested"}';
    expect(scrubString(error)).toBe(error);
    expect(scrubString('x {"name":"PostgrestError","message":"query failed","code":"23505"}')).toBe(
      'x {"name":"PostgrestError","message":"query failed","code":"23505"}',
    );
  });

  test("text cut by truncation, and the inspect form", () => {
    expect(scrubString('{"kind":"bug","message":"I feel anxious about my ex')).not.toMatch(PII);
    expect(scrubString('{"code":"42P01","message":"relation \\"x\\" does not exist')).toContain(
      "does not exist",
    );
    expect(scrubString("{ message: 'I feel anxious', kind: 'bug' }")).not.toMatch(PII);
    expect(scrubString("{ code: 'ECONNRESET', message: 'boom' }")).toBe(
      "{ code: 'ECONNRESET', message: 'boom' }",
    );
  });
});

describe("depth and size caps fail closed", () => {
  test("the object walk past its depth limit", () => {
    let deep: Record<string, unknown> = { note: "deep raw value" };
    for (let i = 0; i < 30; i++) deep = { next: deep };
    const out = JSON.stringify(scrubValue(deep));
    expect(out).toContain('"[truncated]"');
    expect(out).not.toContain("deep raw value");
  });

  test("JSON text past the depth limit", () => {
    let deep: unknown = { note: "deep raw value" };
    for (let i = 0; i < 30; i++) deep = { next: deep };
    const out = scrubString(JSON.stringify(deep));
    expect(out).toContain('"[truncated]"');
    expect(out).not.toContain("deep raw value");
    expect(() => JSON.parse(out)).not.toThrow();
  });

  test("a long string is cut, never sent past the cap", () => {
    const out = scrubString(`${"x ".repeat(40_000)}jane@example.com`);
    expect(out.length).toBeLessThanOrEqual(MAX_SCRUB_LENGTH + "[truncated]".length);
    expect(out.endsWith("[truncated]")).toBe(true);
  });
});

describe("mobile 1: credential keys and secret-shaped strings", () => {
  test("credential keys in objects, JSON text, inspect form and key=value text", () => {
    const secrets = {
      password: "hunter2",
      passwd: "hunter2",
      secret: "opaqueopaque",
      access_token: "opaqueopaque",
      refresh_token: "opaqueopaque",
      apikey: "opaqueopaque",
      api_key: "opaqueopaque",
      authorization: "opaqueopaque",
      cookie: "opaqueopaque",
    };
    expect(JSON.stringify(scrubValue(secrets))).not.toMatch(PII);
    expect(scrubString(JSON.stringify(secrets))).not.toMatch(PII);
    const inspect = Object.entries(secrets)
      .map(([key, value]) => `${key}: '${value}'`)
      .join(", ");
    expect(scrubString(`{ ${inspect} }`)).not.toMatch(PII);
    expect(scrubString("password=hunter2 token=abcd1234")).toBe(
      "password=[redacted] token=[redacted]",
    );
    expect(scrubString("apikey: sk-ant-api03-ABCDEF")).not.toContain("ABCDEF");
  });

  test("secret shapes anywhere in text", () => {
    for (const secret of [
      "sk_live_51HabcdefghijKLMN",
      "sk_test_51Habcdefghij",
      "pk_live_51Habcdefghij",
      "sk-ant-api03-ABCDEF",
      `sk-${"a1B2".repeat(6)}`,
      `ghp_${"a1B2".repeat(9)}`,
      "xoxb-1234-5678-abcdEFGH",
      "xoxa-2-abcdEFGH",
      "xoxp-1234-abcdEFGH",
      "AKIAIOSFODNN7EXAMPLE",
    ]) {
      const out = scrubString(`leaked ${secret} here`);
      expect(out).toBe("leaked [secret] here");
    }
    expect(scrubString("Authorization: Bearer abc.def-123_xyz")).toBe(
      "Authorization: Bearer [redacted]",
    );
    expect(scrubString("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdGFmZiJ9")).toBe("[jwt]");
  });
});

describe("mobile 2 and 4: tokens and member ids in paths", () => {
  test("the segment after a sensitive word is a token, at any length", () => {
    expect(scrubString("/reset/abc123def456")).toBe("/reset/:token");
    expect(scrubString("https://mila.app/verify/Zk3v9QpLm2Xa")).toBe(
      "https://mila.app/verify/:token",
    );
    expect(scrubString("/invite/abcdefghijklmnopqrs")).toBe("/invite/:token");
    for (const word of ["confirm", "token", "auth", "magic", "callback", "otp", "code"]) {
      expect(scrubString(`GET /${word}/a1 failed`)).toBe(`GET /${word}/:token failed`);
    }
    expect(scrubString("/auth/callback/xyz")).toBe("/auth/callback/:token");
  });

  test("route words, API versions, params and source files after them stay", () => {
    for (const text of [
      "https://x.supabase.co/auth/v1/verify?token=[redacted]&type=signup",
      "/auth/callback?code=[redacted]",
      "/reset-password",
      "/_authed/members/$memberId",
      "/members/:id",
      "at handler (/var/task/chunks/routes/auth/callback.mjs:12:3)",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });

  test("the segment after a member word is an id", () => {
    expect(scrubString("/users/jane.doe/photos")).toBe("/users/:id/photos");
    expect(scrubString("/u/jane")).toBe("/u/:id");
    expect(scrubString("/profile/janedoe?tab=posts")).toBe("/profile/:id?tab=[redacted]");
    expect(scrubString("route /_authed/members/0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10 failed")).toBe(
      "route /_authed/members/:id failed",
    );
    expect(scrubString("/auth/v1/admin/users/0b6c1f3e-2a5d-4c11-9a7e-3f2f5d1c9b10")).toBe(
      "/auth/v1/admin/users/:id",
    );
  });
});

describe("mobile 3: allowlisted query values must look like a word", () => {
  test("names, dotted refs and paths to a member are redacted", () => {
    expect(scrubString("/x?type=Jane%20Doe")).toBe("/x?type=[redacted]");
    expect(scrubString("/x?view=Jane%20Doe&ref=jane.doe.company")).toBe(
      "/x?view=[redacted]&ref=[redacted]",
    );
    expect(scrubString("/x?order=jane.doe")).toBe("/x?order=[redacted]");
    expect(scrubString("/x?select=jane.doe.company")).toBe("/x?select=[redacted]");
    expect(scrubString("/x?table=jane.doe")).toBe("/x?table=[redacted]");
    expect(scrubString("/login?redirect=%2Fmembers%2Fjanedoe")).toBe(
      "/login?redirect=%2Fmembers%2F%3Aid",
    );
  });

  test("structural values still pass", () => {
    const keep =
      "/rest/v1/posts?select=id,profiles!inner(full_name)&order=created_at.desc&limit=50&page=2&type=signup";
    expect(scrubString(keep)).toBe(keep);
    expect(scrubString("/login?redirect=%2Fmembers")).toBe("/login?redirect=%2Fmembers");
  });
});

describe("mobile 5: UUIDs and phone numbers in free text", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";

  test("a UUID in a message or in data becomes :uuid; it can be switched off", () => {
    expect(scrubString(`user ${uuid} not found`)).toBe("user :uuid not found");
    // In data, under a key whose text is kept (`error`); any other key loses its string (round 5).
    expect(scrubValue({ error: `row ${uuid}` })).toEqual({ error: "row :uuid" });
    expect(scrubString(`user ${uuid} not found`, { uuids: false })).toBe(`user ${uuid} not found`);
  });

  test("Sentry's own ids stay readable", () => {
    const event = scrubEvent({
      event_id: "0b6c1f3e2a5d4c119a7e3f2f5d1c9b10",
      contexts: {
        trace: { trace_id: "0b6c1f3e2a5d4c119a7e3f2f5d1c9b10", span_id: "9a7e3f2f5d1c9b10" },
      },
      debug_meta: { images: [{ type: "sourcemap", debug_id: uuid, code_file: "/a.js" }] },
      user: { id: uuid },
    }) as Record<string, any>;
    expect(event.event_id).toBe("0b6c1f3e2a5d4c119a7e3f2f5d1c9b10");
    expect(event.contexts.trace.trace_id).toBe("0b6c1f3e2a5d4c119a7e3f2f5d1c9b10");
    expect(event.contexts.trace.span_id).toBe("9a7e3f2f5d1c9b10");
    expect(event.debug_meta.images[0].debug_id).toBe(uuid);
    expect(event.user).toEqual({ id: uuid });
  });

  test("phone-like runs become [phone]", () => {
    for (const [text, sent] of [
      ["call +63 917 123 4567", "call [phone]"],
      ["call 0917 123 4567 now", "call [phone] now"],
      ["0917-123-4567", "[phone]"],
      ["tel:+639171234567", "tel:[phone]"],
      ["Phone: 09171234567.", "Phone: [phone]."],
      ['{"mobile_no":"0917 123 4567"}', '{"mobile_no":"[phone]"}'],
    ] as const) {
      expect(scrubString(text)).toBe(sent);
    }
  });

  test("numbers that are not phones stay: positions, dates, durations, ids, codes", () => {
    for (const text of [
      "at x (https://admin.mila.app/assets/index-abc.js:1:1234567)",
      "expired on 2026-10-07",
      "2026-10-07T12:34:56.789Z",
      "timeout after 30000000ms",
      "version v1.2345678",
      "iad1::sfo1::abcde-1791311596541-0a1b2c3d4e5f",
      "code: 23505, status 500",
      '{"amount":150000}',
    ]) {
      expect(scrubString(text)).toBe(text);
    }
    // Round 6 (R5-M6): seven or more digits are phone-shaped under any key but a time or a position.
    expect(scrubString('{"amount":1500000}')).toBe('{"amount":"[redacted]"}');
  });
});

describe("mobile 6: object keys that are emails or secrets", () => {
  test("tags and data keys", () => {
    // Round 6 (R5-M4): a key that is an address is member text, so it goes as a key.
    expect(scrubValue({ tags: { "jane@x.com": 1 } })).toEqual({ tags: { "[key]": 1 } });
    expect(scrubValue({ sk_live_51HabcdefghijKLMN: true })).toEqual({ "[secret]": true });
    const event = scrubEvent({ tags: { "jane@x.com": "1" } });
    expect(JSON.stringify(event)).not.toContain("jane");
  });
});

describe("mobile 7: device and server names", () => {
  test("server_name, device name and user fields are stripped; ids and OS names stay", () => {
    const event = scrubEvent({
      server_name: "Jane-MBP",
      contexts: {
        device: { name: "Jane's iPhone", model: "iPhone15,2" },
        os: { name: "iOS", version: "18.0" },
        browser: { name: "Chrome", version: "141" },
        runtime: { name: "node", version: "v22" },
      },
      sdk: { name: "sentry.javascript.react", packages: [{ name: "npm:@sentry/react" }] },
      user: { id: "u1", ip_address: "203.0.113.9", email: "jane@x.com", username: "janedoe" },
    }) as Record<string, any>;
    expect(event.server_name).toBeUndefined();
    expect(event.contexts.device).toEqual({ model: "iPhone15,2" });
    expect(event.contexts.os.name).toBe("iOS");
    expect(event.contexts.browser.name).toBe("Chrome");
    expect(event.contexts.runtime.name).toBe("node");
    expect(event.sdk.name).toBe("sentry.javascript.react");
    expect(event.sdk.packages[0].name).toBe("npm:@sentry/react");
    expect(event.user).toEqual({ id: "u1" });
    expect(JSON.stringify(event)).not.toMatch(/Jane|janedoe|203\.0/);
  });

  test("the event message and breadcrumb messages are text, not member fields", () => {
    const event = scrubEvent({
      message: "invite failed for jane@example.com",
      logentry: { message: "grant failed for %s", params: ["jane@example.com"] },
      breadcrumbs: [{ category: "console", message: "[adminBrowseTable] query failed" }],
      contexts: { feedback: { name: "Jane Doe", message: "I feel anxious" } },
    }) as Record<string, any>;
    expect(event.message).toBe("invite failed for [email]");
    // Round 6 (R5-M6): `params` holds ids and words only; the message keeps its template.
    expect(event.logentry).toEqual({ message: "grant failed for %s", params: ["[redacted]"] });
    expect(event.breadcrumbs[0].message).toBe("[adminBrowseTable] query failed");
    expect(event.contexts.feedback).toEqual({ name: "[redacted]", message: "[redacted]" });
  });

  test("a log drops the server's host name", () => {
    const log = scrubLog({
      message: "x",
      attributes: { "server.address": "Jane-MBP", "sentry.environment": "preview" },
    });
    expect(log.attributes).toEqual({ "sentry.environment": "preview" });
  });
});

describe("mobile 8: non-plain objects keep their own properties, scrubbed", () => {
  test("Error, Date, Map and Set", () => {
    const error = Object.assign(new Error("lookup failed"), {
      email: "jane@example.com",
      context: { full_name: "Jane Doe", table: "profiles" },
      status: 404,
    });
    const errorOut = scrubValue(error) as Record<string, any>;
    expect(errorOut).toMatchObject({
      message: "lookup failed",
      email: "[redacted]",
      context: { full_name: "[redacted]", table: "profiles" },
      status: 404,
    });

    const date = Object.assign(new Date(0), { note: "jane@example.com" });
    const map = Object.assign(new Map([["k", "v"]]), { owner: "jane@example.com" });
    const set = Object.assign(new Set(["a"]), { owner: "jane@example.com" });
    const out = JSON.stringify(scrubValue({ date, map, set }));
    expect(out).not.toMatch(PII);
    expect(out).toContain("[redacted]");
    expect(scrubValue({ when: new Date(0) })).toEqual({ when: new Date(0) });
  });
});

describe("the owner still sees every error", () => {
  test("messages, stacks, route templates, codes and request ids pass through unchanged", () => {
    for (const text of [
      'new row violates row-level security policy for table "profiles"',
      'duplicate key value violates unique constraint "profiles_username_key"',
      "Could not find the 'avatar' column of 'profiles' in the schema cache",
      "JWT expired",
      "Invariant failed: Could not find match for from: /_authed/members/$memberId",
      "TypeError: Cannot read properties of undefined (reading 'id')\n    at loadMembers (https://admin.mila.app/assets/members-Bx12.js:1:200)",
      "loadMembers@https://admin.mila.app/assets/members-Bx12.js:1:200",
      "code: PGRST116, status: 406, hint: null",
      "Request failed with status code 500 (ECONNRESET)",
      "SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
      "connect ECONNREFUSED 127.0.0.1:5432",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });
});

// ---------------------------------------------------------------------------
// Round 4 review (o2-r4/review/). Samples are the reviewer's.
// ---------------------------------------------------------------------------

describe("R4 review: Postgres errors", () => {
  test("Critical: a unique index on an expression (profiles_username_lower_idx)", () => {
    expect(scrubString("Key (lower(username))=(jane.doe88) already exists.")).toBe(
      "Key (lower(username))=([redacted]) already exists.",
    );
    expect(
      scrubValue({ details: "Key (lower(username))=(jane.doe88) already exists.", code: "23505" }),
    ).toEqual({ details: "Key (lower(username))=([redacted]) already exists.", code: "23505" });
  });

  test("a value that spans lines is redacted whole", () => {
    for (const text of [
      "Failing row contains (5f1c, Jane, Bio line one\nmy wife Maria Santos lives in Makati).",
      'new row violates check constraint "bio_len" Failing row contains (5f1c, Jane, I love fashion\nand my girlfriend Maria Santos, Makati).',
      "Key (bio)=(hello\nJane Doe) already exists.",
      'invalid input syntax for type uuid: "Jane\nDoe"',
    ]) {
      expect(scrubString(text)).not.toMatch(/Jane|Maria|Santos|Makati|Doe/);
    }
    expect(scrubString("Failing row contains (1, Jane\nDoe).\n    at x (/a.js:1:2)")).toBe(
      "Failing row contains ([redacted]).\n    at x (/a.js:1:2)",
    );
  });

  test("other Postgres messages that echo the value", () => {
    for (const [text, sent] of [
      [
        'date/time field value out of range: "1990-31-12"',
        'date/time field value out of range: "[redacted]"',
      ],
      ['malformed array literal: "{Jane Doe,Maria}"', 'malformed array literal: "[redacted]"'],
      ['syntax error at or near "Jane"', 'syntax error at or near "[redacted]"'],
      [
        'unterminated quoted string at or near "\'Jane Doe"',
        'unterminated quoted string at or near "[redacted]"',
      ],
      ['Token "Jane" is invalid.', 'Token "[redacted]" is invalid.'],
      [
        'value "Jane Doe" is out of range for type integer',
        'value "[redacted]" is out of range for type integer',
      ],
    ] as const) {
      expect(scrubString(text)).toBe(sent);
    }
  });
});

describe("R4 review: Node util.inspect output", () => {
  test("backtick strings and ' +' continued lines", () => {
    const inspected = [
      "{",
      '  full_name: `Jane "JD" O\'Neil`,',
      "  bio: 'Hi I am Jane Doe from Makati City in Metro Manila\\n' +",
      "    'I love long walks with my girlfriend Maria Santos on the beach\\n' +",
      "    'call me',",
      "  id: 1",
      "}",
    ].join("\n");
    const out = scrubString(inspected);
    expect(out).not.toMatch(/Jane|Neil|Makati|Maria|Santos|call me/);
    expect(out).toContain("id: 1");
  });
});

describe("R4 review: more inspect and log-line shapes", () => {
  test("a quoted value with raw newlines, continued with +", () => {
    const text =
      "{\n  bio: 'Hi I am Jane Doe from Makati\n' +\n    'I love long walks with my girlfriend Maria Santos\n' +\n    'call me',\n  id: 3\n}";
    const out = scrubString(text);
    expect(out).not.toMatch(/Jane|Makati|Maria|Santos|call me/);
    expect(out).toContain("id: 3");
  });

  test("unquoted key=value log lines", () => {
    expect(scrubString("update failed full_name=Jane_Doe city=Makati plan=pro")).toBe(
      // Round 5: `plan` is not a debug key either.
      "update failed full_name=[redacted] city=[redacted] plan=[redacted]",
    );
  });

  test("an area code in parentheses goes with the number; a search term in a path goes", () => {
    expect(scrubString("call (0917) 123-4567 now")).toBe("call [phone] now");
    expect(scrubString("call +63 (917) 123 4567 now")).toBe("call [phone] now");
    expect(scrubString("GET /search/Jane%20Doe 404")).toBe("GET /search/:query 404");
  });

  test("`reason` is too common a data key to mark an error", () => {
    expect(scrubString('{"reason":{"message":"Hi I am Jane"}}')).toBe(
      '{"reason":{"message":"[redacted]"}}',
    );
  });
});

describe("R4 review: message near an error, in text that is not JSON", () => {
  test("an error key only counts inside the same object", () => {
    const text =
      "{ error: { code: 'PGRST116', message: 'x' }, row: { kind: 'chat', message: 'Hi it is Jane, meet me at Greenbelt' } }";
    const out = scrubString(text);
    expect(out).not.toMatch(/Jane|Greenbelt/);
    expect(out).toContain("message: 'x'");
    expect(
      scrubString('{"code":"23505","message":"dup","row":{"kind":"chat","message":"Hi I am Jane'),
    ).not.toMatch(/Jane/);
    expect(scrubString("{ code: 'ECONNRESET', message: 'boom' }")).toBe(
      "{ code: 'ECONNRESET', message: 'boom' }",
    );
    expect(scrubString("{ errors: [ { message: 'Field missing' } ] }")).toBe(
      "{ errors: [ { message: 'Field missing' } ] }",
    );
  });
});

describe("R4 review: smaller leaks", () => {
  test("a log message that is a String object (Sentry.logger.fmt)", () => {
    const log = scrubLog({ message: new String("Hi Jane jane@x.com") as unknown as string });
    expect(String(log.message)).toBe("Hi Jane [email]");
  });

  test("an Error whose name is not a string", () => {
    const error = Object.assign(new Error("x"), { name: { who: "jane@x.com" } });
    expect(JSON.stringify(scrubValue(error))).not.toContain("jane");
  });

  test("local parts with ~ ! $ * ^, quoted local parts and domain literals", () => {
    expect(scrubString("jane~doe@gmail.com")).toBe("[email]");
    expect(scrubString('mail "jane doe"@gmail.com now')).toBe("mail [email] now");
    expect(scrubString("jane.doe@[10.0.0.1] failed")).toBe("[email] failed");
  });

  test("a URL password holding an encoded at-sign", () => {
    expect(scrubString("postgresql://jane.doe:pa$$%40word@db.example.com:5432/x")).toBe(
      "postgresql://[email]:5432/x",
    );
  });

  test("dotted phone numbers and a Philippine mobile stored as a JSON number", () => {
    expect(scrubString("call 0917.123.4567 now")).toBe("call [phone] now");
    expect(scrubString('{"contact_no": 639171234567}')).toBe('{"contact_no": "[phone]"}');
    expect(scrubString('{"contact_no":9171234567}')).toBe('{"contact_no":"[phone]"}');
    expect(scrubString('{"amount": 150000}')).toBe('{"amount": 150000}');
    // Round 6 (R5-M6): seven digits are phone-shaped under an amount too.
    expect(scrubString('{"amount": 1500000}')).toBe('{"amount": "[redacted]"}');
  });
});

describe("R4 review: over-redaction", () => {
  test("release, dist and environment pass through; name@version is not an address", () => {
    const event = scrubEvent({
      release: "mila-admin@1.2.3",
      dist: "web@2",
      environment: "preview",
    }) as Record<string, unknown>;
    expect(event).toMatchObject({
      release: "mila-admin@1.2.3",
      dist: "web@2",
      environment: "preview",
    });
    const log = scrubLog({ message: "x", attributes: { "sentry.release": "mila-admin@1.2.3" } });
    expect(log.attributes).toEqual({ "sentry.release": "mila-admin@1.2.3" });
    expect(scrubString("at @sentry/browser@10.75.2/build/index.js")).toBe(
      "at @sentry/browser@10.75.2/build/index.js",
    );
    expect(scrubString("react-dom@19.1.0-rc.1")).toBe("react-dom@19.1.0-rc.1");
  });

  test("an error named plain Error keeps its name", () => {
    const text = '{"stack":"Error: boom\\n    at x (/a.js:1:2)","message":"boom","name":"Error"}';
    expect(scrubString(text)).toBe(text);
  });

  test("a dev stack frame with a query keeps its line and column", () => {
    expect(
      scrubString(
        "at Component (http://localhost:3000/src/routes/members/$userId.tsx?tsr-split=component:41:13)",
      ),
    ).toBe(
      "at Component (http://localhost:3000/src/routes/members/$userId.tsx?tsr-split=component:41:13)",
    );
  });
});

describe("R4 review: odd objects do not drop the report", () => {
  test("a getter that throws becomes a marker", () => {
    const odd = {
      ok: "fine",
      get broken(): string {
        throw new Error("nope");
      },
    };
    expect(scrubValue(odd)).toEqual({ ok: "[redacted]", broken: "[unreadable]" });
  });
});

describe("linear on hostile input", () => {
  test("every new rule stays inside the wall-clock limit", () => {
    for (const input of [
      "%40".repeat(20_000),
      "%2540".repeat(12_000),
      "&#64;".repeat(12_000),
      "&#x40;".repeat(10_000),
      "＠".repeat(30_000),
      "a:a@".repeat(15_000),
      `//${"a:".repeat(30_000)}@b`,
      `${"a.".repeat(30_000)}@b`,
      "á".repeat(30_000),
      "[".repeat(60_000),
      "{".repeat(60_000),
      '{"a":'.repeat(12_000),
      '["'.repeat(30_000),
      `${'{"a":"'.repeat(4_000)}`,
      "1 ".repeat(30_000),
      "1-".repeat(30_000),
      "/reset".repeat(10_000),
      "/users/".repeat(8_000),
      "sk-".repeat(20_000),
      "full_name: '".repeat(5_000),
      "message: '".repeat(5_000),
      '"message":"'.repeat(5_000),
      '\\"full_name\\":\\"'.repeat(3_000),
      `"address":${"[".repeat(20_000)}`,
    ]) {
      expect(timed(() => scrubString(input))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    }
    for (const message of [
      "a.b".repeat(20_000),
      "a#b".repeat(20_000),
      "a > ".repeat(15_000),
      '[type="a"]'.repeat(6_000),
      `a.${"[x]".repeat(20_000)}`,
    ]) {
      expect(timed(() => click(message))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    }
  });

  test("below the cap, four times the input costs well under sixteen times the time", () => {
    const shapes: Array<(size: number) => string> = [
      (size) => "%40".repeat(size / 3),
      (size) => "a:a@".repeat(size / 4),
      (size) => "[".repeat(size),
      (size) => '{"a":'.repeat(size / 5),
      (size) => "1 ".repeat(size / 2),
      // An unbounded digit group ran 150x slower at 32 KB than at 8 KB in JavaScriptCore.
      (size) => "12 ".repeat(Math.ceil(size / 3)),
      (size) => "1-".repeat(size / 2),
      (size) => `x@${"a.".repeat(size / 2)}`,
    ];
    for (const shape of shapes) {
      scrubString(shape(8_192));
      const small = bestOf(5, () => scrubString(shape(8_192)));
      const large = bestOf(5, () => scrubString(shape(32_768)));
      expect(large).toBeLessThan(10 * Math.max(small, 0.05));
    }
  });
});
