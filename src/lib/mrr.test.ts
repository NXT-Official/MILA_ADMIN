import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { computeMrr, countLiveSubscriptions, type MrrPlan, type MrrSubscription } from "./mrr";

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

// A fixed clock: nothing here may depend on the day the suite runs.
const NOW = new Date("2026-10-07T12:00:00Z");

const paid = (planId: string, id = "sub_01paid"): MrrSubscription => ({
  plan_id: planId,
  paddle_subscription_id: id,
  status: "active",
  current_period_end: "2026-11-01T00:00:00Z",
  cancel_at_period_end: false,
});

const winding = (
  planId: string,
  periodEnd: string | null,
  id = "sub_01winding",
): MrrSubscription => ({
  ...paid(planId, id),
  current_period_end: periodEnd,
  cancel_at_period_end: true,
});

describe("computeMrr", () => {
  test("a monthly plan counts its price, in cents", () => {
    expect(computeMrr([paid("plan-monthly")], [MONTHLY])).toMatchObject({
      cents: 1999,
      currency: "usd",
    });
  });

  test("a yearly plan counts a twelfth of its price", () => {
    expect(computeMrr([paid("plan-yearly")], [YEARLY])).toMatchObject({
      cents: 999,
      currency: "usd",
    });
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
    expect(computeMrr([], [])).toMatchObject({ cents: 0, currency: "USD" });
  });

  test("a plan cancelled to run out still earns until its paid period ends", () => {
    const subscriptions = [winding("plan-monthly", "2026-10-20T00:00:00Z")];
    expect(computeMrr(subscriptions, [MONTHLY], NOW).cents).toBe(1999);
  });

  test("a cancelled plan whose paid period has ended earns nothing, even while its status still says active", () => {
    const subscriptions = [
      paid("plan-monthly", "sub_01keeps"),
      winding("plan-monthly", "2026-10-05T00:00:00Z", "sub_01ended"),
    ];
    expect(computeMrr(subscriptions, [MONTHLY], NOW).cents).toBe(1999);
  });

  test("a period that ended earlier today is already over", () => {
    const subscriptions = [winding("plan-yearly", "2026-10-07T09:30:00Z")];
    expect(computeMrr(subscriptions, [YEARLY], NOW).cents).toBe(0);
  });

  test("a past period end alone does not stop a plan that is not cancelling", () => {
    const renewing: MrrSubscription = {
      ...paid("plan-monthly"),
      current_period_end: "2026-10-01T00:00:00Z",
    };
    expect(computeMrr([renewing], [MONTHLY], NOW).cents).toBe(1999);
  });

  test("a plan whose status is not in force earns nothing", () => {
    const canceled: MrrSubscription = { ...paid("plan-monthly"), status: "canceled" };
    expect(computeMrr([canceled], [MONTHLY], NOW).cents).toBe(0);
  });

  test("an ended plan does not set the currency either", () => {
    const euro: MrrPlan = { ...MONTHLY, id: "plan-euro", currency: "eur" };
    const subscriptions = [
      paid("plan-monthly", "sub_01live"),
      winding("plan-euro", "2026-10-05T00:00:00Z", "sub_01ended"),
    ];
    expect(computeMrr(subscriptions, [MONTHLY, euro], NOW).currency).toBe("usd");
  });
});

describe("trial and past-due memberships", () => {
  test("a trial earns nothing yet: nobody has paid", () => {
    const trial: MrrSubscription = { ...paid("plan-monthly"), status: "trialing" };
    expect(computeMrr([trial], [MONTHLY], NOW).cents).toBe(0);
  });

  test("a past-due membership still counts: it is subscribed and the payment is owed", () => {
    const late: MrrSubscription = { ...paid("plan-monthly"), status: "past_due" };
    expect(computeMrr([late], [MONTHLY], NOW).cents).toBe(1999);
  });

  test("a trial does not set the currency either", () => {
    const euro: MrrPlan = { ...MONTHLY, id: "plan-euro", currency: "eur" };
    const trial: MrrSubscription = { ...paid("plan-euro", "sub_01trial"), status: "trialing" };
    const subscriptions = [paid("plan-monthly", "sub_01live"), trial];
    expect(computeMrr(subscriptions, [MONTHLY, euro], NOW).currency).toBe("usd");
  });
});

describe("countLiveSubscriptions", () => {
  test("counts active, trialing and past-due memberships, granted ones included", () => {
    const subscriptions = [
      paid("plan-monthly", "sub_01a"),
      { ...paid("plan-monthly", "sub_01b"), status: "trialing" },
      { ...paid("plan-monthly", "sub_01c"), status: "past_due" },
      paid("plan-monthly", "manual:abc"),
    ];
    expect(countLiveSubscriptions(subscriptions, NOW)).toBe(4);
  });

  test("a cancelled run-out whose paid period has ended is not counted, though its status says active", () => {
    const subscriptions = [
      paid("plan-monthly", "sub_01a"),
      winding("plan-monthly", "2026-10-05T00:00:00Z", "sub_01ended"),
      winding("plan-monthly", "2026-10-20T00:00:00Z", "sub_01winding"),
    ];
    expect(countLiveSubscriptions(subscriptions, NOW)).toBe(2);
  });

  test("ended and canceled rows are not counted", () => {
    expect(countLiveSubscriptions([{ ...paid("plan-monthly"), status: "canceled" }], NOW)).toBe(0);
  });
});

test("the analytics read asks for every in-force status and counts the live ones itself", () => {
  const analytics = readFileSync(new URL("./analytics.functions.ts", import.meta.url), "utf8");
  const read = analytics.slice(analytics.indexOf('.from("subscriptions")'));
  expect(read.slice(0, 400)).toContain("CONSOLE_IN_FORCE_STATUSES");
  expect(read.slice(0, 400)).not.toContain('.eq("status", "active")');
  expect(analytics).toContain("countLiveSubscriptions(");
  expect(analytics).not.toContain("activeSubs.count");
});

test("the analytics read hands computeMrr the columns the live-subscription rule needs", () => {
  const analytics = readFileSync(new URL("./analytics.functions.ts", import.meta.url), "utf8");
  const select = analytics.slice(analytics.indexOf('.from("subscriptions")'));
  expect(select.slice(0, 260).includes("current_period_end")).toBe(true);
  expect(select.slice(0, 260).includes("cancel_at_period_end")).toBe(true);
  expect(select.slice(0, 260).includes("status")).toBe(true);
});

describe("memberships in different currencies", () => {
  const euro: MrrPlan = { ...MONTHLY, id: "plan-euro", price_amount: 500, currency: "eur" };

  test("each currency has its own total, never summed with another", () => {
    const subscriptions = [
      paid("plan-monthly", "sub_01a"),
      paid("plan-euro", "sub_01b"),
      paid("plan-euro", "sub_01c"),
    ];
    const result = computeMrr(subscriptions, [MONTHLY, euro], NOW);
    expect(result.byCurrency).toEqual([
      { currency: "usd", cents: 1999 },
      { currency: "eur", cents: 1000 },
    ]);
  });

  test("the headline pair is the largest currency, so older readers stay correct", () => {
    const subscriptions = [paid("plan-euro", "sub_01a"), paid("plan-monthly", "sub_01b")];
    const result = computeMrr(subscriptions, [MONTHLY, euro], NOW);
    expect(result).toMatchObject({ cents: 1999, currency: "usd" });
  });

  test("case does not split a currency", () => {
    const upper: MrrPlan = { ...MONTHLY, id: "plan-upper", currency: "USD" };
    const subscriptions = [paid("plan-monthly", "sub_01a"), paid("plan-upper", "sub_01b")];
    expect(computeMrr(subscriptions, [MONTHLY, upper], NOW).byCurrency).toHaveLength(1);
  });

  test("no billed memberships means no currencies", () => {
    expect(computeMrr([], [], NOW).byCurrency).toEqual([]);
  });
});
