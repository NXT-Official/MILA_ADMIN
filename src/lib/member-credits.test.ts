import { describe, expect, test } from "bun:test";
import { resolveMemberCredits } from "./member-credits";

const TODAY = "2026-10-07";
const ok = <T>(data: T[]) => ({ data, error: null });
const entitlement = (
  user_id: string,
  ai: number,
  bought: number,
  reset: string | null = TODAY,
) => ({
  user_id,
  ai_credits: ai,
  purchased_credits: bought,
  credits_reset_at: reset,
});

describe("resolveMemberCredits", () => {
  const good = {
    entitlements: ok([entitlement("a", 3, 10)]),
    subscriptions: ok([]),
    plans: ok([]),
  };

  test("good reads give the two parts", () => {
    const credits = resolveMemberCredits(good, TODAY, () => {});
    expect(credits("a")).toEqual({ daily: 3, purchased: 10 });
  });

  test("a member with no credit row, after good reads, really has zero", () => {
    expect(resolveMemberCredits(good, TODAY, () => {})("nobody")).toEqual({
      daily: 0,
      purchased: 0,
    });
  });

  test("a stale daily bucket falls back to the live plan's allowance", () => {
    const reads = {
      entitlements: ok([entitlement("a", 1, 0, "2026-10-01")]),
      subscriptions: ok([
        {
          user_id: "a",
          plan_id: "p",
          status: "active",
          current_period_end: null,
          cancel_at_period_end: false,
          updated_at: "2026-10-01T00:00:00Z",
        },
      ]),
      plans: ok([{ id: "p", credits_included: 20 }]),
    };
    expect(resolveMemberCredits(reads, TODAY, () => {})("a").daily).toBe(20);
  });

  for (const step of ["entitlements", "subscriptions", "plans"] as const) {
    test(`a failed ${step} read makes every member unavailable, never zero, and is logged`, () => {
      const logged: string[] = [];
      const reads = { ...good, [step]: { data: null, error: { message: "boom" } } };
      const credits = resolveMemberCredits(reads, TODAY, (name) => logged.push(name));
      expect(credits("a")).toEqual({ daily: null, purchased: null });
      expect(credits("nobody")).toEqual({ daily: null, purchased: null });
      expect(logged).toEqual([step]);
    });
  }
});
