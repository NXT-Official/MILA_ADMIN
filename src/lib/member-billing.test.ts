import { describe, expect, test } from "bun:test";
import {
  MANUAL_PADDLE_CUSTOMER_ID,
  MANUAL_SUBSCRIPTION_PREFIX,
  billingActionInputSchema,
  buildCancelBody,
  buildPlanChangeBody,
  buildRefundAdjustmentBody,
  describeBillingOutcome,
  describePlanEnd,
  describePlanGrant,
  describeRefundAdjustmentStatus,
  endPlanInputSchema,
  grantCreditsInputSchema,
  hasRefundablePrice,
  isManualSubscription,
  mirroredSubscriptionStatus,
  newManualSubscriptionId,
  planGrantInputSchema,
} from "./member-billing";

const USER_ID = "8f2f0d3a-2b1c-4f5e-9a7b-1c2d3e4f5a6b";
const PLAN_ID = "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d";

describe("billingActionInputSchema", () => {
  test("a cancel needs no target plan and keeps the caller's reason", () => {
    const parsed = billingActionInputSchema.parse({
      user_id: USER_ID,
      plan_action: "cancel",
      refund: true,
      reason: "Duplicate charge.",
    });
    expect(parsed).toEqual({
      user_id: USER_ID,
      plan_action: "cancel",
      refund: true,
      reason: "Duplicate charge.",
    });
  });

  test("a switch without a plan is refused before anything reaches Paddle", () => {
    const result = billingActionInputSchema.safeParse({ user_id: USER_ID, plan_action: "change" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Choose the plan to switch to.");
  });

  test("a switch with a plan passes and the defaults fill in", () => {
    const parsed = billingActionInputSchema.parse({
      user_id: USER_ID,
      plan_action: "change",
      target_plan_id: PLAN_ID,
    });
    expect(parsed.refund).toBe(false);
    expect(parsed.reason).toBe("Requested by staff from the admin console.");
  });

  test("reason length is bounded — it goes to Paddle as free text", () => {
    const result = billingActionInputSchema.safeParse({
      user_id: USER_ID,
      plan_action: "cancel",
      reason: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("grantCreditsInputSchema", () => {
  test("whole positive credits only", () => {
    expect(grantCreditsInputSchema.parse({ user_id: USER_ID, amount: 25 }).amount).toBe(25);
    expect(grantCreditsInputSchema.safeParse({ user_id: USER_ID, amount: 2.5 }).success).toBe(
      false,
    );
    expect(grantCreditsInputSchema.safeParse({ user_id: USER_ID, amount: 0 }).success).toBe(false);
    expect(grantCreditsInputSchema.safeParse({ user_id: USER_ID, amount: 100_001 }).success).toBe(
      false,
    );
  });

  test("the note is optional and defaults to empty", () => {
    expect(grantCreditsInputSchema.parse({ user_id: USER_ID, amount: 1 }).note).toBe("");
  });
});

describe("Paddle payloads", () => {
  test("a refund is a full refund of one transaction, with the staff reason", () => {
    expect(buildRefundAdjustmentBody("txn_abc", "Duplicate charge.")).toEqual({
      action: "refund",
      type: "full",
      transaction_id: "txn_abc",
      reason: "Duplicate charge.",
    });
  });

  test("a refunded cancel is immediate; an unrefunded one ends at the period boundary", () => {
    expect(buildCancelBody(true)).toEqual({ effective_from: "immediately" });
    expect(buildCancelBody(false)).toEqual({ effective_from: "next_billing_period" });
  });

  test("a switch replaces the item and never bills proration", () => {
    expect(buildPlanChangeBody("pri_123")).toEqual({
      items: [{ price_id: "pri_123", quantity: 1 }],
      proration_billing_mode: "do_not_bill",
    });
  });
});

describe("reporting what happened", () => {
  test("a refund is described by Paddle's own status, not assumed", () => {
    expect(describeRefundAdjustmentStatus("approved")).toContain("approved by Paddle");
    expect(describeRefundAdjustmentStatus("pending_approval")).toContain("awaiting Paddle");
    expect(describeRefundAdjustmentStatus("rejected")).toContain("Nothing was refunded");
    expect(describeRefundAdjustmentStatus("weird_new_status")).toBe(
      "Refund status from Paddle: weird_new_status.",
    );
  });

  test("the outcome sentence states the plan action and the refund", () => {
    expect(describeBillingOutcome({ action: "cancel", refunded: true })).toBe(
      "Subscription canceled and the latest payment refunded.",
    );
    expect(describeBillingOutcome({ action: "cancel", refunded: false })).toBe(
      "Subscription canceled at the end of the current period.",
    );
    expect(
      describeBillingOutcome({ action: "change", refunded: false, planTitle: "Atelier" }),
    ).toBe("Plan switched to Atelier.");
  });

  test("a switch keeps the member active; a refunded cancel ends the subscription", () => {
    expect(mirroredSubscriptionStatus("change", false)).toBe("active");
    expect(mirroredSubscriptionStatus("cancel", true)).toBe("canceled");
  });

  test("only a real Paddle price id can be switched onto", () => {
    expect(hasRefundablePrice("pri_123")).toBe(true);
    expect(hasRefundablePrice("   ")).toBe(false);
    expect(hasRefundablePrice(null)).toBe(false);
    expect(hasRefundablePrice(undefined)).toBe(false);
  });
});

describe("plans staff grant by hand", () => {
  test("a granted plan is recognised by its synthetic id, a billed one is not", () => {
    expect(isManualSubscription(`${MANUAL_SUBSCRIPTION_PREFIX}9c1f5b7e`)).toBe(true);
    expect(isManualSubscription("manual_comp_b0f0a34a-a32c-4b3c-95d5-5c6a81fe39ea")).toBe(true);
    expect(isManualSubscription("sub_01h8x")).toBe(false);
    expect(isManualSubscription("")).toBe(false);
    expect(isManualSubscription(null)).toBe(false);
    expect(isManualSubscription(undefined)).toBe(false);
  });

  test("a granted id is unique per grant and carries the prefix Paddle can never match", () => {
    const id = newManualSubscriptionId(() => "fixed-uuid");
    expect(id).toBe(`${MANUAL_SUBSCRIPTION_PREFIX}fixed-uuid`);
    expect(newManualSubscriptionId()).not.toBe(newManualSubscriptionId());
    expect(MANUAL_PADDLE_CUSTOMER_ID).toBe("manual");
  });

  test("granting needs a member and a plan; the note is optional", () => {
    const parsed = planGrantInputSchema.parse({ user_id: USER_ID, plan_id: PLAN_ID });
    expect(parsed.note).toBe("");
    expect(planGrantInputSchema.safeParse({ user_id: USER_ID }).success).toBe(false);
    expect(planGrantInputSchema.safeParse({ user_id: "nope", plan_id: PLAN_ID }).success).toBe(
      false,
    );
    expect(
      planGrantInputSchema.safeParse({ user_id: USER_ID, plan_id: PLAN_ID, note: "x".repeat(201) })
        .success,
    ).toBe(false);
  });

  test("ending a granted plan needs no plan id — it acts on the live one", () => {
    const parsed = endPlanInputSchema.parse({
      user_id: USER_ID,
      note: "Trial over.",
      plan_id: PLAN_ID,
    });
    expect(parsed).toEqual({ user_id: USER_ID, note: "Trial over." });
  });

  test("the grant message never implies a payment", () => {
    expect(describePlanGrant({ planTitle: "Atelier", creditsIncluded: 5, replaced: false })).toBe(
      "Atelier granted — 5 styling credits a day. No Paddle billing involved.",
    );
    expect(describePlanGrant({ planTitle: "Couture", creditsIncluded: 1, replaced: true })).toBe(
      "Plan changed to Couture — 1 styling credit a day. No Paddle billing involved.",
    );
    expect(describePlanEnd("Atelier")).toBe(
      "Atelier ended. The member is back to no plan and the free allowance.",
    );
  });
});
