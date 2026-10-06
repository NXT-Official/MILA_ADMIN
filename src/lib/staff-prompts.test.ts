import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { askHideReason, confirmSuspend } from "./staff-prompts";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("askHideReason", () => {
  test("Cancel is null, so the caller can stop instead of hiding the post", () => {
    expect(askHideReason(() => null)).toBeNull();
  });

  test("OK with nothing typed is an empty reason, which still hides the post", () => {
    expect(askHideReason(() => "")).toBe("");
  });

  test("OK with a reason hands the reason back untouched", () => {
    expect(askHideReason(() => "Not a Mila look")).toBe("Not a Mila look");
  });

  test("asks in plain words that the reason is optional", () => {
    let asked = "";
    askHideReason((message) => {
      asked = message;
      return null;
    });
    expect(asked).toBe("Reason for hiding (optional):");
  });
});

describe("confirmSuspend", () => {
  test("names the member and says what suspending does", () => {
    let asked = "";
    confirmSuspend("Nadia Haddad", (message) => {
      asked = message;
      return true;
    });
    expect(asked).toContain("Nadia Haddad");
    expect(asked).toContain("sign in");
  });

  test("returns what the steward answered", () => {
    expect(confirmSuspend("Nadia", () => true)).toBe(true);
    expect(confirmSuspend("Nadia", () => false)).toBe(false);
  });
});

test("the moderation page stops when the reason prompt is cancelled", () => {
  const page = source("../routes/_authed/moderation.tsx");
  const prompt = page.indexOf("askHideReason(");
  const stop = page.indexOf("if (hidden && reason === null) return;");
  const write = page.indexOf("await hide(");
  expect(prompt).toBeGreaterThan(-1);
  expect(stop).toBeGreaterThan(prompt);
  expect(write).toBeGreaterThan(stop);
  // The old code turned Cancel into an empty reason and hid the post anyway.
  expect(page).not.toContain('window.prompt("Reason for hiding (optional):") ?? null');
});

test("suspending asks first, and a steward cannot pick their own row", () => {
  const columns = source("../components/admin/members-columns.tsx");
  const confirm = columns.indexOf("confirmSuspend(");
  const toggle = columns.indexOf("onToggleSuspended(row.original.id");
  expect(confirm).toBeGreaterThan(-1);
  expect(toggle).toBeGreaterThan(confirm);
  expect(columns).toContain("You can't suspend your own account.");
});
