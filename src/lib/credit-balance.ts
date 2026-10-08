import { CONSOLE_IN_FORCE_STATUSES } from "@/lib/member-billing";

/**
 * What a member can spend, worked out the way the member app works it out
 * (its `credits.ts` and `constants/subscriptions.ts`) so the console never
 * shows a balance the member can't actually use.
 */

/**
 * The credit RPCs bucket the daily allowance by UTC calendar date
 * (`consume_ai_credit` compares `credits_reset_at` with `CURRENT_DATE`), so
 * anything reading a balance has to use the same clock.
 */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The daily part of what the member can spend today. `ai_credits` only holds
 * today's bucket once the day has been reset — on the first use, or by the
 * daily sweep — so until then the live plan's allowance is what they are owed,
 * and no plan means nothing is owed.
 */
export function effectiveDailyCredits(input: {
  aiCredits: number;
  creditsResetAt: string | null;
  planAllowance: number | null;
  today: string;
}): number {
  return input.creditsResetAt === input.today ? input.aiCredits : (input.planAllowance ?? 0);
}

/** Daily part plus purchased credits, which are the member's own and always count. */
export function effectiveCredits(input: {
  aiCredits: number;
  purchasedCredits: number;
  creditsResetAt: string | null;
  planAllowance: number | null;
  today: string;
}): number {
  return effectiveDailyCredits(input) + input.purchasedCredits;
}

export interface SubscriptionPeriod {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

/**
 * Whether a subscription still entitles the member right now. Status alone
 * isn't enough: a plan cancelled to run out at the end of its paid period keeps
 * `active` in the database until Paddle's webhook (or the daily sweep) catches
 * up, so an ended paid period must not read as a live membership. A plan staff
 * granted by hand has no period end and never expires this way — only staff end
 * it.
 */
export function isSubscriptionLive(
  subscription: SubscriptionPeriod,
  now: Date = new Date(),
): boolean {
  if (!(CONSOLE_IN_FORCE_STATUSES as readonly string[]).includes(subscription.status)) return false;
  if (!subscription.cancel_at_period_end) return true;
  if (!subscription.current_period_end) return true;
  const end = Date.parse(subscription.current_period_end);
  return Number.isNaN(end) || end > now.getTime();
}

/**
 * The daily allowance a member's plan entitles them to: the included credits of
 * their newest in-force subscription while it is still live, else nothing — the
 * rule the member app applies when it resolves the allowance for a request.
 */
export function liveDailyAllowance(
  subscription: (SubscriptionPeriod & { plan_id: string }) | null | undefined,
  creditsByPlan: ReadonlyMap<string, number>,
  now: Date = new Date(),
): number {
  if (!subscription || !isSubscriptionLive(subscription, now)) return 0;
  return creditsByPlan.get(subscription.plan_id) ?? 0;
}

/** The newest-updated row per member, whatever order the rows arrive in. */
export function latestSubscriptionByUser<T extends { user_id: string; updated_at: string }>(
  rows: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(row.user_id);
    if (!current || Date.parse(row.updated_at) > Date.parse(current.updated_at)) {
      latest.set(row.user_id, row);
    }
  }
  return latest;
}

export interface MemberBalance {
  aiCredits: number;
  purchasedCredits: number;
  total: number;
}

/**
 * The balance a staff dialog shows, from the raw entitlement read. A failed read
 * is `null` ("balance unavailable"), never zero: zero would read as a member who
 * has nothing, and a dialog must not be blocked because one number is missing.
 * A successful read with no row is a real zero.
 */
export function memberBalanceOrNull(
  read: {
    data: { ai_credits: number; purchased_credits: number; credits_reset_at: string | null } | null;
    error: unknown;
  },
  planAllowance: number | null,
  today: string,
): MemberBalance | null {
  if (read.error) return null;
  const entitlement = read.data;
  if (!entitlement) return { aiCredits: 0, purchasedCredits: 0, total: 0 };
  const aiCredits = effectiveDailyCredits({
    aiCredits: entitlement.ai_credits,
    creditsResetAt: entitlement.credits_reset_at,
    planAllowance,
    today,
  });
  return {
    aiCredits,
    purchasedCredits: entitlement.purchased_credits,
    total: aiCredits + entitlement.purchased_credits,
  };
}
