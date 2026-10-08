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
import { suspendConfirmCopy } from "@/lib/staff-prompts";

function memberLabel(member: AdminUserRow): string {
  return member.full_name || member.username || member.email || "this member";
}

/** The question a steward answers before a member is suspended. */
export function MemberSuspendDialog({
  member,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  /** Stays set while the dialog fades out, so the title does not change as it closes. */
  member: AdminUserRow | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const copy = suspendConfirmCopy(member ? memberLabel(member) : "this member");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {copy.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
