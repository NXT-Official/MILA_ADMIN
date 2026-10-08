import { afterEach, describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { createMailer } from "../mailer";
import { scrubBreadcrumb, scrubEvent, scrubLog, scrubString, scrubValue } from "./scrub";

// ---------------------------------------------------------------------------
// Review round 6 (O2-r5-security-rereview.md, probes in wave2/o2-r5-rr/). Every
// reproducer is the reviewer's. Rulings: no length in a redaction marker under
// a member key or for a string under 32 characters; error-text keys read the
// same in every text form; keys are data too; the allowlist is tightened.
// ---------------------------------------------------------------------------

const PII =
  /jane|doe\b|Doe|santos|maria|cruz|0917|917 123|9171234567|2125550123|makati|gmail|jdoe|pregnant|wedding|non-binary/i;
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

describe("R5-I1: a redaction marker carries no length for member keys or short strings", () => {
  test("enum-valued member columns are indistinguishable", () => {
    for (const gender of ["Female", "Male", "Non-binary", "Prefer not to say"]) {
      expect(scrubValue({ gender })).toEqual({ gender: "[redacted]" });
    }
    for (const value of ["Pear", "Apple", "Inverted Triangle", "Oval", "Diamond", "Neutral"]) {
      expect(scrubValue({ body_type: value, face_shape: value, undertone: value })).toEqual({
        body_type: "[redacted]",
        face_shape: "[redacted]",
        undertone: "[redacted]",
      });
    }
  });

  test("only a long string under a non-member key keeps its length", () => {
    const long = "x".repeat(40);
    expect(scrubValue({ notes: long, bio: "y".repeat(100), label: "short one" })).toEqual({
      notes: "[redacted:40]",
      bio: "[redacted]",
      label: "[redacted]",
    });
    expect(scrubValue({ tags: new Set(["Non-binary"]), list: ["Female"] })).toEqual({
      tags: ["[redacted]"],
      list: ["[redacted]"],
    });
  });

  test("the same in JSON text", () => {
    // Not "a" × 40: forty hex characters are a commit id, which is kept.
    expect(scrubString(`{"gender":"Non-binary","notes":"${"x".repeat(40)}","bio":"Hi"}`)).toBe(
      '{"gender":"[redacted]","notes":"[redacted:40]","bio":"[redacted]"}',
    );
  });
});

describe("R5-M1: error-text keys read the same in every text form", () => {
  test("title, description, detail, hint, msg and name outside an error", () => {
    const cases: Array<[string, string]> = [
      ["title: Jane wedding outfit, 7 months pregnant", "title: [redacted]"],
      ["description: Jane Doe", "description: [redacted]"],
      ["detail: Jane Doe could not pay", "detail: [redacted]"],
      ["hint: Jane Doe", "hint: [redacted]"],
      ["name: Jane Doe", "name: [redacted]"],
      ["msg=Jane Doe", "msg=[redacted]"],
      ["description='Jane Doe 7 months pregnant'", "description='[redacted]'"],
      [
        'conversation created title="Jane wedding outfit"',
        'conversation created title="[redacted]"',
      ],
      ['member name="Jane Doe" updated', 'member name="[redacted]" updated'],
      ['<td title="Jane Doe">', '<td title="[redacted]">'],
      [
        'level=error msg="update failed" user="jane.doe88" name="Jane Doe"',
        'level=error msg="[redacted]" user="[redacted]" name="[redacted]"',
      ],
    ];
    for (const [input, output] of cases) expect(scrubString(input)).toBe(output);
  });

  test("an error-class name, an error's own hint and the ruled message still read", () => {
    for (const kept of [
      "name: TypeError",
      'name="AbortError"',
      "message: Jane Doe says hi",
      "{ code: 'ECONNRESET', hint: 'retry later' }",
      "{ code: 'ECONNRESET', hint: retry later }",
    ]) {
      expect(scrubString(kept)).toBe(kept);
    }
  });
});

describe("R5-M2: key case, dotted keys and a colon with no space", () => {
  test("the reviewer's variants", () => {
    const cases: Array<[string, string]> = [
      ["FULL_NAME: Jane Doe", "FULL_NAME: [redacted]"],
      ["USERNAME=jane.doe88", "USERNAME=[redacted]"],
      ["BIO: Jane Doe from Makati", "BIO: [redacted]"],
      ["NAME: Jane Doe", "NAME: [redacted]"],
      ["HAIR_TYPE: Curly coils", "HAIR_TYPE: [redacted]"],
      ["{ FULL_NAME: Jane Doe }", "{ FULL_NAME: [redacted] }"],
      ["profile.full_name: Jane Doe", "profile.full_name: [redacted]"],
      ["member.username=jane.doe88", "member.username=[redacted]"],
      ["full_name:Jane Doe", "full_name:[redacted]"],
      ["username:\tjane.doe88", "username:\t[redacted]"],
      ["'full_name': Jane Doe", "'full_name': [redacted]"],
    ];
    for (const [input, output] of cases) expect(scrubString(input)).toBe(output);
  });

  test("Postgres labels, codes, URLs, positions and dotted calls stay", () => {
    for (const kept of [
      'ERROR:  duplicate key value violates unique constraint "profiles_username_key"',
      "HINT:  No function matches the given name and argument types.",
      "ECONNRESET: socket hang up",
      'Unexpected token in JSON: "full_name" is required',
      "ERR_INVALID_URL: Invalid URL",
      "Warning: React.createElement: type is invalid -- expected a string",
      "https://admin.mila.app/members?page=2",
      "connect ECONNREFUSED 127.0.0.1:5432",
      "at fn (src/lib/members.ts:12:3)",
      "status:500 after 12:30",
      "localhost:3000",
      "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
    ]) {
      expect(scrubString(kept)).toBe(kept);
    }
    expect(scrubString("authorization: bearer abcdefghijkl")).toBe(
      "authorization: bearer [redacted]",
    );
    expect(scrubString("DETAIL:  Key (username)=(jane.doe88) already exists.")).toBe(
      "DETAIL:  Key (username)=([redacted]) already exists.",
    );
  });
});

describe("R5-M3: fullwidth quotes and backslashes are not folded", () => {
  test("a member's own fullwidth quotes cannot close her string and forge an error", () => {
    const out = scrubString('{"note":"a＂}, {＂code＂:＂23505＂,＂message＂:＂Jane Doe＂}"}');
    expect(out).not.toMatch(PII);
    expect(out).toMatch(/^\{"note":"\[redacted(?::\d+)?\]"\}$/);
    expect(scrubString("a＂b＼c｛d｝")).toBe("a＂b＼c｛d｝");
  });

  test("fullwidth addresses, keys and digits are still read", () => {
    expect(scrubString("ｊａｎｅ＠ｇｍａｉｌ．ｃｏｍ")).toBe("[email]");
    expect(scrubString("ｆｕｌｌ＿ｎａｍｅ: Jane Doe")).toBe("full_name: [redacted]");
    expect(scrubString("call ０９１７ １２３ ４５６７")).toBe("call [phone]");
  });
});

describe("R5-M4: keys that are member text are redacted as keys", () => {
  test("object keys, Map keys and nested keys", () => {
    expect(scrubValue({ "Jane Doe": 1 })).toEqual({ "[key]": 1 });
    expect(scrubValue(new Map([["jane.doe88", { credits: 5 }]]))).toEqual({
      "[key]": { credits: 5 },
    });
    expect(scrubValue({ counts: { "Maria Cruz": 3 } })).toEqual({ counts: { "[key]": 3 } });
    expect(json(scrubValue({ "jane.doe88@gmail.com": true }))).not.toMatch(PII);
    expect(scrubValue({ "Jane Doe": 1, "Maria Cruz": 2 })).toEqual({ "[key]": 1, "[key:2]": 2 });
    expect(json(scrubValue({ 名前: "x", ["a".repeat(65)]: 1 }))).toBe(
      '{"[key]":"[redacted]","[key:2]":1}',
    );
  });

  test("the same in JSON text and in custom contexts", () => {
    expect(scrubString('{"Jane Doe":1,"Maria Cruz":2}')).toBe('{"[key]":1,"[key:2]":2}');
    expect(scrubString('{"Jane Doe":"x","a":')).not.toMatch(PII);
    const event = scrubEvent({ contexts: { "Jane Doe": { kind: "x" } } }) as {
      contexts: Record<string, unknown>;
    };
    expect(event.contexts).toEqual({ "[key]": { kind: "x" } });
  });

  test("field names stay: SDK attributes, headers, code identifiers, known keys", () => {
    const keys = [
      "sentry.message.template",
      "user.id",
      "http.response.status_code",
      "ui.component_name",
      "x-vercel-id",
      "fullName",
      "full_name",
      "Full Name",
      "targetType",
      "9f1c2d3e",
    ];
    const out = scrubValue(Object.fromEntries(keys.map((key) => [key, 1]))) as object;
    expect(Object.keys(out)).toEqual(keys);
  });
});

describe("R5-M5: an error's own title, description and detail follow the member rule", () => {
  test("Error own properties", () => {
    class MemberError extends Error {
      title = "Jane's wedding outfit";
      description = "Jane Doe";
      detail = "Jane Doe";
      status = 409;
    }
    const out = scrubValue({ e: new MemberError("could not save") }) as {
      e: Record<string, unknown>;
    };
    expect(out.e).toMatchObject({
      name: "Error",
      message: "could not save",
      title: "[redacted]",
      description: "[redacted]",
      detail: "[redacted]",
      status: 409,
    });
  });

  test("Error#name is kept only when it is an error class", () => {
    const named = new Error("x");
    named.name = "Jane Doe";
    const out = json(scrubValue({ e: named }));
    expect(out).not.toMatch(PII);
    expect(out).toContain('"name":"[redacted]"');
    const abort = new Error("timeout 8000ms");
    abort.name = "AbortError";
    expect(scrubValue({ e: abort })).toMatchObject({ e: { name: "AbortError" } });
  });

  test("under error, errors and cause, and on an exception value", () => {
    expect(scrubValue({ error: { title: "Jane's wedding outfit, 7 months pregnant" } })).toEqual({
      error: { title: "[redacted]" },
    });
    expect(scrubValue({ errors: [{ detail: "Jane Doe" }] })).toEqual({
      errors: [{ detail: "[redacted]" }],
    });
    expect(scrubValue({ cause: { description: "Jane Doe", kind: "x" } })).toEqual({
      cause: { description: "[redacted]", kind: "x" },
    });
    const event = scrubEvent({
      exception: { values: [{ type: "Error", value: "x", title: "Jane Doe", detail: "Jane Doe" }] },
    });
    expect(json(event)).not.toMatch(PII);
    expect(
      scrubString('{"error":{"code":"23505","title":"Jane Doe","message":"duplicate key"}}'),
    ).toBe('{"error":{"code":"23505","title":"[redacted]","message":"duplicate key"}}');
  });

  test("an exception type that is not an error class or an SDK type goes", () => {
    const types = (values: Array<{ type: string }>) =>
      (
        scrubEvent({ exception: { values } }) as { exception: { values: Array<{ type: string }> } }
      ).exception.values.map((value) => value.type);
    expect(
      types([
        { type: "Jane Doe" },
        { type: "TypeError" },
        { type: "UnhandledRejection" },
        { type: "Event" },
        { type: "CustomEvent" },
      ]),
    ).toEqual(["[redacted]", "TypeError", "UnhandledRejection", "Event", "CustomEvent"]);
  });

  test("real errors keep their text", () => {
    const pgrst = {
      code: "PGRST116",
      details: "The result contains 0 rows",
      hint: null,
      message: "JSON object requested, multiple (or no) rows returned",
    };
    expect(scrubValue({ error: pgrst })).toEqual({ error: pgrst });
    expect(
      scrubValue({ error: { name: "AuthApiError", message: "Invalid login credentials" } }),
    ).toEqual({
      error: { name: "AuthApiError", message: "Invalid login credentials" },
    });
  });
});

describe("R5-M6: a tighter allowlist", () => {
  const UUID = "9f1c2d3e-0000-4000-8000-000000000001";

  test("queryKey and mutationKey keep only their structure", () => {
    expect(
      scrubValue({
        queryKey: ["admin:database-table", "profiles", 1, "Jane Doe", true, UUID, { q: "x" }],
      }),
    ).toEqual({
      queryKey: [
        "admin:database-table",
        "[redacted]",
        1,
        "[redacted]",
        true,
        ":uuid",
        "[redacted]",
      ],
    });
    expect(scrubValue({ mutationKey: ["update-member", "jane.doe88"] })).toEqual({
      mutationKey: ["update-member", "[redacted]"],
    });
    expect(scrubString('{"queryKey":["admin:database-table","profiles",1,"Jane Doe"]}')).toBe(
      '{"queryKey":["admin:database-table","[redacted]",1,"[redacted]"]}',
    );
  });

  test("params, fingerprint and log parameters keep ids and words only", () => {
    expect(scrubValue({ params: "Jane Doe" })).toEqual({ params: "[redacted]" });
    expect(scrubValue({ params: ["Jane Doe", 3, "profiles", UUID] })).toEqual({
      params: ["[redacted]", 3, "profiles", ":uuid"],
    });
    const event = scrubEvent({
      fingerprint: ["{{ default }}", "Jane Doe", "checkout"],
      logentry: { message: "Member %s", params: ["Jane Doe"] },
    });
    expect(event).toEqual({
      fingerprint: ["{{ default }}", "[redacted]", "checkout"],
      logentry: { message: "Member %s", params: ["[redacted]"] },
    });
    const log = scrubLog({
      message: "x",
      attributes: {
        "sentry.message.parameter.0": "Jane Doe",
        "sentry.message.parameter.1": "profiles",
      },
    });
    expect(log.attributes).toEqual({
      "sentry.message.parameter.0": "[redacted]",
      "sentry.message.parameter.1": "profiles",
    });
  });

  test("statusText and statusMessage are HTTP reason phrases only", () => {
    expect(
      scrubValue({
        statusText: "Jane Doe",
        statusMessage: "Maria Cruz",
        status_text: "Not Found",
        status_message: "Conflict",
      }),
    ).toEqual({
      statusText: "[redacted]",
      statusMessage: "[redacted]",
      status_text: "Not Found",
      status_message: "Conflict",
    });
  });

  test("a prefixed id is 20 to 64 characters with a digit", () => {
    expect(
      scrubValue({
        user_id: "maria_santos88",
        instagram_id: "jane_doe1988",
        member_ids: ["jane_doe1988", "maria_santos88"],
        customer_id: "ctm_01h8x9y7z6w5v4u3t2s1r0q9p8",
      }),
    ).toEqual({
      user_id: "[redacted]",
      instagram_id: "[redacted]",
      member_ids: ["[redacted]", "[redacted]"],
      customer_id: "ctm_01h8x9y7z6w5v4u3t2s1r0q9p8",
    });
  });

  test("phone-shaped numbers go under every key but a time or a position", () => {
    expect(
      scrubValue({
        amount: 9171234567,
        user_id: 9171234567,
        total: 2125550123,
        duration_ms: 9171234567,
        contact: 2125550123,
        landline: 1712345678901,
      }),
    ).toEqual({
      amount: "[redacted]",
      user_id: "[redacted]",
      total: "[redacted]",
      duration_ms: "[redacted]",
      contact: "[redacted]",
      landline: "[redacted]",
    });
    // In JSON text the phone rule sees a Philippine mobile first; any other phone-shaped number goes by key.
    expect(scrubString('{"amount":9171234567,"page":2}')).toBe('{"amount":"[phone]","page":2}');
    expect(scrubString('{"amount":2125550123,"page":2}')).toBe('{"amount":"[redacted]","page":2}');
    const kept = {
      amount: 50,
      count: 123_456,
      duration_ms: 1500,
      colno: 1_234_567,
      lineno: 12_345_678,
      timestamp: 1_712_345_678,
      created_at: 1_712_345_678_901,
      created_at_ms: 1_791_311_596_541,
      expires: 1_712_345_678,
      start_timestamp: 1_712_345_678.123,
    };
    expect(scrubValue(kept)).toEqual(kept);
  });
});

describe("R5-M7: Key (…) with any nesting", () => {
  test("three and more levels, values with parentheses, cut values", () => {
    const cases: Array<[string, string]> = [
      [
        "Key (lower(TRIM(BOTH FROM (username)::text)))=(jane.doe88) already exists.",
        "Key (lower(TRIM(BOTH FROM (username)::text)))=([redacted]) already exists.",
      ],
      [
        "Key (lower((((username)))))=(jane (doe)) already exists.",
        "Key (lower((((username)))))=([redacted]) already exists.",
      ],
      [
        'Key (author_username)=(jane.doe88) is not present in table "profiles".',
        'Key (author_username)=([redacted]) is not present in table "profiles".',
      ],
      [
        "Key (lower(TRIM(BOTH FROM (username)::text)))=(jane.doe88",
        "Key (lower(TRIM(BOTH FROM (username)::text)))=([redacted])",
      ],
      [
        "Key (a)=(jane) already exists. Key (lower((b)::text))=(doe) already exists.",
        "Key (a)=([redacted]) already exists. Key (lower((b)::text))=([redacted]) already exists.",
      ],
      [
        "Key (username)=([redacted]) already exists.",
        "Key (username)=([redacted]) already exists.",
      ],
    ];
    for (const [input, output] of cases) expect(scrubString(input)).toBe(output);
  });
});

describe("R5-M8: request data, breadcrumb data and headers go through the allowlist", () => {
  test("request headers are kept only from the header allowlist; string data goes", () => {
    const event = scrubEvent({
      request: {
        url: "https://x/m",
        headers: {
          "x-member-name": "Jane Doe",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0",
          referer: "https://admin.mila.app/members/jane-doe",
          cookie: "a=b",
          authorization: "Bearer abc",
          "x-forwarded-for": "1.2.3.4",
        },
        data: "Jane Doe",
      },
    });
    expect(event).toEqual({
      request: {
        url: "https://x/m",
        headers: {
          "x-member-name": "[redacted]",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0",
          referer: "https://admin.mila.app/members/:id",
          cookie: "[Filtered]",
          authorization: "[Filtered]",
        },
        data: "[redacted]",
      },
    });
  });

  test("a Headers object in extra uses the same allowlist", () => {
    expect(
      scrubValue({
        h: new Headers({ "x-member-name": "Jane Doe", cookie: "a=b", "user-agent": "UA" }),
      }),
    ).toEqual({ h: { cookie: "[Filtered]", "user-agent": "UA", "x-member-name": "[redacted]" } });
  });

  test("breadcrumb data that is (or resolves to) a string goes; a fetch crumb's data stays", () => {
    expect(scrubBreadcrumb({ category: "custom", data: "Jane Doe" })).toEqual({
      category: "custom",
      data: "[redacted]",
    });
    expect(scrubBreadcrumb({ category: "custom", data: { toJSON: () => "Jane Doe" } })).toEqual({
      category: "custom",
      data: "[redacted]",
    });
    const fetchCrumb = {
      category: "fetch",
      type: "http",
      data: {
        method: "GET",
        url: "https://x/rest/v1/profiles?select=id&limit=10",
        status_code: 200,
      },
    };
    expect(scrubBreadcrumb(fetchCrumb)).toEqual(fetchCrumb);
  });
});

describe("R5-M9: JSON that does not parse, with a non-ASCII or long key", () => {
  test("the value goes", () => {
    expect(scrubString('{"名前":"Jane Doe","x":')).not.toMatch(PII);
    expect(scrubString(`{"${"a".repeat(65)}":"Jane Doe","x":`)).not.toMatch(PII);
    expect(scrubString('{"code":"PGRST116","message":"JSON object requested","x":')).toBe(
      '{"code":"PGRST116","message":"JSON object requested","x":',
    );
  });
});

describe("debugging: development stack frames keep their paths", () => {
  const files = [
    "http://localhost:3000/src/components/admin/MemberCreditDialog.tsx",
    "http://localhost:3000/src/routes/_authed/members.tsx?tsr-split=component",
    "https://admin.mila.app/assets/index-BkX3a9Lm.js",
    "https://admin.mila.app/assets/BkX3a9Lm2pQr7sTuVwXyZ123.js",
    "file:///var/task/.output/server/chunks/build/MemberCreditDialog2-BkX3a9.mjs",
    "/var/task/node_modules/@supabase/postgrest-js/dist/cjs/PostgrestBuilder.js",
    "webpack-internal:///./src/lib/member-billing/grantCredits2.ts",
  ];

  test("in structured frames and in stack text", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "x",
            stacktrace: {
              frames: files.map((file) => ({
                filename: file,
                abs_path: file,
                function: "fn",
                lineno: 1,
                colno: 2,
              })),
            },
          },
        ],
      },
    }) as { exception: { values: Array<{ stacktrace: { frames: Array<{ filename: string }> } }> } };
    expect(event.exception.values[0].stacktrace.frames.map((frame) => frame.filename)).toEqual(
      files,
    );
    for (const file of files) {
      expect(scrubString(`    at fn (${file}:1:2)`)).toBe(`    at fn (${file}:1:2)`);
    }
  });

  test("base64 outside a source path is still redacted", () => {
    expect(scrubString("row=W3siZnVsbF9uYW1lIjoiSmFuZSBEb2UifV0=")).toBe("row=[base64]");
    expect(scrubString("request V1StGXR8Z5jdHi6BmyTVxYz2 failed")).toBe("request [base64] failed");
    expect(
      scrubString("https://lh3.googleusercontent.com/a/ACg8ocJxKq3vB7mN2pLw9QeRt5YzX1"),
    ).not.toContain("ACg8ocJxKq3vB7mN2pLw9QeRt5YzX1");
  });
});

describe("the mailer logs the provider's error, never the address", () => {
  const originalError = console.error;
  afterEach(() => {
    console.error = originalError;
  });

  const logged = async (fetchImpl: typeof fetch) => {
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => calls.push(args);
    const mailer = createMailer({ apiKey: "re_test", fetchImpl });
    await mailer.send({ to: "jane.doe88@gmail.com", subject: "s", html: "<p>x</p>", text: "x" });
    expect(calls).toHaveLength(1);
    return calls[0];
  };

  test("a rejected send and a thrown send", async () => {
    const rejected = await logged(
      (async () =>
        new Response(JSON.stringify({ message: "The `to` field is invalid" }), {
          status: 422,
        })) as unknown as typeof fetch,
    );
    const thrown = await logged((async () => {
      throw new Error("fetch failed: ECONNRESET");
    }) as unknown as typeof fetch);
    for (const [args, detail] of [
      [rejected, "The `to` field is invalid"],
      [thrown, "fetch failed: ECONNRESET"],
    ] as const) {
      const attribute = json(scrubValue({ "sentry.message.parameter.0": args[1] }));
      const body = scrubString(
        args.map((arg) => (typeof arg === "string" ? arg : inspect(arg))).join(" "),
      );
      for (const sent of [attribute, body]) {
        expect(sent).toContain(detail);
        expect(sent).not.toMatch(PII);
      }
    }
  });
});

describe("linear on hostile input (round 6 shapes)", () => {
  const fill = (unit: string, size: number) =>
    unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
  const shapes: Array<(size: number) => string> = [
    (size) => `?a=(${fill("&a=(", size)}`,
    (size) => `x ?a=(${fill(" &a=(", size)}`,
    (size) => fill("Key (", size),
    (size) => fill("Key (a)=(", size),
    (size) => `Key (${fill("(", size)}`,
    (size) => fill("full_name:", size),
    (size) => fill("a.b.c.d.e.f:x ", size),
    (size) => fill("FULL_NAME: x, ", size),
    (size) => fill('"名前":"x",', size),
    (size) => fill("at fn (http://localhost:3000/src/a/B.tsx:1:2)\n", size),
    (size) => fill('title="x" ', size),
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

  test("an unclosed parenthesis per pair costs no more than plain pairs", () => {
    // Before: every `(` looked 2000 characters ahead, 3–4 times the cost of plain pairs.
    const unclosed = `?a=(${fill("&a=(", 65_000)}`;
    const plain = fill("?a=b&", 65_000);
    scrubString(unclosed);
    scrubString(plain);
    const unclosedTime = bestOf(5, () => scrubString(unclosed));
    const plainTime = bestOf(5, () => scrubString(plain));
    expect(unclosedTime).toBeLessThan(2 * Math.max(plainTime, 1));
  });
});
