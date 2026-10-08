import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolveSuspendRequest } from "./suspend-request";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const ME = { id: "me" };
const OTHER = { id: "other" };
const ROWS = [ME, OTHER];

describe("resolveSuspendRequest", () => {
  test("reinstating needs no question, and no row", () => {
    expect(
      resolveSuspendRequest({ rows: [], id: "gone", suspended: false, currentUserId: "me" }),
    ).toEqual({
      kind: "reinstate",
    });
  });

  test("suspending someone else asks first, with their row", () => {
    expect(
      resolveSuspendRequest({ rows: ROWS, id: "other", suspended: true, currentUserId: "me" }),
    ).toEqual({
      kind: "confirm",
      member: OTHER,
    });
  });

  test("suspending yourself is refused, whatever the list holds", () => {
    expect(
      resolveSuspendRequest({ rows: ROWS, id: "me", suspended: true, currentUserId: "me" }),
    ).toEqual({
      kind: "self",
    });
  });

  test("a row that has left the list is reported, not ignored", () => {
    expect(
      resolveSuspendRequest({ rows: ROWS, id: "gone", suspended: true, currentUserId: "me" }),
    ).toEqual({
      kind: "missing",
    });
  });
});

test("the members page tells staff when the row is gone or is their own", () => {
  const page = source("../routes/_authed/members.tsx");
  expect(page).toContain("resolveSuspendRequest(");
  expect(page).toContain("no longer in the list");
  expect(page).toContain("You can't suspend your own account.");
});

test("the suspend dialog keeps its title while it fades out", () => {
  // Closing cleared the target, so the title fell back to "this member" for a frame.
  const page = source("../routes/_authed/members.tsx");
  expect(page).toContain("suspendOpen");
  expect(page).not.toContain("setSuspendTarget(null)");
  const dialog = source("../components/admin/member-suspend-dialog.tsx");
  expect(dialog).toContain("open={open}");
  expect(dialog).not.toContain("open={!!member}");
});
