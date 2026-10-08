import { isSubscriptionLive, type SubscriptionPeriod } from "@/lib/credit-balance";
import { isManualSubscription } from "@/lib/member-billing";

/** The columns the slot rule reads from a member's newest in-force subscription row. */
export interface PlanSlotRow extends SubscriptionPeriod {
  paddle_subscription_id: string;
}

/**
 * Who owns a member's plan slot when staff go to grant or end a plan:
 *
 * - `free`: nothing in force, so a grant creates a new row.
 * - `billed`: a live Paddle subscription. Paddle owns the slot, so a grant is
 *   refused and an end is pointed at the Paddle actions.
 * - `manual`: a plan staff granted. It is reused in place; `live` says whether
 *   it still entitles the member, which an "already on that plan" check needs.
 *
 * A Paddle plan cancelled to run out keeps `active` in the database until the
 * webhook catches up, so once its paid period has ended it no longer owns the
 * slot. The same live-subscription rule the credit balance applies.
 */
export type PlanSlot<T extends PlanSlotRow> =
  { kind: "free" } | { kind: "billed" } | { kind: "manual"; sub: T; live: boolean };

export function grantSlot<T extends PlanSlotRow>(
  sub: T | null | undefined,
  now: Date = new Date(),
): PlanSlot<T> {
  if (!sub) return { kind: "free" };
  const live = isSubscriptionLive(sub, now);
  if (isManualSubscription(sub.paddle_subscription_id)) return { kind: "manual", sub, live };
  return live ? { kind: "billed" } : { kind: "free" };
}
