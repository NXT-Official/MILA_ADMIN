import { isSubscriptionLive } from "@/lib/credit-balance";

/**
 * Which of the dialog's three states a member's plan is in:
 *
 * - `grant`: nothing in force, so staff can grant a plan.
 * - `granted`: a plan staff granted, still in force.
 * - `paddle`: a live Paddle subscription.
 *
 * "In force" is the credit balance's own rule (`isSubscriptionLive`: an in-force
 * status, and a cancelled plan only until its paid period ends). Reading
 * `manualPlan` alone would call a canceled granted row "Granted by staff", and
 * would keep offering Paddle actions on a plan whose paid period is over.
 */
export type BillingDialogMode = "grant" | "granted" | "paddle";

export function billingDialogMode(
  input: {
    subscription: {
      status: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: string | null;
    } | null;
    manualPlan: boolean;
  },
  now: Date = new Date(),
): BillingDialogMode {
  const { subscription, manualPlan } = input;
  if (!subscription) return "grant";
  const live = isSubscriptionLive(
    {
      status: subscription.status,
      current_period_end: subscription.currentPeriodEnd,
      cancel_at_period_end: subscription.cancelAtPeriodEnd,
    },
    now,
  );
  if (!live) return "grant";
  return manualPlan ? "granted" : "paddle";
}
