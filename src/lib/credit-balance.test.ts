import { describe, expect, test } from "bun:test";
import {
  effectiveCredits,
  effectiveDailyCredits,
  isSubscriptionLive,
  latestSubscriptionByUser,
  liveDailyAllowance,
  utcDay,
} from "./credit-balance";

const NOW = new Date("2026-10-06T09:30:00.000Z");
const TODAY = "2026-10-06";

describe("utcDay", () => {
  test("buckets by the UTC calendar date, like the credit RPCs", () => {
    expect(utcDay(new Date("2026-10-06T23:59:59.000Z"))).toBe("2026-10-06");
    expect(utcDay(new Date("2026-10-07T00:00:00.000Z"))).toBe("2026-10-07");
  });
});

describe("effectiveCredits", () => {
  test("counts the stored daily bucket once it belongs to today", () => {
    expect(
      effectiveCredits({
        aiCredits: 3,
        purchasedCredits: 10,
        creditsResetAt: TODAY,
        planAllowance: 20,
        today: TODAY,
      }),
    ).toBe(13);
  });

  test("a stale bucket reads as the live plan's allowance, not yesterday's leftover", () => {
    expect(
      effectiveCredits({
        aiCredits: 1,
        purchasedCredits: 5,
        creditsResetAt: "2026-10-05",
        planAllowance: 20,
        today: TODAY,
      }),
    ).toBe(25);
  });

  test("a stale bucket with no plan is worth nothing, but purchased credits still count", () => {
    expect(
      effectiveCredits({
        aiCredits: 7,
        purchasedCredits: 5,
        creditsResetAt: null,
        planAllowance: null,
        today: TODAY,
      }),
    ).toBe(5);
  });

  test("the daily part alone excludes purchased credits", () => {
    expect(
      effectiveDailyCredits({
        aiCredits: 7,
        creditsResetAt: "2026-10-05",
        planAllowance: 4,
        today: TODAY,
      }),
    ).toBe(4);
    expect(
      effectiveDailyCredits({
        aiCredits: 7,
        creditsResetAt: TODAY,
        planAllowance: 4,
        today: TODAY,
      }),
    ).toBe(7);
  });
});

describe("isSubscriptionLive", () => {
  const live = { status: "active", current_period_end: null, cancel_at_period_end: false };

  test("in-force statuses are live, anything else is not", () => {
    expect(isSubscriptionLive(live, NOW)).toBe(true);
    expect(isSubscriptionLive({ ...live, status: "trialing" }, NOW)).toBe(true);
    expect(isSubscriptionLive({ ...live, status: "past_due" }, NOW)).toBe(true);
    expect(isSubscriptionLive({ ...live, status: "canceled" }, NOW)).toBe(false);
    expect(isSubscriptionLive({ ...live, status: "paused" }, NOW)).toBe(false);
  });

  test("a plan cancelled to run out is live until its paid period ends, then not", () => {
    const winding = { status: "active", cancel_at_period_end: true };
    expect(
      isSubscriptionLive({ ...winding, current_period_end: "2026-10-07T00:00:00Z" }, NOW),
    ).toBe(true);
    expect(
      isSubscriptionLive({ ...winding, current_period_end: "2026-10-05T00:00:00Z" }, NOW),
    ).toBe(false);
    expect(
      isSubscriptionLive({ ...winding, current_period_end: "2026-10-06T09:30:00Z" }, NOW),
    ).toBe(false);
  });

  test("a past period end alone does not lapse a plan that is not cancelling", () => {
    expect(
      isSubscriptionLive(
        {
          status: "active",
          current_period_end: "2026-09-01T00:00:00Z",
          cancel_at_period_end: false,
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("a staff-granted plan has no period end and never expires this way", () => {
    expect(
      isSubscriptionLive(
        { status: "active", current_period_end: null, cancel_at_period_end: true },
        NOW,
      ),
    ).toBe(true);
  });

  test("an unreadable period end is treated as still live", () => {
    expect(
      isSubscriptionLive(
        { status: "active", current_period_end: "not-a-date", cancel_at_period_end: true },
        NOW,
      ),
    ).toBe(true);
  });
});

describe("liveDailyAllowance", () => {
  const credits = new Map([
    ["plan-a", 20],
    ["plan-b", 50],
  ]);
  const base = { status: "active", current_period_end: null, cancel_at_period_end: false };

  test("is the plan's included credits for a live subscription", () => {
    expect(liveDailyAllowance({ ...base, plan_id: "plan-b" }, credits, NOW)).toBe(50);
  });

  test("is zero with no subscription", () => {
    expect(liveDailyAllowance(null, credits, NOW)).toBe(0);
    expect(liveDailyAllowance(undefined, credits, NOW)).toBe(0);
  });

  test("is zero once a cancelled plan's paid period has ended", () => {
    expect(
      liveDailyAllowance(
        {
          plan_id: "plan-a",
          status: "active",
          current_period_end: "2026-10-01T00:00:00Z",
          cancel_at_period_end: true,
        },
        credits,
        NOW,
      ),
    ).toBe(0);
  });

  test("is zero when the plan can't be found", () => {
    expect(liveDailyAllowance({ ...base, plan_id: "plan-gone" }, credits, NOW)).toBe(0);
  });
});

describe("latestSubscriptionByUser", () => {
  test("keeps the most recently updated row for each member", () => {
    const rows = [
      { user_id: "u1", plan_id: "old", updated_at: "2026-09-01T00:00:00Z" },
      { user_id: "u1", plan_id: "new", updated_at: "2026-10-01T00:00:00Z" },
      { user_id: "u2", plan_id: "only", updated_at: "2026-08-01T00:00:00Z" },
    ];
    const latest = latestSubscriptionByUser(rows);
    expect(latest.get("u1")?.plan_id).toBe("new");
    expect(latest.get("u2")?.plan_id).toBe("only");
    expect(latest.size).toBe(2);
  });

  test("does not depend on the order the rows arrive in", () => {
    const rows = [
      { user_id: "u1", plan_id: "new", updated_at: "2026-10-01T00:00:00Z" },
      { user_id: "u1", plan_id: "old", updated_at: "2026-09-01T00:00:00Z" },
    ];
    expect(latestSubscriptionByUser(rows).get("u1")?.plan_id).toBe("new");
  });
});
