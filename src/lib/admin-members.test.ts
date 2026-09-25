import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the delete action unlinks the audit foreign key before deleting the account", () => {
  // staff_audit_log.target_user_id has no ON DELETE rule: any row written by
  // the role/suspend RPCs blocks the delete. Unlinking (nulling the FK while
  // target_id keeps the id as text) must therefore happen first — this exact
  // ordering was verified against the live project.
  const fn = source("./admin.functions.ts");
  const unlink = fn.indexOf(".update({ target_user_id: null })");
  const deleteUser = fn.indexOf("auth.admin.deleteUser(data.user_id)");
  expect(unlink).toBeGreaterThan(-1);
  expect(deleteUser).toBeGreaterThan(unlink);
  expect(fn).toContain('"member.deleted"');
});

test("account deletion carries the same staff guards as the role RPCs", () => {
  const fn = source("./admin.functions.ts");
  expect(fn).toContain("You cannot delete your own account.");
  expect(fn).toContain("Mila must always have at least one active Steward.");
  expect(fn).toContain("staff action history");
  // Self-deletion and the last-steward guard must be decided before any write.
  expect(fn.indexOf("You cannot delete your own account.")).toBeLessThan(
    fn.indexOf(".update({ target_user_id: null })"),
  );
});

test("the members table offers edit, suspend and delete, and disables delete for staff actors", () => {
  const columns = source("../components/admin/members-columns.tsx");
  expect(columns).toContain('label="Edit"');
  expect(columns).toContain("Reinstate");
  expect(columns).toContain('label="Delete"');
  expect(columns).toContain("has_staff_activity");
  // Nobody deletes their own account from this table.
  expect(columns).toContain("row.original.id !== currentUserId");
});

test("the delete confirmation is a dialog, not a window.confirm", () => {
  const dialog = source("../components/admin/member-delete-dialog.tsx");
  expect(dialog).toContain("Delete Account");
  expect(dialog).toContain("cannot be");
  const page = source("../routes/_authed/members.tsx");
  expect(page).toContain("<MemberDeleteDialog");
  expect(page).toContain("adminDeleteMember");
  expect(page).not.toContain("window.confirm");
});

test("the members list flags accounts that have acted as staff", () => {
  const fn = source("./admin.functions.ts");
  expect(fn).toContain("has_staff_activity");
  expect(fn).toContain('from("staff_audit_log").select("actor_user_id")');
});
