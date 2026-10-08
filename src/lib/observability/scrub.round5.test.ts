import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isDebugKey } from "./scrub-keys";
import { scrubBreadcrumb, scrubEvent, scrubLog, scrubString, scrubValue } from "./scrub";

// ---------------------------------------------------------------------------
// Review round 5 (O2-r4-security-rereview.md, probes in wave2/o2-r4-rr/). Samples
// are the reviewer's. The ruling: structured data is kept only under a debug-key
// ALLOWLIST; any other string becomes [redacted:<length>].
// ---------------------------------------------------------------------------

const PII =
  /jane|doe\b|Doe|santos|juan|maria|cruz|0917|917 123|9171234567|mabini|makati|gmail|jdoe|janey|pregnant|hijab|tummy|greenbelt/i;
const WALL_CLOCK_LIMIT_MS = 500;
const json = (value: unknown) => JSON.stringify(value);
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
const click = (message: string, hint?: unknown) =>
  (scrubBreadcrumb({ category: "ui.click", message }, hint) as { message: string }).message;
const element = (
  tag: string,
  attributes: Record<string, string>,
  parentNode: unknown = null,
  dataset: Record<string, string> = {},
) => ({
  tagName: tag.toUpperCase(),
  id: attributes.id ?? "",
  className: attributes.class ?? "",
  dataset,
  getAttribute: (name: string) => attributes[name] ?? null,
  parentNode,
});

/** Every `Row` column of every table, read from the generated Supabase types. */
function schemaRows(): Map<string, string[]> {
  const source = readFileSync(
    new URL("../../integrations/supabase/types.ts", import.meta.url),
    "utf8",
  );
  const tables = new Map<string, string[]>();
  let table = "";
  let inRow = false;
  for (const line of source.split("\n")) {
    const tableMatch = /^ {6}([a-z_]+): \{$/.exec(line);
    if (tableMatch) table = tableMatch[1];
    if (/^ {8}Row: \{$/.test(line)) {
      inRow = true;
      tables.set(table, []);
      continue;
    }
    if (inRow && /^ {8}\};$/.test(line)) inRow = false;
    const column = inRow ? /^ {10}([a-z_0-9]+)\??:/.exec(line) : null;
    if (column) tables.get(table)?.push(column[1]);
  }
  return tables;
}

describe("N2, L4: every database column is redacted unless it is a debug key", () => {
  const tables = schemaRows();

  test("the schema was read", () => {
    expect(tables.size).toBeGreaterThanOrEqual(20);
    expect(tables.get("profiles")).toContain("styling_constraints");
  });

  test("a name in any column never survives, in an object or in JSON text", () => {
    for (const [table, columns] of tables) {
      const row = Object.fromEntries(columns.map((column) => [column, "Jane Doe"]));
      const walked = scrubValue(row) as Record<string, unknown>;
      for (const column of columns) {
        expect({ table, column, value: walked[column] }).toEqual({
          table,
          column,
          value: expect.stringMatching(/^\[(?:redacted(?::\d+)?|Filtered)\]$/),
        });
      }
      expect(scrubString(json(row))).not.toMatch(PII);
      expect(scrubString(json({ data: [row, { nested: row }] }))).not.toMatch(PII);
    }
  });

  test("a token-shaped value survives only under the listed enum columns", () => {
    const kept: string[] = [];
    for (const [table, columns] of tables) {
      for (const column of columns) {
        const out = (scrubValue({ [column]: "janedoe88" }) as Record<string, unknown>)[column];
        if (out === "janedoe88") kept.push(`${table}.${column}`);
        else expect({ column, out }).toEqual({ column, out: "[redacted]" });
      }
    }
    // Word-shaped values reach Sentry only under these debug keys (enums the
    // admin's own logs carry). A new column is covered by the walk above.
    expect(kept.sort()).toEqual([
      "analytics_events.source",
      "brands.status",
      "purchases.status",
      "staff_audit_log.action",
      "staff_audit_log.target_type",
      "subscriptions.status",
      "support_messages.kind",
    ]);
    for (const name of kept) expect(isDebugKey(name.split(".")[1])).toBe(true);
  });
});

describe("structured data: allowlist, length markers, numbers, collections", () => {
  test("unknown keys lose their strings, with the length kept", () => {
    expect(scrubValue({ note: "Jane asked nicely", plan: "pro", amount: 5 })).toEqual({
      note: "[redacted]",
      plan: "[redacted]",
      amount: 5,
    });
  });

  test("N2: real profile columns and OAuth identity keys", () => {
    const outs = [
      scrubValue({
        id: "9f1c2d3e-0000-4000-8000-000000000001",
        full_name: "Jane Doe",
        styling_constraints: { notes: "Jane, 7 months pregnant, wears hijab" },
        style_goals: ["hide my tummy"],
        body_type: "pear",
        skin_undertone: "warm",
        profile_photo_path: "jane-doe/selfie.jpg",
        hidden_reason: "posted her number to Maria Cruz",
      }),
      scrubValue({
        conversation: { title: "Jane's wedding outfit, 7 months pregnant" },
        outfit: { analysis_result: { summary: "Jane has a pear body shape" } },
      }),
      scrubValue({
        user_metadata: {
          given_name: "Jane",
          family_name: "Doe",
          nickname: "Janey",
          preferred_username: "jdoe",
          picture: "https://lh3.googleusercontent.com/a/ACg8ocJx",
        },
      }),
    ];
    for (const out of outs) expect(json(out)).not.toMatch(/pear|warm|lh3/);
    for (const out of outs) expect(json(out)).not.toMatch(PII);
  });

  test("N6: phone-shaped numbers under unknown keys, in objects and JSON text", () => {
    expect(scrubValue({ contact: 9171234567, alt: 639171234567, landline: 28123456 })).toEqual({
      contact: "[redacted]",
      alt: "[redacted]",
      landline: "[redacted]",
    });
    expect(json(scrubValue({ contact: 639171234567n }))).not.toContain("639171234567");
    const text = scrubString(
      '{"contact": 9171234567, "alt": 639171234567, "landline": 28123456, "intl": 14155550100}',
    );
    expect(text).not.toMatch(/9171234567|28123456|14155550100/);
    // Counts, amounts and timestamps stay (round 6: an amount of seven digits is phone-shaped).
    expect(scrubValue({ amount: 150000, count: 3, created_at_ms: 1791311596541, page: 2 })).toEqual(
      {
        amount: 150000,
        count: 3,
        created_at_ms: 1791311596541,
        page: 2,
      },
    );
    expect(scrubValue({ total: 12, flagged: true, missing: null })).toEqual({
      total: 12,
      flagged: true,
      missing: null,
    });
  });

  test("N14: collections of names under any key, Sets included", () => {
    expect(
      scrubString(
        '{"names":["Jane Doe","Maria Cruz"],"members":["Jane Doe"],"recipients":"Jane Doe"}',
      ),
    ).not.toMatch(PII);
    expect(json(scrubValue({ names: ["Jane Doe", "Maria Cruz"] }))).not.toMatch(PII);
    expect(json(scrubValue(new Set(["Jane Doe", "Maria Cruz"])))).not.toMatch(PII);
    expect(json(scrubValue([{ full_name: "Jane Doe" }, { email: "m@x.com" }]))).not.toMatch(
      /Jane|m@x/,
    );
  });

  test("N5: toJSON is resolved before the walk; functions never pass", () => {
    const member = { toJSON: () => ({ full_name: "Jane Doe" }), x: 1 };
    expect(json(scrubValue({ m: member }))).not.toMatch(PII);
    expect(json(scrubValue(member))).not.toMatch(PII);
    const log = scrubLog({ message: "x", attributes: { member } });
    expect(JSON.stringify(log)).not.toMatch(PII);
    expect(scrubValue({ f: () => "Jane Doe" })).toEqual({ f: "[function]" });
    class Row2 {
      constructor(
        public name: string,
        public message: string,
        public code: string,
      ) {}
    }
    expect(json(scrubValue(new Row2("Jane Doe", "Jane Doe says hi", "ABC")))).not.toMatch(PII);
  });

  test("N13: only the SDK's own contexts keep their fields", () => {
    const event = scrubEvent({
      contexts: {
        profile: { name: "Jane Doe", profile_id: "0123456789abcdef0123456789abcdef" },
        member: { name: "Jane Doe" },
        os: { name: "iOS", version: "18.0" },
        culture: { locale: "en-PH", timezone: "Asia/Manila" },
      },
    }) as Record<string, any>;
    expect(json(event)).not.toMatch(PII);
    expect(event.contexts.profile.profile_id).toBe("0123456789abcdef0123456789abcdef");
    expect(event.contexts.os).toEqual({ name: "iOS", version: "18.0" });
    expect(event.contexts.culture).toEqual({ locale: "en-PH", timezone: "Asia/Manila" });
  });

  test("Map, Headers, class instances and Error causes", () => {
    for (const value of [
      new Map<string, unknown>([
        ["full_name", "Jane Doe"],
        ["phone", 9171234567],
      ]),
      new Map<unknown, unknown>([[{ id: 1 }, { full_name: "Jane Doe" }]]),
      new Headers({ "x-member-name": "Jane Doe", cookie: "a=b" }),
      new Error("outer", { cause: { message: "Jane Doe", full_name: "Jane Doe" } }),
      Object.assign(new Error("update failed"), {
        row: { full_name: "Jane Doe", message: "Jane Doe" },
        payload: { name: "Jane Doe" },
      }),
    ]) {
      expect(json(scrubValue(value))).not.toMatch(PII);
    }
  });
});

describe("N3: message is kept only on a strictly error-shaped object", () => {
  test("weak or false error markers do not keep a member's message", () => {
    for (const value of [
      { code: "x", message: "Jane Doe" },
      { code: "MILA-REF-7", message: "Hi this is Jane Doe from Makati" },
      { details: "x", message: "Jane Doe" },
      { hint: "", message: "Jane Doe" },
      { status_code: 200, message: "Jane Doe" },
      { statusCode: 200, message: "Jane Doe" },
      { stack: "", message: "Jane Doe" },
      { id: 1, code: "ABC", message: "Jane Doe here" },
      { cause: { message: "Jane Doe", full_name: "Jane Doe" } },
      { errors: [{ full_name: "Jane Doe", name: "Jane Doe" }] },
      { error: { name: "Jane Doe" } },
      {
        id: 1,
        user_id: "9f1c2d3e-0000-4000-8000-000000000001",
        message: "Jane Doe, 0917 123 4567",
      },
      { message: "insert failed", details: { full_name: "Jane Doe", message: "Jane Doe" } },
      // The real-SDK probe's B2: a row whose `code` column holds a short word.
      { code: "ABC", message: "Jane Doe here" },
      { row: { code: "ABC", message: "Jane Doe here" } },
    ]) {
      expect(json(scrubValue(value))).not.toMatch(PII);
      expect(scrubString(json(value))).not.toMatch(PII);
    }
  });

  test("the same in text that does not parse", () => {
    for (const text of [
      '{"code":"x","message":"Jane Doe',
      '[{"message":"Jane Doe","id":1},{"code":"23505","message":"dup"}',
      "{ code: 'x', message: 'Jane Doe' }",
      "{ id: 1, message: 'Jane Doe', user: { code: 'x' }",
      "Error: boom { code: 'X1', row: { message: 'Jane Doe' } }",
      'code: 23505 message: "Jane Doe"',
    ]) {
      expect(scrubString(text)).not.toMatch(PII);
    }
  });

  test("real errors keep their message", () => {
    const pg = { code: "23505", details: "x", hint: null, message: "duplicate key value" };
    expect(scrubValue(pg)).toMatchObject({ code: "23505", message: "duplicate key value" });
    expect(
      scrubValue({
        __isAuthError: true,
        name: "AuthApiError",
        status: 400,
        code: "validation_failed",
        message: "Invalid login credentials",
      }),
    ).toMatchObject({ name: "AuthApiError", message: "Invalid login credentials" });
    expect(scrubValue({ error: { message: "socket hang up" } })).toEqual({
      error: { message: "socket hang up" },
    });
    expect(
      scrubValue({ name: "TypeError", message: "x is undefined", stack: "TypeError: x" }),
    ).toEqual({
      name: "TypeError",
      message: "x is undefined",
      stack: "TypeError: x",
    });
    const text = '{"code":"PGRST116","details":null,"hint":null,"message":"JSON object requested"}';
    expect(scrubString(text)).toBe(text);
  });
});

describe("N1: error words inside member text do not make it an error", () => {
  test("the reviewer's samples", () => {
    for (const text of [
      "{ id: 1, message: 'promo code: SUMMER. I am Jane Doe' }",
      "{ id: 1, message: 'my details: Jane Doe, Makati' }",
      "{ id: 1, message: 'hint: I am Jane Doe' }",
      '{"id":1,"message":"promo code: SUMMER. I am Jane Doe',
      '{"id":1,"kind":"bug","note":"stack: none","message":"I am Jane Doe',
      '{"id":1,"message":"promo code: SUMMER. I am Jane Doe"}',
      '[support] row {"id":1,"message":"promo code: SUMMER. I am Jane Doe"} x',
      `{ id: 1, name: 'Jane Doe', message: "name: 'TypeError' Jane Doe" }`,
      '{"id":1,"message":"error: {Jane Doe}',
    ]) {
      expect(scrubString(text)).not.toMatch(PII);
    }
    expect(
      json(scrubValue({ id: 1, kind: "bug", message: "promo code: SUMMER. I am Jane Doe" })),
    ).not.toMatch(PII);
    expect(
      json(scrubValue({ log: "{ id: 1, message: 'promo code: SUMMER. I am Jane Doe' }" })),
    ).not.toMatch(PII);
  });
});

describe("N4, N12 and other Postgres text", () => {
  test("expression indexes with nested parentheses", () => {
    expect(scrubString("Key (lower((username)::text))=(jane.doe88) already exists.")).toBe(
      "Key (lower((username)::text))=([redacted]) already exists.",
    );
    expect(scrubString("Key (lower(TRIM(BOTH FROM username)))=(jane.doe88) already exists.")).toBe(
      "Key (lower(TRIM(BOTH FROM username)))=([redacted]) already exists.",
    );
  });

  test("DETAIL keeps its first clause; CONTEXT JSON lines lose the data", () => {
    expect(scrubString('DETAIL:  Expected ":", but found "Jane".')).toBe(
      'DETAIL:  Expected ":", but found "[redacted]".',
    );
    expect(scrubString("CONTEXT:  JSON data, line 1: Jane...")).toBe(
      "CONTEXT:  JSON data, line 1: [redacted]",
    );
    expect(scrubString('DETAIL:  Array value must start with "{" or dimension information.')).toBe(
      'DETAIL:  Array value must start with "{" or dimension information.',
    );
  });

  test("the reviewer's pg2 and pg samples", () => {
    for (const text of [
      'DETAIL:  Expected JSON value, but found "Jane".',
      'DETAIL:  Expected string or "}", but found "Jane".',
      'invalid input syntax for type boolean: "Jane"',
      'invalid input syntax for type bigint: "0917 123 4567x"',
      'invalid input value for enum public.app_role: "jane"',
      'new row for relation "profiles" violates check constraint "username_format"\nDETAIL:  Failing row contains (9f1c2d3e-0000-4000-8000-000000000001, Jane Doe, jane.doe88, f, 2026-10-07 01:02:03+00).',
      'ERROR:  duplicate key value violates unique constraint "profiles_username_lower_idx"\nDETAIL:  Key (lower(username))=(jane.doe88\nsecond line) already exists.',
      "invalid input syntax for type uuid: 'jane.doe88'",
      "invalid input syntax for type uuid: jane.doe88",
      'invalid input syntax for type json\nDETAIL:  Token "Jane" is invalid.\nCONTEXT:  JSON data, line 1: Jane...',
      'Email address "jane.doe88" is invalid',
    ]) {
      expect(scrubString(text)).not.toMatch(/jane|0917/i);
    }
  });
});

describe("N7: an exhausted JSON parser budget fails closed", () => {
  test("keys only the parser can read never go out raw", () => {
    const escapedKey = '{"\\u0066ull_name":"Jane Doe"}';
    for (const size of [100, 300, 1000]) {
      const exhaust = `${"[".repeat(size)} `;
      for (const tail of [
        escapedKey,
        JSON.stringify(JSON.stringify(JSON.stringify(JSON.stringify({ full_name: "Jane Doe" })))),
        '{"Full Name:":"Jane Doe"}',
        '{"full_name":"Jane Doe","message":"Jane Doe"}',
        '{"code":"23505","details":"x","message":"Jane Doe"}',
        '{"ｆｕｌｌ_ｎａｍｅ":"Jane Doe"}',
      ]) {
        expect(scrubString(exhaust + tail)).not.toMatch(PII);
      }
    }
    expect(scrubString('{"\\u0066ull_name":"Jane Doe", "x": "abc')).not.toMatch(PII);
  });
});

describe("N8, N9: unquoted key: value and key=value", () => {
  test("non-allowlisted keys lose the whole value", () => {
    for (const [text, sent] of [
      ["full_name: Jane Doe", "full_name: [redacted]"],
      ["username: jane.doe88", "username: [redacted]"],
      ["Invalid email: jane.doe88", "Invalid email: [redacted]"],
      ["Member: Jane Doe", "Member: [redacted]"],
      ["full_name = Jane Doe", "full_name = [redacted]"],
      ["full_name=Jane Doe", "full_name=[redacted]"],
      ["{ full_name: Jane Doe }", "{ full_name: [redacted] }"],
      ["full_name:\tJane", "full_name:\t[redacted]"],
    ] as const) {
      expect(scrubString(text)).toBe(sent);
    }
    expect(scrubString("Updating member full_name: Jane Doe, city: Makati")).toBe(
      "Updating member full_name: [redacted], city: [redacted]",
    );
  });

  test("error text, allowlisted keys and positions still read", () => {
    for (const text of [
      "TypeError: Cannot read properties of undefined (reading 'id')",
      "Invariant failed: Could not find match for from: /_authed/members/$memberId",
      "SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
      "AbortError: The operation was aborted. (timeout 8000ms)",
      "code: PGRST116, status: 406, hint: null",
      "retry count=3 status=500 code=PGRST205",
      "failed (code: 42P01)",
      "    at node:internal/process/task_queues:105:5",
      "    at loadMembers (https://admin.mila.app/assets/members-Bx12.js:1:200)",
      "Warning: Each child in a list should have a unique key prop.",
      "[members] credit read failed: entitlements",
      "Missing env: SUPABASE_URL",
      "connect ECONNREFUSED 127.0.0.1:5432",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });
});

describe("N10: click text without the element is redacted whole; ids lose their value", () => {
  test("no element", () => {
    for (const message of [
      "Jane Doe",
      "jane",
      "Maria > Jane",
      "Opened Jane Doe",
      'tr#member-jane-doe > td[title="x"]',
      'div.flex > button.btn.btn-primary[type="submit"]',
    ]) {
      expect(click(message)).toBe("[redacted]");
    }
  });

  test("with the element: ids become #[id]", () => {
    const tr = element("tr", { class: "row", id: "member-jane-doe" }, element("tbody", {}));
    const td = element(
      "td",
      { class: "truncate", title: "Jane Doe", "aria-label": "Jane Doe" },
      tr,
    );
    expect(click("ignored", { event: { target: td } })).toBe("tbody > tr#[id].row > td.truncate");
    const button = element(
      "button",
      { class: "btn btn-primary", type: "submit" },
      element("div", { class: "flex" }),
    );
    expect(click("ignored", { event: { target: button } })).toBe(
      'div.flex > button.btn.btn-primary[type="submit"]',
    );
  });

  test("a rebuilt selector survives the event's second pass; raw text does not", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { category: "ui.click", message: 'div.flex > button.btn.btn-primary[type="submit"]' },
        { category: "ui.click", message: "tbody > tr#[id].row > td.truncate" },
        { category: "ui.click", message: "Maria > Jane" },
      ],
    }) as { breadcrumbs: Array<{ message: string }> };
    expect(event.breadcrumbs.map((crumb) => crumb.message)).toEqual([
      'div.flex > button.btn.btn-primary[type="submit"]',
      "tbody > tr#[id].row > td.truncate",
      "[redacted]",
    ]);
  });
});

describe("N11: URLs, paths and encodings", () => {
  test("fragments, handles, slugs, storage paths and encoded names", () => {
    for (const text of [
      "https://admin.mila.app/members#jane-doe",
      "https://admin.mila.app/members#Jane%20Doe",
      "/members?q=Jane Doe&page=1",
      "https://admin.mila.app/posts/jane-doe-summer-look",
      "https://admin.mila.app/@jane.doe",
      "https://admin.mila.app/dm/jane.doe88",
      "https://abc.supabase.co/storage/v1/object/public/avatars/jane-doe/selfie.jpg",
      "https://abc.supabase.co/storage/v1/object/sign/receipts/Jane%20Doe%20receipt.pdf?token=eyJhbGciOiJIUzI1NiJ9.e30.x",
      "https://admin.mila.app/database/profiles/Jane%20Doe",
      "/api/x/%7B%22full_name%22%3A%22Jane%20Doe%22%7D",
      "GET https://abc.supabase.co/rest/v1/profiles?select=id&or=(full_name.ilike.*Jane Doe*,username.ilike.*Jane Doe*)&limit=50",
      'GET https://abc.supabase.co/rest/v1/profiles?full_name=in.("Jane Doe","Maria Cruz")',
      "https://admin.mila.app/members?select=Jane",
      "https://admin.mila.app/x?type=jane_doe",
    ]) {
      expect(scrubString(text)).not.toMatch(PII);
    }
    expect(scrubString("https://admin.mila.app/members?page=2")).toBe(
      "https://admin.mila.app/members?page=2",
    );
    expect(scrubString("https://abc.supabase.co/rest/v1/profiles?select=id&limit=50")).toBe(
      "https://abc.supabase.co/rest/v1/profiles?select=id&limit=50",
    );
  });

  test("base64 that holds JSON", () => {
    const array = Buffer.from(JSON.stringify([{ full_name: "Jane Doe" }])).toString("base64");
    const object = Buffer.from(JSON.stringify({ full_name: "Jane Doe" })).toString("base64");
    const spaced = Buffer.from(' {"full_name":"Jane Doe"}').toString("base64");
    for (const text of [
      `row=${array}`,
      `payload ${array}`,
      `payload ${object}`,
      `payload ${spaced}`,
    ]) {
      const out = scrubString(text);
      expect(out).not.toContain(array);
      expect(out).not.toContain(spaced);
      expect(out).not.toContain(object);
    }
  });
});

describe("N6: more phone forms", () => {
  test("separators, spacing, dashes and fullwidth digits", () => {
    for (const text of [
      "+63.917.123.4567",
      "0917  123  4567",
      "0917 123 4567",
      "0917–123–4567",
      "０９１７ １２３ ４５６７",
      "917/123/4567",
      "0917_123_4567",
      "(02) 8123 4567",
      "+1 (415) 555-0100",
      "63 917 1234567",
    ]) {
      expect(scrubString(`call ${text} now`)).toBe("call [phone] now");
    }
  });

  test("dates, addresses, versions and decimals stay", () => {
    for (const text of [
      "on 2026/10/07",
      "on 10/07/2026",
      "host 192.168.100.200",
      "pi 3.14159265",
      "version 1.2.3.4",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });
});

describe("point 4: debugging data survives", () => {
  const pg = {
    code: "23505",
    details: "Key (username)=(jane.doe88) already exists.",
    hint: null,
    message: 'duplicate key value violates unique constraint "profiles_username_key"',
  };
  const event = scrubEvent({
    event_id: "0123456789abcdef0123456789abcdef",
    release: "mila-admin@1.4.2+abc123",
    environment: "preview",
    transaction: "/_authed/members/$memberId",
    level: "error",
    user: { id: "9f1c2d3e-0000-4000-8000-000000000001", email: "jane@x.com", username: "jdoe" },
    server_name: "Janes-MacBook-Pro",
    tags: {
      app: "mila-admin",
      runtime: "server",
      route: "/_authed/members/$memberId",
      status: "500",
    },
    exception: {
      values: [
        {
          type: "PostgrestError",
          value: pg.message,
          mechanism: { type: "auto.function", handled: false },
          stacktrace: {
            frames: [
              {
                filename: "app:///assets/members-BkX3a9.js",
                abs_path: "https://admin.mila.app/assets/members-BkX3a9.js",
                function: "loadMember",
                lineno: 1,
                colno: 23456,
                in_app: true,
              },
              {
                filename: "/var/task/.output/server/routes/members/$memberId.mjs",
                function: "handler",
                lineno: 120,
                colno: 7,
                in_app: true,
              },
            ],
          },
        },
        { type: "TypeError", value: "Cannot read properties of undefined (reading 'full_name')" },
        { type: "Error", value: "connect ECONNREFUSED 127.0.0.1:5432" },
      ],
    },
    extra: {
      error: pg,
      status: 409,
      statusText: "Conflict",
      queryKey: ["admin:members", 2],
      code: "PGRST116",
      pgCode: "42P01",
      authCode: "invalid_credentials",
      paddle: {
        error: { type: "request_error", code: "not_found", detail: "Customer ctm_01h8 not found" },
      },
    },
    contexts: {
      trace: {
        trace_id: "0123456789abcdef0123456789abcdef",
        span_id: "0123456789abcdef",
        op: "http.server",
        status: "internal_error",
      },
      os: { name: "Windows" },
      browser: { name: "Chrome", version: "141" },
      device: { name: "Jane's iPhone", model: "Pixel" },
      response: { status_code: 409 },
    },
    breadcrumbs: [
      {
        category: "fetch",
        data: {
          method: "POST",
          url: "https://abc.supabase.co/rest/v1/rpc/grant_ai_credits",
          status_code: 409,
        },
      },
      { category: "navigation", data: { from: "/members", to: "/members?page=3" } },
    ],
    request: {
      url: "https://admin.mila.app/members/9f1c2d3e-0000-4000-8000-000000000001?page=2",
      method: "GET",
    },
    sdk: { name: "sentry.javascript.tanstackstart-react", version: "10.75.2" },
  }) as Record<string, any>;

  test("ids, release, environment, route templates and the SDK", () => {
    expect(event.event_id).toBe("0123456789abcdef0123456789abcdef");
    expect(event.release).toBe("mila-admin@1.4.2+abc123");
    expect(event.environment).toBe("preview");
    expect(event.transaction).toBe("/_authed/members/$memberId");
    expect(event.tags).toEqual({
      app: "mila-admin",
      runtime: "server",
      route: "/_authed/members/$memberId",
      status: "500",
    });
    expect(event.user).toEqual({ id: "9f1c2d3e-0000-4000-8000-000000000001" });
    expect(event.server_name).toBeUndefined();
    expect(event.sdk.name).toBe("sentry.javascript.tanstackstart-react");
    expect(event.contexts.trace).toMatchObject({
      trace_id: "0123456789abcdef0123456789abcdef",
      span_id: "0123456789abcdef",
      op: "http.server",
      status: "internal_error",
    });
    expect(event.contexts.os).toEqual({ name: "Windows" });
    expect(event.contexts.browser).toEqual({ name: "Chrome", version: "141" });
    expect(event.contexts.device).toEqual({ model: "Pixel" });
    expect(event.contexts.response).toEqual({ status_code: 409 });
  });

  test("errors, codes, statuses and stack frames", () => {
    const [pgError, typeError, network] = event.exception.values;
    expect(pgError.type).toBe("PostgrestError");
    expect(pgError.value).toBe(pg.message);
    expect(pgError.mechanism).toEqual({ type: "auto.function", handled: false });
    expect(pgError.stacktrace.frames[0]).toEqual({
      filename: "app:///assets/members-BkX3a9.js",
      abs_path: "https://admin.mila.app/assets/members-BkX3a9.js",
      function: "loadMember",
      lineno: 1,
      colno: 23456,
      in_app: true,
    });
    expect(pgError.stacktrace.frames[1].filename).toBe(
      "/var/task/.output/server/routes/members/$memberId.mjs",
    );
    expect(typeError.value).toBe("Cannot read properties of undefined (reading 'full_name')");
    expect(network.value).toBe("connect ECONNREFUSED 127.0.0.1:5432");
    expect(event.extra).toMatchObject({
      error: {
        code: "23505",
        details: "Key (username)=([redacted]) already exists.",
        message: pg.message,
      },
      status: 409,
      statusText: "Conflict",
      queryKey: ["admin:members", 2],
      code: "PGRST116",
      pgCode: "42P01",
      authCode: "invalid_credentials",
      // Round 6 (R5-M5): `detail` follows the member rule even on an error. The
      // admin's Paddle client puts the detail in its Error message, which stays.
      paddle: {
        error: { type: "request_error", code: "not_found", detail: "[redacted]" },
      },
    });
  });

  test("breadcrumbs and the request", () => {
    expect(event.breadcrumbs[0].data).toEqual({
      method: "POST",
      url: "https://abc.supabase.co/rest/v1/rpc/grant_ai_credits",
      status_code: 409,
    });
    expect(event.breadcrumbs[1].data).toEqual({ from: "/members", to: "/members?page=3" });
    expect(event.request).toEqual({
      url: "https://admin.mila.app/members/:id?page=2",
      method: "GET",
    });
    expect(json(event)).not.toMatch(/jane|jdoe|Janes/);
  });

  test("free-text errors, frames and codes", () => {
    for (const text of [
      "PGRST116: JSON object requested, multiple (or no) rows returned",
      'relation "public.profilez" does not exist (42P01)',
      "TypeError: Failed to fetch at https://admin.mila.app/assets/index-BkX3a9.js:1:23456",
      "    at loadMember (webpack-internal:///./src/routes/members.tsx:41:13)",
      "loadMember@https://admin.mila.app/assets/index-BkX3a9.js:1:23456",
      "route /_authed/members/$memberId failed with 500",
      '[member-billing] grant_ai_credits failed {"code":"P0001","message":"insufficient credits"}',
      "Hydration failed because the server rendered HTML didn't match the client.",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });

  test("the staff-audit and member-billing log attributes", () => {
    const log = scrubLog({
      message: "[staff-audit] audit record not saved",
      attributes: {
        action: "member.credits_granted",
        target_type: "member",
        target_id: "9f1c2d3e-0000-4000-8000-000000000001",
        error: "permission denied for table staff_audit_log",
        "sentry.release": "mila-admin@1.4.2",
        "server.address": "ip-10-0-0-1",
      },
    });
    expect(log.attributes).toEqual({
      action: "member.credits_granted",
      target_type: "member",
      target_id: ":uuid",
      error: "permission denied for table staff_audit_log",
      "sentry.release": "mila-admin@1.4.2",
    });
    expect(
      scrubValue({
        actor: "9f1c2d3e-0000-4000-8000-000000000001",
        member: "9f1c2d3e-0000-4000-8000-000000000002",
        amount: 5,
      }),
    ).toEqual({ actor: ":uuid", member: ":uuid", amount: 5 });
    expect(scrubValue({ to: "jane@x.com", detail: "Jane Doe" })).toEqual({
      to: "[redacted]",
      detail: "[redacted]",
    });
    expect(
      scrubValue({
        event: "rate_limit_block",
        policy: "login",
        method: "password",
        source: "request-error-page",
      }),
    ).toEqual({
      event: "rate_limit_block",
      policy: "login",
      method: "password",
      source: "request-error-page",
    });
  });
});

describe("the reviewer's remaining probes (a1, a2, caps, r3)", () => {
  test("auth user objects, track breadcrumbs and console arguments", () => {
    const meta = {
      id: "9f1c2d3e-0000-4000-8000-000000000001",
      email: "jane@gmail.com",
      phone: "639171234567",
      user_metadata: {
        full_name: "Jane Doe",
        name: "Jane Doe",
        given_name: "Jane",
        family_name: "Doe",
        picture: "https://lh3.googleusercontent.com/a/ACg8ocJ",
        avatar_url: "https://lh3.googleusercontent.com/a/ACg8ocJ",
        preferred_username: "jdoe",
      },
      identities: [
        {
          identity_data: {
            email: "jane@gmail.com",
            full_name: "Jane Doe",
            nickname: "Janey",
            handle: "jdoe",
          },
        },
      ],
    };
    expect(json(scrubValue(meta))).not.toMatch(/Jane|jdoe|lh3|gmail|Janey/);
    const crumb = scrubBreadcrumb({
      category: "track",
      message: "member.credits_granted",
      data: { member: "Jane Doe", note: "Jane asked nicely", amount: 5 },
    }) as { message: string; data: Record<string, unknown> };
    expect(crumb).toEqual({
      category: "track",
      message: "member.credits_granted",
      data: { member: "[redacted]", note: "[redacted]", amount: 5 },
    });
    const consoleCrumb = scrubBreadcrumb({
      category: "console",
      level: "error",
      message: "[mailer] send failed { to: 'jane@x.com', detail: 'Jane Doe' }",
      data: {
        arguments: ["[mailer] send failed", { to: "jane@x.com", detail: "x" }],
        logger: "console",
      },
    });
    expect(json(consoleCrumb)).not.toMatch(/jane|Jane/);
    expect(json(consoleCrumb)).toContain("[mailer] send failed");
  });

  test("caps: size, depth, nesting", () => {
    const pad = (n: number) => "x ".repeat(n / 2);
    let deep: unknown = { full_name: "Jane Doe", message: "Jane Doe" };
    for (let i = 0; i < 25; i++) deep = { a: deep };
    let errorDeep: unknown = { code: "X", message: "Jane Doe" };
    for (let i = 0; i < 25; i++) errorDeep = { error: errorDeep };
    let nested = JSON.stringify({ full_name: "Jane Doe" });
    for (let i = 0; i < 10; i++) nested = JSON.stringify({ body: nested });
    for (const out of [
      scrubString(`{"full_name":"Jane Doe"} ${pad(70_000)}`),
      scrubString(`${pad(70_000)} {"full_name":"Jane Doe"}`),
      scrubString(`{"note":"a","full_name":"${"Jane Doe ".repeat(8000)}"}`),
      scrubString(`${pad(40_000)} {"full_name":"Jane Doe"} ${pad(10_000)}`),
      json(scrubValue(deep)),
      json(scrubValue(errorDeep)),
      scrubString(
        `${'{"a":'.repeat(30)}{"full_name":"Jane Doe","message":"Jane Doe"}${"}".repeat(30)}`,
      ),
      scrubString(nested),
    ]) {
      expect(out).not.toMatch(PII);
    }
  });

  test("r3: a \\u-escaped key in cut JSON, and every other profile column", () => {
    expect(scrubString('{"\\u0066ull_name":"Jane Doe", "x": "abc')).not.toMatch(PII);
    expect(
      scrubString(
        JSON.stringify({
          body_type: "petite",
          face_shape: "oval",
          skin_undertone: "warm",
          hair_type: "curly",
          color_season: "autumn",
          profile_photo_path: "u/jane-doe/selfie.jpg",
          hidden_reason: "Jane posted her number 0917 123 4567",
        }),
      ),
    ).not.toMatch(/petite|oval|warm|curly|autumn|jane|0917/i);
  });
});

describe("linear on hostile input (round 5 shapes)", () => {
  const fill = (unit: string, size: number) =>
    unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
  const shapes: Array<(size: number) => string> = [
    (size) => fill('{"full_name":', size),
    (size) => fill("full_name: 'x' + ", size),
    (size) => fill("a: '", size),
    (size) => fill("full_name=x ", size),
    (size) => fill("full_name: x, ", size),
    (size) => `Key (${fill("(a)", size)}`,
    (size) => fill("/users/", size),
    (size) => fill('"message":"x",', size),
    (size) => fill('{"message":"x","a":[', size),
    (size) => fill("'\"`", size),
    (size) => fill("jane.doe@gmail.com ", size),
    (size) =>
      `[${fill('{"id":1,"full_name":"Jane Doe","code":"ABC","message":"hi"},', size - 2)}{}]`,
    (size) => fill("1234.", size),
    (size) => fill("12-", size),
    (size) => fill("W3si", size),
    (size) => fill("?q=a b ", size),
    (size) => fill("#a", size),
    (size) => fill('DETAIL:  x, "y" ', size),
  ];

  test("every shape stays inside the wall-clock limit at 64 KB", () => {
    for (const shape of shapes) {
      expect(timed(() => scrubString(shape(65_536)))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    }
  });

  test("four times the input costs well under sixteen times the time", () => {
    for (const shape of shapes) {
      scrubString(shape(8_192));
      const small = bestOf(5, () => scrubString(shape(8_192)));
      const large = bestOf(5, () => scrubString(shape(32_768)));
      expect(large).toBeLessThan(10 * Math.max(small, 0.05));
    }
  });

  test("a wide object and a deep one", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 5000 }, (_, i) => [`k${i}`, i === 4999 ? "Jane Doe <jane@x.com>" : "v"]),
    );
    let out: unknown;
    expect(timed(() => (out = scrubValue(wide)))).toBeLessThan(WALL_CLOCK_LIMIT_MS);
    expect(json(out)).not.toMatch(PII);
  });
});
