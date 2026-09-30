import { z } from "zod";

/**
 * The admin console's billing actions on a member: refund the latest payment
 * and either cancel the subscription or switch it to another plan.
 *
 * Which local subscription statuses count as "in force" mirrors the member
 * app's `src/constants/subscriptions.ts` — the console acts on exactly the
 * subscriptions the member app would treat as live.
 */
export const CONSOLE_IN_FORCE_STATUSES = ["active", "trialing", "past_due"] as const;

export const PLAN_ACTIONS = ["cancel", "change"] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];

export const PLAN_ACTION_LABELS: Record<PlanAction, string> = {
  cancel: "Cancel subscription",
  change: "Switch to another plan",
};

export const REFUND_REASON_MAX = 200;

export const billingActionInputSchema = z
  .object({
    user_id: z.string().uuid(),
    plan_action: z.enum(PLAN_ACTIONS),
    target_plan_id: z.string().uuid().optional(),
    refund: z.boolean().default(false),
    reason: z
      .string()
      .trim()
      .max(REFUND_REASON_MAX, `Keep the reason under ${REFUND_REASON_MAX} characters.`)
      .default("Requested by staff from the admin console."),
  })
  .refine((value) => value.plan_action !== "change" || !!value.target_plan_id, {
    message: "Choose the plan to switch to.",
    path: ["target_plan_id"],
  });

export type BillingActionInput = z.infer<typeof billingActionInputSchema>;

export const grantCreditsInputSchema = z.object({
  user_id: z.string().uuid(),
  amount: z
    .number({ invalid_type_error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(1, "Add at least one credit.")
    .max(100_000, "Keep a single grant under 100,000 credits."),
  note: z.string().trim().max(200, "Keep the note under 200 characters.").default(""),
});

export type GrantCreditsInput = z.infer<typeof grantCreditsInputSchema>;

export interface PaddleRefundAdjustmentBody {
  action: "refund";
  type: "full";
  transaction_id: string;
  reason: string;
}

/** The refund body Paddle expects for a full refund of one transaction. */
export function buildRefundAdjustmentBody(
  transactionId: string,
  reason: string,
): PaddleRefundAdjustmentBody {
  return { action: "refund", type: "full", transaction_id: transactionId, reason };
}

export interface PaddleCancelBody {
  effective_from: "immediately" | "next_billing_period";
}

/**
 * Paddle cancels immediately or at the period boundary and nothing else. The
 * pairing is deliberate: a refunded payment must not keep serving the period,
 * and an unrefunded cancel must not cut off time the member paid for.
 */
export function buildCancelBody(refunded: boolean): PaddleCancelBody {
  return { effective_from: refunded ? "immediately" : "next_billing_period" };
}

export interface PaddlePlanChangeBody {
  items: { price_id: string; quantity: number }[];
  proration_billing_mode: "do_not_bill";
}

export function buildPlanChangeBody(priceId: string): PaddlePlanChangeBody {
  return {
    items: [{ price_id: priceId, quantity: 1 }],
    proration_billing_mode: "do_not_bill",
  };
}

/** Local mirror statuses Paddle reports once a cancel or a change lands. */
export function mirroredSubscriptionStatus(action: PlanAction, refunded: boolean): string {
  if (action === "cancel") return refunded ? "canceled" : "active";
  return "active";
}

export function describeBillingOutcome(options: {
  action: PlanAction;
  refunded: boolean;
  planTitle?: string | null;
}): string {
  const { action, refunded, planTitle } = options;
  if (action === "cancel") {
    return refunded
      ? "Subscription canceled and the latest payment refunded."
      : "Subscription canceled at the end of the current period.";
  }
  return refunded
    ? `Plan switched to ${planTitle ?? "the chosen plan"} and the latest payment refunded.`
    : `Plan switched to ${planTitle ?? "the chosen plan"}.`;
}

export function planActionLabel(action: PlanAction): string {
  return PLAN_ACTION_LABELS[action];
}

/**
 * A refund adjustment is approved synchronously only for some Paddle setups;
 * the console reports Paddle's own status instead of assuming the money moved.
 */
export function describeRefundAdjustmentStatus(status: string): string {
  switch (status) {
    case "approved":
      return "Refund approved by Paddle — it lands on the member's statement in a few business days.";
    case "pending_approval":
      return "Refund submitted and awaiting Paddle's approval.";
    case "rejected":
      return "Paddle rejected the refund. Nothing was refunded.";
    case "reversed":
      return "A previously approved refund was reversed.";
    default:
      return `Refund status from Paddle: ${status}.`;
  }
}

export function hasRefundablePrice(paddlePriceId: string | null | undefined): boolean {
  return typeof paddlePriceId === "string" && paddlePriceId.trim().length > 0;
}

/**
 * A plan the staff granted by hand, with no Paddle subscription behind it.
 *
 * Paddle is the system of record for anything billed, so a granted plan can't
 * be a Paddle subscription — it is a local row whose synthetic ids carry this
 * prefix. Nothing in Paddle can ever match them, the member app treats the row
 * like any other in-force subscription (same daily credits, same community
 * verification), and the console can tell the two apart to offer the right
 * actions: Paddle actions for billed rows, local edit/end for granted ones.
 */
export const MANUAL_SUBSCRIPTION_PREFIX = "manual:";

/** The customer id stored on a granted row — Paddle has no customer for it. */
export const MANUAL_PADDLE_CUSTOMER_ID = "manual";

export function isManualSubscription(paddleSubscriptionId: string | null | undefined): boolean {
  // Every granted row starts with `manual` — the console's `manual:<uuid>` and
  // rows created by hand in the database (`manual_comp_…`). Paddle's own ids
  // start with `sub_`, so nothing billed can match.
  return typeof paddleSubscriptionId === "string" && paddleSubscriptionId.startsWith("manual");
}

/** Unique synthetic Paddle id for a granted row (`paddle_subscription_id` is UNIQUE). */
export function newManualSubscriptionId(uuid: () => string = () => crypto.randomUUID()): string {
  return `${MANUAL_SUBSCRIPTION_PREFIX}${uuid()}`;
}

export const planGrantInputSchema = z.object({
  user_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  note: z
    .string()
    .trim()
    .max(REFUND_REASON_MAX, `Keep the note under ${REFUND_REASON_MAX} characters.`)
    .default(""),
});

export type PlanGrantInput = z.infer<typeof planGrantInputSchema>;

export const endPlanInputSchema = planGrantInputSchema.pick({ user_id: true, note: true });

export type EndPlanInput = z.infer<typeof endPlanInputSchema>;

/**
 * What the console says after granting a plan. The member is not billed, so the
 * message never implies a payment — it names the plan and the daily allowance
 * the member will see from their next request.
 */
export function describePlanGrant(options: {
  planTitle: string;
  creditsIncluded: number;
  replaced: boolean;
}): string {
  const { planTitle, creditsIncluded, replaced } = options;
  const credits = `${creditsIncluded} styling credit${creditsIncluded === 1 ? "" : "s"} a day`;
  return replaced
    ? `Plan changed to ${planTitle} — ${credits}. No Paddle billing involved.`
    : `${planTitle} granted — ${credits}. No Paddle billing involved.`;
}

export function describePlanEnd(planTitle: string): string {
  return `${planTitle} ended. The member is back to no plan and the free allowance.`;
}
