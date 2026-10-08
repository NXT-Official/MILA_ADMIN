import type { ColumnDef } from "@tanstack/react-table";
import { UserX, UserCheck, Pencil, Trash2, CreditCard, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ActionItem, RowActionsMenu, ToggleCell } from "@/components/admin/table-cells";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { AdminUserRow } from "@/lib/admin.functions";
import { describeMemberCredits } from "@/lib/credit-display";

interface MembersColumnsOptions {
  currentUserId?: string;
  pendingRoleChange: boolean;
  onToggleRole: (member: AdminUserRow, role: "admin" | "moderator", grant: boolean) => void;
  onToggleSuspended: (id: string, suspended: boolean) => void;
  onEdit: (member: AdminUserRow) => void;
  onDelete: (member: AdminUserRow) => void;
  /** Refund + cancel/downgrade/switch, through Paddle. */
  onManageBilling: (member: AdminUserRow) => void;
  /** Manual styling-credit grant on the member app's credit ledger. */
  onGrantCredits: (member: AdminUserRow) => void;
}

export function getMembersColumns({
  currentUserId,
  pendingRoleChange,
  onToggleRole,
  onToggleSuspended,
  onEdit,
  onDelete,
  onManageBilling,
  onGrantCredits,
}: MembersColumnsOptions): ColumnDef<AdminUserRow>[] {
  return [
    {
      accessorKey: "full_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-serif text-sm text-ink truncate">
            {row.original.full_name || row.original.username || "Unnamed"}
          </div>
          <div className="text-micro uppercase tracking-label text-stone mt-0.5">
            {row.original.username ? `@${row.original.username}` : "—"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <div className="text-xs text-stone truncate">{row.original.email}</div>,
    },
    {
      accessorKey: "ai_credits",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Credits" className="justify-center w-full" />
      ),
      cell: ({ row }) => {
        // What she can spend: today's daily allowance left, plus credits she bought.
        if (row.original.daily_credits === null || row.original.purchased_credits === null) {
          // The balance could not be read: say so rather than showing a zero.
          return (
            <div className="text-center text-xs text-stone" title="Credits unavailable">
              Unavailable
            </div>
          );
        }
        const credits = describeMemberCredits({
          daily: row.original.daily_credits,
          purchased: row.original.purchased_credits,
        });
        return (
          <div className="text-center" title={credits.summary}>
            <div className="text-sm text-ink">{credits.dailyLabel}</div>
            <div className="mt-0.5 text-xs text-stone">{credits.purchasedLabel}</div>
            <span className="sr-only">{credits.summary}</span>
          </div>
        );
      },
    },
    {
      id: "steward",
      header: () => <div className="text-center">Steward</div>,
      cell: ({ row }) => (
        <ToggleCell
          checked={row.original.is_admin}
          disabled={
            pendingRoleChange || (row.original.id === currentUserId && row.original.is_admin)
          }
          label={`Steward role for ${memberLabel(row.original)}`}
          onCheckedChange={(v) => onToggleRole(row.original, "admin", v)}
        />
      ),
    },
    {
      id: "moderator",
      header: () => <div className="text-center">Moderator</div>,
      cell: ({ row }) => (
        <ToggleCell
          checked={row.original.is_moderator}
          disabled={pendingRoleChange}
          label={`Moderator role for ${memberLabel(row.original)}`}
          onCheckedChange={(v) => onToggleRole(row.original, "moderator", v)}
        />
      ),
    },
    {
      id: "status",
      header: () => <div className="text-right">Status</div>,
      cell: ({ row }) =>
        row.original.suspended ? (
          <div className="flex justify-end">
            <Badge className="border-destructive/50 text-destructive text-nano uppercase tracking-label">
              Suspended
            </Badge>
          </div>
        ) : null,
    },
    {
      id: "actions",
      header: () => <div className="text-right sr-only">Actions</div>,
      cell: ({ row }) => (
        <RowActionsMenu label="Open actions">
          <ActionItem icon={Pencil} label="Edit" onClick={() => onEdit(row.original)} />
          <ActionItem
            icon={CreditCard}
            label="Plan & billing"
            onClick={() => onManageBilling(row.original)}
          />
          <ActionItem
            icon={Coins}
            label="Add styling credits"
            onClick={() => onGrantCredits(row.original)}
          />
          <ActionItem
            icon={row.original.suspended ? UserCheck : UserX}
            label={row.original.suspended ? "Reinstate" : "Suspend"}
            disabled={row.original.id === currentUserId && !row.original.suspended}
            description={
              row.original.id === currentUserId && !row.original.suspended
                ? "You can't suspend your own account."
                : undefined
            }
            // Suspending is confirmed by the page's styled dialog; reinstating is one click.
            onClick={() => onToggleSuspended(row.original.id, !row.original.suspended)}
          />
          {row.original.id !== currentUserId && (
            <ActionItem
              icon={Trash2}
              label="Delete"
              destructive
              disabled={row.original.has_staff_activity}
              description={
                row.original.has_staff_activity
                  ? "Blocked: this account has staff action history. Revoke its roles and suspend it instead."
                  : undefined
              }
              onClick={() => onDelete(row.original)}
            />
          )}
        </RowActionsMenu>
      ),
    },
  ];
}

function memberLabel(member: AdminUserRow): string {
  return member.full_name || member.username || "member";
}
