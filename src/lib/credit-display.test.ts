import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { describeMemberCredits } from "./credit-display";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("describeMemberCredits", () => {
  test("says what is left today and what was bought, separately", () => {
    expect(describeMemberCredits({ daily: 12, purchased: 5 })).toEqual({
      total: 17,
      dailyLabel: "12 left today",
      purchasedLabel: "5 purchased",
      summary: "17 credits: 12 left today and 5 purchased",
    });
  });

  test("a member with nothing bought still shows a purchased line of zero", () => {
    const parts = describeMemberCredits({ daily: 3, purchased: 0 });
    expect(parts.purchasedLabel).toBe("0 purchased");
    expect(parts.total).toBe(3);
  });

  test("one credit is singular in the summary", () => {
    expect(describeMemberCredits({ daily: 1, purchased: 0 }).summary).toBe(
      "1 credit: 1 left today and 0 purchased",
    );
  });

  test("never negative, never fractional", () => {
    expect(describeMemberCredits({ daily: -2, purchased: 4.6 })).toMatchObject({
      total: 5,
      dailyLabel: "0 left today",
      purchasedLabel: "5 purchased",
    });
  });
});

test("the members list carries the two parts, not only their sum", () => {
  const fn = source("./admin.functions.ts");
  expect(fn).toContain("daily_credits");
  expect(fn).toContain("purchased_credits");
});

// The Credits column itself is rendered in members-columns.test.tsx.
