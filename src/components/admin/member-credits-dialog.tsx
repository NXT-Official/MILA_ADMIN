import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUserRow } from "@/lib/admin.functions";
import { adminMemberBillingQueryOptions } from "@/lib/queries/admin";

function memberLabel(member: AdminUserRow): string {
  return member.full_name || member.username || member.email || "This member";
}

const DEFAULT_GRANT = "10";

/**
 * Manual styling credits. The grant posts through the member app's own
 * `grant_ai_credits` ledger, so a hand-added credit is indistinguishable from
 * a purchased one — it survives the daily reset the same way.
 */
export function MemberCreditsDialog({
  member,
  pending,
  onOpenChange,
  onSubmit,
}: {
  member: AdminUserRow | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (grant: { amount: number; note: string }) => void;
}) {
  const { data } = useQuery(adminMemberBillingQueryOptions(member?.id));
  const [amount, setAmount] = useState(DEFAULT_GRANT);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!member) return;
    setAmount(DEFAULT_GRANT);
    setNote("");
  }, [member]);

  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000;
  // A failed balance read comes back as null: say so rather than showing a stale or zero figure.
  const credits = data?.credits ?? null;
  const balance = credits?.total ?? member?.ai_credits ?? null;
  const balanceUnavailable = (!!data && data.credits === null) || balance === null;

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add styling credits — {member ? memberLabel(member) : ""}</DialogTitle>
          <DialogDescription>
            Grants credits on top of the member's balance, on the same ledger the styling pipeline
            spends from.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-stone">
            {balanceUnavailable ? (
              <>Balance unavailable right now. You can still add credits.</>
            ) : (
              <>
                Current balance: <span className="text-ink">{balance}</span> credits
                {credits && (
                  <>
                    {" "}
                    ({credits.aiCredits} left today + {credits.purchasedCredits} purchased)
                  </>
                )}
              </>
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="grant-amount" className="text-xs uppercase tracking-label text-stone">
              Credits to add
            </Label>
            <Input
              id="grant-amount"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            {!valid && (
              <p className="text-xs text-destructive">Enter a whole number from 1 to 100,000.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-note" className="text-xs uppercase tracking-label text-stone">
              Note (staff audit log)
            </Label>
            <Input
              id="grant-note"
              value={note}
              maxLength={200}
              placeholder="Why these credits were added"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => valid && onSubmit({ amount: parsed, note: note.trim() })}
            disabled={pending || !valid}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Add credits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
