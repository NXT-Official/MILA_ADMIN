import { describe, expect, test } from "bun:test";
import {
  collectCompletedRevenue,
  computeTaxDeductionCents,
  describeTaxSetting,
  transactionAmountCents,
  type PaddleTransactionLike,
} from "./revenue";

const transaction = (overrides: Partial<PaddleTransactionLike> = {}): PaddleTransactionLike => ({
  id: "txn_1",
  status: "completed",
  currency_code: "USD",
  details: { totals: { grand_total: "1999", total: "1999" } },
  ...overrides,
});

describe("computeTaxDeductionCents", () => {
  test("a percentage is a share of gross", () => {
    expect(computeTaxDeductionCents(100_000, "percent", 7.5)).toBe(7_500);
    expect(computeTaxDeductionCents(19_99, "percent", 5)).toBe(100);
  });

  test("a fixed amount is currency units, converted to cents", () => {
    // 12.50 off $250.00
    expect(computeTaxDeductionCents(25_000, "amount", 12.5)).toBe(1_250);
  });

  test("is a float either way — percentages and cents both round to whole cents", () => {
    expect(computeTaxDeductionCents(10_00, "percent", 12.345)).toBe(123);
    expect(computeTaxDeductionCents(10_000, "amount", 0.005)).toBe(1);
  });

  test("never exceeds gross, so net is never negative", () => {
    expect(computeTaxDeductionCents(500, "amount", 100)).toBe(500);
    expect(computeTaxDeductionCents(500, "percent", 250)).toBe(500);
  });

  test("zero, negative and non-finite settings deduct nothing", () => {
    expect(computeTaxDeductionCents(100_000, "percent", 0)).toBe(0);
    expect(computeTaxDeductionCents(100_000, "amount", -5)).toBe(0);
    expect(computeTaxDeductionCents(100_000, "percent", Number.NaN)).toBe(0);
    expect(computeTaxDeductionCents(0, "percent", 10)).toBe(0);
  });
});

describe("describeTaxSetting", () => {
  test("reads as the deduction, in the unit it was entered", () => {
    expect(describeTaxSetting("percent", 7.5)).toBe("7.5% of gross");
    expect(describeTaxSetting("amount", 12.5)).toBe("12.5 deducted from gross");
    expect(describeTaxSetting("percent", 0)).toBe("No tax deducted");
  });
});

describe("transactionAmountCents", () => {
  test("prefers grand_total, falls back to total, and ignores junk", () => {
    expect(transactionAmountCents(transaction())).toBe(1999);
    expect(
      transactionAmountCents({ details: { totals: { grand_total: null, total: "2500" } } }),
    ).toBe(2500);
    expect(transactionAmountCents({ details: { totals: { total: "19.99" } } })).toBeNull();
    expect(transactionAmountCents({})).toBeNull();
  });
});

describe("collectCompletedRevenue", () => {
  test("sums only completed transactions", () => {
    const collected = collectCompletedRevenue([
      transaction({ id: "a" }),
      transaction({ id: "b", status: "billed", details: { totals: { total: "9900" } } }),
      transaction({ id: "c", details: { totals: { total: "1000" } } }),
      transaction({ id: "d", status: "canceled", details: { totals: { total: "5000" } } }),
    ]);
    expect(collected.grossCents).toBe(2999);
    expect(collected.transactionCount).toBe(2);
    expect(collected.currency).toBe("USD");
    expect(collected.mixedCurrencies).toBe(false);
  });

  test("sums the dominant currency and flags the skipped ones", () => {
    const collected = collectCompletedRevenue([
      transaction({ id: "a", currency_code: "usd" }),
      transaction({ id: "b", currency_code: "USD", details: { totals: { total: "1000" } } }),
      transaction({ id: "c", currency_code: "EUR", details: { totals: { total: "8000" } } }),
    ]);
    expect(collected.currency).toBe("USD");
    expect(collected.grossCents).toBe(2999);
    expect(collected.transactionCount).toBe(2);
    expect(collected.mixedCurrencies).toBe(true);
  });

  test("an empty or unreadable list is zero, not a crash", () => {
    expect(collectCompletedRevenue([])).toEqual({
      currency: "USD",
      grossCents: 0,
      transactionCount: 0,
      mixedCurrencies: false,
    });
    expect(collectCompletedRevenue([transaction({ details: null })])).toEqual({
      currency: "USD",
      grossCents: 0,
      transactionCount: 0,
      mixedCurrencies: false,
    });
  });
});
