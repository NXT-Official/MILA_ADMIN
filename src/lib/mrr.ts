import { isSubscriptionLive, type SubscriptionPeriod } from "./credit-balance";
import { isManualSubscription } from "./member-billing";

/** The `subscriptions` columns the MRR estimate reads. */
export interface MrrSubscription extends SubscriptionPeriod {
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
  /** The largest currency's total, in cents. Kept for readers of a single figure. */
  cents: number;
  currency: string;
  /** One total per currency, largest first. Currencies are never summed together. */
  byCurrency: { currency: string; cents: number }[];
}

/**
 * Monthly recurring revenue, in cents, from the memberships in force.
 *
 * Rule: a membership counts when it is billed (not staff-granted), live, and
 * either `active` or `past_due`. A `past_due` member is still subscribed and
 * the renewal is owed, so it stays in the figure; a `trialing` one has paid
 * nothing yet, so it is left out until it converts. Prices are stored in cents
 * (`price_amount`), so the result is in cents too; format it with
 * `formatPlanPrice`, never with a whole-unit formatter.
 *
 * Only billed memberships earn anything: a plan staff granted by hand sits on a
 * priced plan but nobody pays for it, so counting it would invent revenue. A
 * plan cancelled to run out keeps `active` in the database until Paddle's
 * webhook catches up, so it counts only while its paid period lasts: the same
 * live-subscription rule the credit balance uses. Yearly plans count a twelfth
 * each month. The sum is rounded once at the end, so a twelfth of a cent per
 * member does not drift the total.
 */
export function computeMrr(
  subscriptions: readonly MrrSubscription[],
  plans: readonly MrrPlan[],
  now: Date = new Date(),
): Mrr {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const totals = new Map<string, { currency: string; cents: number }>();
  for (const subscription of subscriptions) {
    if (isManualSubscription(subscription.paddle_subscription_id)) continue;
    if (!isSubscriptionLive(subscription, now)) continue;
    // A trial is in force but nobody has paid for it yet.
    if (subscription.status === "trialing") continue;
    const plan = planById.get(subscription.plan_id);
    if (!plan) continue;
    let monthly: number;
    if (plan.billing_interval === "monthly") monthly = plan.price_amount;
    else if (plan.billing_interval === "yearly") monthly = plan.price_amount / 12;
    else continue;
    // Prices in different currencies are different numbers: one total per currency.
    const key = plan.currency.toLowerCase();
    const total = totals.get(key) ?? { currency: plan.currency, cents: 0 };
    total.cents += monthly;
    totals.set(key, total);
  }
  const byCurrency = [...totals.values()]
    .map(({ currency, cents }) => ({ currency, cents: Math.round(cents) }))
    .sort((a, b) => b.cents - a.cents);
  const [primary] = byCurrency;
  return { cents: primary?.cents ?? 0, currency: primary?.currency ?? "USD", byCurrency };
}

/**
 * How many memberships are in force right now: an in-force status, and a plan
 * cancelled to run out only while its paid period lasts. Staff-granted plans
 * count (they are memberships), trials count, ended run-outs do not.
 */
export function countLiveSubscriptions(
  subscriptions: readonly SubscriptionPeriod[],
  now: Date = new Date(),
): number {
  return subscriptions.filter((subscription) => isSubscriptionLive(subscription, now)).length;
}
