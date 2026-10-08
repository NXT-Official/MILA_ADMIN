import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ColumnDef } from "@tanstack/react-table";
import type { AdminUserRow } from "@/lib/admin.functions";
import { getMembersColumns } from "./members-columns";

const base: AdminUserRow = {
  id: "u1",
  email: "a@example.com",
  full_name: "Ada",
  username: "ada",
  created_at: "2026-10-01T00:00:00Z",
  is_admin: false,
  is_moderator: false,
  suspended: false,
  ai_credits: 17,
  daily_credits: 12,
  purchased_credits: 5,
  has_staff_activity: false,
};

function creditsCell(row: AdminUserRow): string {
  const columns = getMembersColumns({
    pendingRoleChange: false,
    onToggleRole: () => {},
    onToggleSuspended: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onManageBilling: () => {},
    onGrantCredits: () => {},
  });
  const column = columns.find(
    (item): item is ColumnDef<AdminUserRow> & { accessorKey: string } =>
      "accessorKey" in item && item.accessorKey === "ai_credits",
  );
  const cell = column?.cell;
  if (typeof cell !== "function") throw new Error("Credits cell missing");
  return renderToStaticMarkup(cell({ row: { original: row } } as never) as never);
}

describe("the Credits column", () => {
  test("shows what is left today and what was purchased", () => {
    const html = creditsCell(base);
    expect(html).toContain("12 left today");
    expect(html).toContain("5 purchased");
  });

  test("says unavailable, never 0, when the reads failed", () => {
    const html = creditsCell({
      ...base,
      ai_credits: null,
      daily_credits: null,
      purchased_credits: null,
    });
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("left today");
    expect(html).not.toContain(">0<");
  });
});
