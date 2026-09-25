import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminUserRow } from "@/lib/admin.functions";

function memberLabel(member: AdminUserRow): string {
  return member.full_name || member.username || member.email || "This member";
}

export function MemberDeleteDialog({
  member,
  pending,
  onOpenChange,
  onConfirm,
}: {
  member: AdminUserRow | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const label = member ? memberLabel(member) : "";

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {label}'s account</DialogTitle>
          <DialogDescription>
            This permanently deletes{" "}
            {member?.email ? <strong>{member.email}</strong> : "the account"} and everything
            attached to it — profile, credits, posts and looks. This cannot be undone. Suspend
            instead if the account may come back.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Delete Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
