import { describe, expect, test } from "bun:test";
import { computeMrr, type MrrPlan, type MrrSubscription } from "./mrr";

const MONTHLY: MrrPlan = {
  id: "plan-monthly",
  price_amount: 1999,
  currency: "usd",
  billing_interval: "monthly",
};
const YEARLY: MrrPlan = {
  id: "plan-yearly",
  price_amount: 11_988,
  currency: "usd",
  billing_interval: "yearly",
};

const paid = (planId: string, id = "sub_01paid"): MrrSubscription => ({
  plan_id: planId,
  paddle_subscription_id: id,
});

describe("computeMrr", () => {
  test("a monthly plan counts its price, in cents", () => {
    expect(computeMrr([paid("plan-monthly")], [MONTHLY])).toEqual({ cents: 1999, currency: "usd" });
  });

  test("a yearly plan counts a twelfth of its price", () => {
    expect(computeMrr([paid("plan-yearly")], [YEARLY])).toEqual({ cents: 999, currency: "usd" });
  });

  test("monthly and yearly memberships add up to one monthly figure", () => {
    const subscriptions = [paid("plan-monthly", "sub_01a"), paid("plan-yearly", "sub_01b")];
    expect(computeMrr(subscriptions, [MONTHLY, YEARLY]).cents).toBe(1999 + 999);
  });

  test("two $19.99 monthly members are $39.98, not 100x that", () => {
    const subscriptions = [paid("plan-monthly", "sub_01a"), paid("plan-monthly", "sub_01b")];
    expect(computeMrr(subscriptions, [MONTHLY]).cents).toBe(3998);
  });

  test("staff-granted memberships earn nothing, whatever plan they sit on", () => {
    const subscriptions = [
      paid("plan-monthly", "sub_01a"),
      paid("plan-monthly", "manual:6f1c2d1e-0000-4000-8000-000000000000"),
      paid("plan-yearly", "manual_comp_b0f0a34a-a32c-4b3c-95d5-5c6a81fe39ea"),
    ];
    expect(computeMrr(subscriptions, [MONTHLY, YEARLY]).cents).toBe(1999);
  });

  test("only granted memberships means zero revenue", () => {
    const subscriptions = [paid("plan-monthly", "manual:abc")];
    expect(computeMrr(subscriptions, [MONTHLY]).cents).toBe(0);
  });

  test("rounds once at the end, so twelfths do not drift", () => {
    const odd: MrrPlan = { ...YEARLY, id: "plan-odd", price_amount: 10_000 };
    // 10000 / 12 = 833.33 each; two of them are 1666.67, which rounds to 1667.
    const subscriptions = [paid("plan-odd", "sub_01a"), paid("plan-odd", "sub_01b")];
    expect(computeMrr(subscriptions, [odd]).cents).toBe(1667);
  });

  test("a plan that is missing or has an unknown interval is skipped, not guessed", () => {
    const weekly: MrrPlan = { ...MONTHLY, id: "plan-weekly", billing_interval: "weekly" };
    const subscriptions = [
      paid("plan-gone", "sub_01a"),
      paid("plan-weekly", "sub_01b"),
      paid("plan-monthly", "sub_01c"),
    ];
    expect(computeMrr(subscriptions, [weekly, MONTHLY]).cents).toBe(1999);
  });

  test("the currency comes from billed plans, never from a granted one", () => {
    const euro: MrrPlan = { ...MONTHLY, id: "plan-euro", currency: "eur" };
    const subscriptions = [paid("plan-monthly", "sub_01a"), paid("plan-euro", "manual:abc")];
    expect(computeMrr(subscriptions, [MONTHLY, euro]).currency).toBe("usd");
  });

  test("no subscriptions is zero in USD, not a crash", () => {
    expect(computeMrr([], [])).toEqual({ cents: 0, currency: "USD" });
  });
});
