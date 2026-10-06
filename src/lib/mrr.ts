import { isManualSubscription } from "./member-billing";

/** The `subscriptions` columns the MRR estimate reads. */
export interface MrrSubscription {
  plan_id: string;
  paddle_subscription_id: string;
}

/** The `subscription_plans` columns it reads; `price_amount` is stored in cents. */
export interface MrrPlan {
  id: string;
  price_amount: number;
  currency: string;
  billing_interval: string;
}

export interface Mrr {
  cents: number;
  currency: string;
}

/**
 * Monthly recurring revenue, in cents, from the memberships in force.
 *
 * Only billed memberships earn anything: a plan staff granted by hand sits on a
 * priced plan but nobody pays for it, so counting it would invent revenue.
 * Yearly plans count a twelfth each month. The sum is rounded once at the end,
 * so a twelfth of a cent per member does not drift the total.
 */
export function computeMrr(
  subscriptions: readonly MrrSubscription[],
  plans: readonly MrrPlan[],
): Mrr {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  let cents = 0;
  let currency = "USD";
  for (const subscription of subscriptions) {
    if (isManualSubscription(subscription.paddle_subscription_id)) continue;
    const plan = planById.get(subscription.plan_id);
    if (!plan) continue;
    if (plan.billing_interval === "monthly") cents += plan.price_amount;
    else if (plan.billing_interval === "yearly") cents += plan.price_amount / 12;
    else continue;
    currency = plan.currency;
  }
  return { cents: Math.round(cents), currency };
}
