import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminUserRow } from "@/lib/admin.functions";
import { billingDialogMode } from "@/lib/billing-dialog-mode";
import {
  PLAN_ACTIONS,
  PLAN_ACTION_LABELS,
  hasRefundablePrice,
  type PlanAction,
} from "@/lib/member-billing";
import { adminMemberBillingQueryOptions } from "@/lib/queries/admin";
import {
  BILLING_INTERVAL_SUFFIX,
  formatPlanPrice,
  type BillingInterval,
} from "@/lib/subscription-plans";

function memberLabel(member: AdminUserRow): string {
  return member.full_name || member.username || member.email || "This member";
}

export type BillingDialogSubmission =
  | {
      kind: "paddle";
      plan_action: PlanAction;
      target_plan_id?: string;
      refund: boolean;
      reason: string;
    }
  | { kind: "grant"; plan_id: string; note: string }
  | { kind: "end"; note: string };

function planOptionLabel(plan: {
  title: string;
  priceAmount: number;
  currency: string;
  billingInterval: string;
  creditsIncluded: number;
  paddlePriceId: string | null;
}): string {
  const price = `${plan.title} — ${formatPlanPrice(plan.priceAmount, plan.currency)}${
    BILLING_INTERVAL_SUFFIX[plan.billingInterval as BillingInterval] ?? ""
  }`;
  const credits = `${plan.creditsIncluded} credit${plan.creditsIncluded === 1 ? "" : "s"}/day`;
  return `${price} · ${credits}${hasRefundablePrice(plan.paddlePriceId) ? "" : " (no Paddle price)"}`;
}

/**
 * One member's plan, in the three states it can be in:
 *
 * - no live subscription — grant one by hand (no Paddle billing involved),
 * - a plan staff granted earlier — change or end it, locally,
 * - a Paddle subscription — refund a payment and cancel or switch the plan,
 *   with Paddle as the system of record.
 *
 * The dialog only collects intent; members.tsx owns the server call, the toast
 * and refreshing the list.
 */
export function MemberBillingDialog({
  member,
  pending,
  onOpenChange,
  onSubmit,
}: {
  member: AdminUserRow | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (submission: BillingDialogSubmission) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery(
    adminMemberBillingQueryOptions(member?.id),
  );
  const [action, setAction] = useState<PlanAction>("cancel");
  const [targetPlanId, setTargetPlanId] = useState<string>("");
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState("Requested by staff from the admin console.");
  const [grantPlanId, setGrantPlanId] = useState<string>("");
  const [note, setNote] = useState("");

  // A fresh member (or a fresh open) must not inherit the previous choices.
  useEffect(() => {
    if (!member) return;
    setAction("cancel");
    setTargetPlanId("");
    setRefund(false);
    setReason("Requested by staff from the admin console.");
    setGrantPlanId("");
    setNote("");
  }, [member]);

  const subscription = data?.subscription ?? null;
  const manualPlan = data?.manualPlan ?? false;
  const plans = data?.plans ?? [];
  const switchablePlans = plans.filter((plan) => !plan.isCurrent);
  const latestTransaction = data?.latestTransaction ?? null;
  const refundBlocked = !data?.paddleConfigured || !latestTransaction || latestTransaction.refunded;
  const targetPlan = switchablePlans.find((plan) => plan.id === targetPlanId) ?? null;
  const grantPlan = plans.find((plan) => plan.id === grantPlanId) ?? null;

  // The shared in-force rule decides "granted": the manual flag alone would call
  // a canceled staff grant "Granted by staff" and offer to end it.
  const mode = billingDialogMode({ subscription, manualPlan });

  const canSubmit =
    !pending &&
    (mode === "grant"
      ? !!grantPlan
      : mode === "granted"
        ? !!grantPlan
        : !!subscription &&
          (action === "cancel" || (!!targetPlan && hasRefundablePrice(targetPlan.paddlePriceId))) &&
          (!refund || !refundBlocked));

  function submit() {
    if (!canSubmit) return;
    if (mode === "grant") {
      if (!grantPlan) return;
      onSubmit({ kind: "grant", plan_id: grantPlan.id, note: note.trim() });
      return;
    }
    if (mode === "granted") {
      if (!grantPlan) return;
      onSubmit({ kind: "grant", plan_id: grantPlan.id, note: note.trim() });
      return;
    }
    onSubmit({
      kind: "paddle",
      plan_action: action,
      ...(action === "change" && targetPlan ? { target_plan_id: targetPlan.id } : {}),
      refund,
      reason: reason.trim() || "Requested by staff from the admin console.",
    });
  }

  function submitEnd() {
    if (pending) return;
    onSubmit({ kind: "end", note: note.trim() });
  }

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan &amp; billing — {member ? memberLabel(member) : ""}</DialogTitle>
          <DialogDescription>
            {mode === "paddle"
              ? "Refund a payment and cancel, downgrade or switch this member's plan. Paddle is the system of record; this console mirrors the result here immediately."
              : mode === "granted"
                ? "This plan was granted by staff, so there is no Paddle billing behind it. Change it to another plan or end it — both stay in this console."
                : "Grant a plan by hand: the member gets the plan's daily styling credits and community verification without any Paddle billing."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center text-stone">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : isError || !data ? (
          <div className="space-y-3 text-sm text-stone">
            <p>Couldn't load this member's billing details.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {data.credits === null && (
              <p role="status" className="text-xs text-stone">
                Credit balance unavailable right now. The plan controls below still work.
              </p>
            )}
            {mode === "paddle" && subscription && (
              <>
                <div className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 px-4 py-3 text-xs">
                  <div className="font-serif text-sm text-ink">{subscription.planTitle}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-stone">
                    <Badge className="border-porcelain/60 text-nano uppercase tracking-label">
                      {subscription.status}
                    </Badge>
                    {subscription.cancelAtPeriodEnd && (
                      <span>Already set to cancel at the period end.</span>
                    )}
                    {subscription.currentPeriodEnd && (
                      <span>
                        Current period ends{" "}
                        {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="billing-action"
                    className="text-xs uppercase tracking-label text-stone"
                  >
                    What to do
                  </Label>
                  <Select value={action} onValueChange={(next) => setAction(next as PlanAction)}>
                    <SelectTrigger id="billing-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_ACTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {PLAN_ACTION_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {action === "change" && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="billing-plan"
                      className="text-xs uppercase tracking-label text-stone"
                    >
                      New plan
                    </Label>
                    <Select value={targetPlanId} onValueChange={setTargetPlanId}>
                      <SelectTrigger id="billing-plan">
                        <SelectValue placeholder="Choose a plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {switchablePlans.map((plan) => (
                          <SelectItem
                            key={plan.id}
                            value={plan.id}
                            disabled={!hasRefundablePrice(plan.paddlePriceId)}
                          >
                            {planOptionLabel(plan)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-stone">
                      Paddle proration is <span className="text-ink">do not bill</span> — the member
                      is neither charged for an upgrade nor credited for unused time. Billing
                      changes stay in the member app's own checkout.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 text-xs text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-line"
                      checked={refund}
                      disabled={refundBlocked}
                      onChange={(event) => setRefund(event.target.checked)}
                    />
                    <span>
                      Refund the latest payment in full via Paddle
                      {latestTransaction?.amountCents != null && (
                        <>
                          {" "}
                          (
                          {formatPlanPrice(
                            latestTransaction.amountCents,
                            latestTransaction.currency,
                          )}
                          )
                        </>
                      )}
                    </span>
                  </label>
                  {latestTransaction?.refunded ? (
                    <p className="text-xs text-stone">{data.refundNotice}</p>
                  ) : !data.paddleConfigured ? (
                    <p className="text-xs text-stone">
                      Paddle keys aren't set on this deployment, so refunds are unavailable.
                    </p>
                  ) : !latestTransaction ? (
                    <p className="text-xs text-stone">
                      No completed payment found on this subscription to refund.
                    </p>
                  ) : (
                    <p className="text-xs text-stone">
                      {refund
                        ? "Cancelation will be immediate — the member keeps nothing they didn't pay for."
                        : "Without a refund, the plan ends or changes at the period boundary."}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="billing-reason"
                    className="text-xs uppercase tracking-label text-stone"
                  >
                    Reason (recorded in the staff audit log, sent to Paddle)
                  </Label>
                  <Input
                    id="billing-reason"
                    value={reason}
                    maxLength={200}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
              </>
            )}

            {mode === "granted" && subscription && (
              <div className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 px-4 py-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-serif text-sm text-ink">{subscription.planTitle}</span>
                  <Badge className="border-porcelain/60 text-nano uppercase tracking-label">
                    Granted by staff
                  </Badge>
                </div>
                <p className="mt-1 text-stone">
                  No Paddle billing: the plan has no renewal or end date, and the member app shows
                  it as their current tier.
                </p>
              </div>
            )}

            {mode !== "paddle" && (
              <>
                <div className="space-y-2">
                  <Label
                    htmlFor="grant-plan"
                    className="text-xs uppercase tracking-label text-stone"
                  >
                    {mode === "granted" ? "Change to" : "Plan"}
                  </Label>
                  <Select value={grantPlanId} onValueChange={setGrantPlanId}>
                    <SelectTrigger id="grant-plan">
                      <SelectValue placeholder="Choose a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {(mode === "granted" ? switchablePlans : plans).map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {planOptionLabel(plan)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {grantPlan && (
                    <p className="text-xs text-stone">
                      Grants {grantPlan.creditsIncluded} styling credit
                      {grantPlan.creditsIncluded === 1 ? "" : "s"} a day, the plan's allowance for
                      the member's next request. Purchased credits are untouched.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="grant-note"
                    className="text-xs uppercase tracking-label text-stone"
                  >
                    Note (recorded in the staff audit log)
                  </Label>
                  <Input
                    id="grant-note"
                    value={note}
                    maxLength={200}
                    placeholder="Why this member is getting the plan"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          {!isLoading && data && mode === "granted" && (
            <Button variant="destructive" onClick={submitEnd} disabled={pending}>
              End plan
            </Button>
          )}
          {!isLoading && data && (
            <Button
              variant={mode === "paddle" && refund ? "destructive" : "primary"}
              onClick={submit}
              disabled={!canSubmit}
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {mode === "grant"
                ? "Grant plan"
                : mode === "granted"
                  ? "Update plan"
                  : refund
                    ? "Refund & apply"
                    : "Apply change"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
