import {
  effectiveDailyCredits,
  latestSubscriptionByUser,
  liveDailyAllowance,
} from "./credit-balance";

interface Read<T> {
  data: T[] | null;
  error: unknown;
}

export interface MemberCreditsParts {
  /** What is left of today's daily allowance, or `null` when it could not be read. */
  daily: number | null;
  /** Bought credits, or `null` when they could not be read. */
  purchased: number | null;
}

/**
 * What each member can spend, for the members list. If any of the three reads
 * failed, nothing is known about anyone: every member is `null` ("unavailable"),
 * never 0, because zero reads as "she has no credits". A member with no
 * entitlement row after good reads really has nothing, so that is 0.
 */
export function resolveMemberCredits(
  reads: {
    entitlements: Read<{
      user_id: string;
      ai_credits: number;
      purchased_credits: number;
      credits_reset_at: string | null;
    }>;
    subscriptions: Read<{
      user_id: string;
      plan_id: string;
      status: string;
      current_period_end: string | null;
      cancel_at_period_end: boolean | null;
      updated_at: string;
    }>;
    plans: Read<{ id: string; credits_included: number }>;
  },
  today: string,
  onError: (step: string, error: unknown) => void,
): (userId: string) => MemberCreditsParts {
  const failed = (
    [
      ["entitlements", reads.entitlements],
      ["subscriptions", reads.subscriptions],
      ["plans", reads.plans],
    ] as const
  ).filter(([, read]) => read.error);
  if (failed.length > 0) {
    for (const [step, read] of failed) onError(step, read.error);
    return () => ({ daily: null, purchased: null });
  }

  const creditsByPlan = new Map((reads.plans.data ?? []).map((p) => [p.id, p.credits_included]));
  const latestSubs = latestSubscriptionByUser(reads.subscriptions.data ?? []);
  const entitlements = new Map((reads.entitlements.data ?? []).map((e) => [e.user_id, e]));
  return (userId) => {
    const entitlement = entitlements.get(userId);
    if (!entitlement) return { daily: 0, purchased: 0 };
    return {
      daily: effectiveDailyCredits({
        aiCredits: entitlement.ai_credits,
        creditsResetAt: entitlement.credits_reset_at,
        planAllowance: liveDailyAllowance(latestSubs.get(userId), creditsByPlan),
        today,
      }),
      purchased: entitlement.purchased_credits,
    };
  };
}
