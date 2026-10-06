import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  announcementBodySchema,
  announcementInputSchema,
  announcementSubjectSchema,
  createMemberInputSchema,
  fieldMessages,
  firstIssueMessage,
  parseInput,
  updateMemberInputSchema,
} from "./staff-input";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const USER_ID = "11111111-1111-4111-8111-111111111111";

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("parseInput", () => {
  test("hands back the parsed, trimmed data when the input is fine", () => {
    const data = parseInput(createMemberInputSchema, {
      email: "nadia@example.com",
      password: "correct-horse",
      full_name: "  Nadia Haddad ",
      username: " nadia_h ",
    });
    expect(data).toEqual({
      email: "nadia@example.com",
      password: "correct-horse",
      full_name: "Nadia Haddad",
      username: "nadia_h",
    });
  });

  test("throws one plain sentence, never the JSON zod would print", () => {
    const message = messageOf(() =>
      parseInput(createMemberInputSchema, { email: "nadia", password: "short" }),
    );
    expect(message).toBe("Enter a valid email address.");
    expect(message).not.toContain("{");
    expect(message).not.toContain('"code"');
  });

  test("a field that is missing entirely is still a sentence, not a stack", () => {
    const message = messageOf(() => parseInput(createMemberInputSchema, {}));
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain("{");
    expect(message).not.toContain("[");
  });
});

describe("firstIssueMessage", () => {
  test("is the first issue's own message", () => {
    const result = createMemberInputSchema.safeParse({ email: "nadia@example.com", password: "x" });
    if (result.success) throw new Error("expected the password to be refused");
    expect(firstIssueMessage(result.error)).toBe("Use at least 8 characters for the password.");
  });
});

describe("fieldMessages", () => {
  test("keeps the first message per field so a form can show each under its input", () => {
    const result = createMemberInputSchema.safeParse({
      email: "nadia",
      password: "x",
      username: "a b",
    });
    if (result.success) throw new Error("expected refusals");
    expect(fieldMessages(result.error)).toEqual({
      email: "Enter a valid email address.",
      password: "Use at least 8 characters for the password.",
      username: "Usernames can only use letters, numbers, - and _.",
    });
  });
});

describe("member rules", () => {
  const base = { email: "nadia@example.com", password: "correct-horse" };
  const refusal = (extra: Record<string, unknown>) =>
    messageOf(() => parseInput(createMemberInputSchema, { ...base, ...extra }));

  test("usernames get a plain message for each way they can be wrong", () => {
    expect(refusal({ username: "ab" })).toBe("Usernames need at least 3 characters.");
    expect(refusal({ username: "a".repeat(31) })).toBe("Keep the username under 30 characters.");
    expect(refusal({ username: "nadia haddad" })).toBe(
      "Usernames can only use letters, numbers, - and _.",
    );
  });

  test("a long name is refused in words", () => {
    expect(refusal({ full_name: "n".repeat(101) })).toBe("Keep the name under 100 characters.");
  });

  test("name and username stay optional when adding a member", () => {
    expect(() => parseInput(createMemberInputSchema, base)).not.toThrow();
  });

  test("editing accepts a cleared username and trims a typed one", () => {
    expect(parseInput(updateMemberInputSchema, { user_id: USER_ID, username: "" }).username).toBe(
      "",
    );
    expect(
      parseInput(updateMemberInputSchema, { user_id: USER_ID, username: " nadia " }).username,
    ).toBe("nadia");
    expect(parseInput(updateMemberInputSchema, { user_id: USER_ID }).username).toBeUndefined();
  });

  test("editing explains a bad username instead of saying 'Invalid input'", () => {
    const refuse = (username: string) =>
      messageOf(() => parseInput(updateMemberInputSchema, { user_id: USER_ID, username }));
    expect(refuse("ab")).toBe("Usernames need at least 3 characters.");
    expect(refuse("nadia haddad")).toBe("Usernames can only use letters, numbers, - and _.");
  });
});

describe("announcement rules", () => {
  const ok = { subject: "What's new", body: "Faster looks this week.", confirm: true };
  const refusal = (extra: Record<string, unknown>) =>
    messageOf(() => parseInput(announcementInputSchema, { ...ok, ...extra }));

  test("a complete update passes and is trimmed", () => {
    expect(parseInput(announcementInputSchema, { ...ok, subject: "  What's new  " }).subject).toBe(
      "What's new",
    );
  });

  test("a message under ten characters is refused in words, the way the form shows it", () => {
    const expected = "Write at least 10 characters about what changed.";
    expect(refusal({ body: "Hi all" })).toBe(expected);
    expect(announcementBodySchema.safeParse("Hi all").success).toBe(false);
    expect(announcementBodySchema.safeParse("Hi all, new looks.").success).toBe(true);
  });

  test("a short subject and an unconfirmed send each say what is missing", () => {
    expect(refusal({ subject: "Hi" })).toBe("Give the update a subject of at least 3 characters.");
    expect(announcementSubjectSchema.safeParse("Hi").success).toBe(false);
    expect(refusal({ confirm: false })).toBe("Confirm that this emails every member.");
  });
});

describe("wiring", () => {
  test("the server functions refuse with sentences, not raw zod errors", () => {
    const members = source("./admin.functions.ts");
    expect(members).toContain("parseInput(createMemberInputSchema, input)");
    expect(members).toContain("parseInput(updateMemberInputSchema, input)");
    expect(members).not.toContain("CreateMemberInput.parse(input)");
    expect(members).not.toContain("UpdateMemberInput.parse(input)");
    // Hiding a post takes a free-text reason capped at 280 characters.
    expect(members).toContain("parseInput(HidePostInput, input)");
    expect(members).not.toContain("HidePostInput.parse(input)");

    const announcements = source("./announcements.functions.ts");
    expect(announcements).toContain("parseInput(announcementInputSchema, input)");
    expect(announcements).not.toContain("z\n      .object");
  });

  test("the member form and the announcement page check in the browser with the same rules", () => {
    const dialog = source("../components/admin/member-form-dialog.tsx");
    expect(dialog).toContain("createMemberInputSchema.safeParse(");
    expect(dialog).toContain("updateMemberInputSchema.safeParse(");

    const page = source("../routes/_authed/announcements.tsx");
    expect(page).toContain("announcementBodySchema.safeParse(");
    expect(page).toContain("announcementSubjectSchema.safeParse(");
  });
});
