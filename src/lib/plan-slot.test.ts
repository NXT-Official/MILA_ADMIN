import { describe, expect, test } from "bun:test";
import { grantSlot } from "./plan-slot";

// A fixed clock: nothing here may depend on the day the suite runs.
const NOW = new Date("2026-10-07T12:00:00Z");

const row = (overrides: Partial<Parameters<typeof grantSlot>[0] & object> = {}) => ({
  id: "row-1",
  plan_id: "plan-a",
  paddle_subscription_id: "sub_01billed",
  status: "active",
  current_period_end: "2026-11-01T00:00:00Z",
  cancel_at_period_end: false,
  ...overrides,
});

describe("grantSlot", () => {
  test("a member with no in-force row has a free slot", () => {
    expect(grantSlot(null, NOW)).toEqual({ kind: "free" });
    expect(grantSlot(undefined, NOW)).toEqual({ kind: "free" });
  });

  test("a live Paddle subscription owns the slot", () => {
    expect(grantSlot(row(), NOW)).toEqual({ kind: "billed" });
  });

  test("a Paddle plan cancelled to run out still owns the slot while its paid period lasts", () => {
    const winding = row({ cancel_at_period_end: true, current_period_end: "2026-10-20T00:00:00Z" });
    expect(grantSlot(winding, NOW)).toEqual({ kind: "billed" });
  });

  test("a Paddle plan whose cancelled period has ended no longer blocks a grant", () => {
    const ended = row({ cancel_at_period_end: true, current_period_end: "2026-10-05T00:00:00Z" });
    expect(grantSlot(ended, NOW)).toEqual({ kind: "free" });
  });

  test("a granted plan is handed back to be replaced in place, and says it is live", () => {
    const granted = row({ paddle_subscription_id: "manual:6f1c2d1e", current_period_end: null });
    expect(grantSlot(granted, NOW)).toEqual({ kind: "manual", sub: granted, live: true });
  });

  test("a hand-made granted row that has lapsed is still reused, but not called live", () => {
    const lapsed = row({
      paddle_subscription_id: "manual_comp_b0f0a34a",
      cancel_at_period_end: true,
      current_period_end: "2026-10-05T00:00:00Z",
    });
    expect(grantSlot(lapsed, NOW)).toEqual({ kind: "manual", sub: lapsed, live: false });
  });

  test("a row whose status is not in force is never live", () => {
    const canceled = row({ paddle_subscription_id: "manual:abc", status: "canceled" });
    expect(grantSlot(canceled, NOW)).toEqual({ kind: "manual", sub: canceled, live: false });
    expect(grantSlot(row({ status: "canceled" }), NOW)).toEqual({ kind: "free" });
  });
});
