import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { billingDialogMode } from "./billing-dialog-mode";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// A fixed clock: nothing here may depend on the day the suite runs.
const NOW = new Date("2026-10-07T12:00:00Z");

const sub = (
  overrides: Partial<NonNullable<Parameters<typeof billingDialogMode>[0]["subscription"]>> = {},
) => ({
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  ...overrides,
});

describe("billingDialogMode", () => {
  test("no subscription means staff can grant one", () => {
    expect(billingDialogMode({ subscription: null, manualPlan: false }, NOW)).toBe("grant");
  });

  test("a live granted plan is shown as granted", () => {
    expect(billingDialogMode({ subscription: sub(), manualPlan: true }, NOW)).toBe("granted");
    for (const status of ["trialing", "past_due"]) {
      expect(billingDialogMode({ subscription: sub({ status }), manualPlan: true }, NOW)).toBe(
        "granted",
      );
    }
  });

  test("a granted plan that is no longer in force is not called Granted", () => {
    for (const status of ["canceled", "paused", "incomplete"]) {
      expect(billingDialogMode({ subscription: sub({ status }), manualPlan: true }, NOW)).toBe(
        "grant",
      );
    }
  });

  test("a live Paddle subscription gets the Paddle actions", () => {
    const winding = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: "2026-10-20T00:00:00Z" });
    expect(billingDialogMode({ subscription: sub(), manualPlan: false }, NOW)).toBe("paddle");
    expect(billingDialogMode({ subscription: winding, manualPlan: false }, NOW)).toBe("paddle");
  });

  test("a cancelled Paddle plan whose paid period has ended frees the member for a grant", () => {
    const ended = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: "2026-10-05T00:00:00Z" });
    expect(billingDialogMode({ subscription: ended, manualPlan: false }, NOW)).toBe("grant");
  });
});

describe("the billing dialog", () => {
  const dialog = source("../components/admin/member-billing-dialog.tsx");

  test("takes its mode from the shared rule, never from the manual flag alone", () => {
    expect(dialog.includes("billingDialogMode(")).toBe(true);
    expect(dialog.includes('manualPlan ? "granted"')).toBe(false);
  });
});
