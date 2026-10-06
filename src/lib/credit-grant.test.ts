import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CREDIT_AUDIT_WARNING,
  GRANT_LOOKUP_FAILED_MESSAGE,
  GRANT_UNCONFIRMED_MESSAGE,
  assertEntitlementSynced,
  describeGrantCreditsError,
  recordGrantAudit,
} from "./credit-grant";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("recordGrantAudit", () => {
  test("a failed audit write after the credits landed becomes a warning, not an error", async () => {
    const logged: unknown[] = [];
    const failure = new Error("The action succeeded, but its audit record could not be saved.");

    const warning = await recordGrantAudit(
      async () => {
        throw failure;
      },
      (error) => logged.push(error),
    );

    expect(warning).toBe(CREDIT_AUDIT_WARNING);
    expect(logged).toEqual([failure]);
  });

  test("a clean audit write returns no warning and logs nothing", async () => {
    const logged: unknown[] = [];
    const warning = await recordGrantAudit(
      async () => undefined,
      (error) => logged.push(error),
    );
    expect(warning).toBeNull();
    expect(logged).toEqual([]);
  });

  test("the warning is plain member-of-staff copy with no codes in it", () => {
    expect(CREDIT_AUDIT_WARNING).toContain("added");
    expect(CREDIT_AUDIT_WARNING).not.toMatch(/[a-z]+_[a-z_]+/);
  });
});

describe("describeGrantCreditsError", () => {
  test("a member with no credit record gets a plain sentence", () => {
    expect(describeGrantCreditsError("entitlements_not_found")).toBe(
      "This member has no credit record yet.",
    );
    expect(describeGrantCreditsError("P0001: entitlements_not_found")).toBe(
      "This member has no credit record yet.",
    );
  });

  test("the other ledger refusals are plain too", () => {
    expect(describeGrantCreditsError("invalid_amount")).toBe(
      "Enter a whole number of credits from 1 to 100,000.",
    );
    expect(describeGrantCreditsError("invalid_daily_allowance")).toBe(
      "This member's plan has an invalid daily allowance. Check it on the Plans screen.",
    );
  });

  test("anything unknown never leaks its raw text", () => {
    const message = describeGrantCreditsError(
      'relation "user_entitlements" does not exist (42P01)',
    );
    expect(message).toBe(GRANT_UNCONFIRMED_MESSAGE);
    expect(message).not.toContain("42P01");
  });

  test("an unreadable ledger error never promises nothing changed — the grant may have committed", () => {
    for (const raw of ["fetch failed", "", "connection terminated unexpectedly", "timeout"]) {
      const message = describeGrantCreditsError(raw);
      expect(message).toBe(
        "Couldn't confirm the credits were added. Check the member's balance before trying again.",
      );
      expect(message).not.toContain("Nothing was changed");
    }
  });

  test("only the lookups that run before any write say nothing was changed", () => {
    expect(GRANT_LOOKUP_FAILED_MESSAGE).toBe(
      "Couldn't read this member's plan. Nothing was changed — please try again.",
    );
    expect(GRANT_UNCONFIRMED_MESSAGE).not.toContain("Nothing was changed");
  });
});

describe("assertEntitlementSynced", () => {
  test("passes when the update touched the member's credit row", () => {
    expect(() => assertEntitlementSynced([{ user_id: "u1" }])).not.toThrow();
  });

  test("throws a plain error when no row came back, so success is never reported", () => {
    expect(() => assertEntitlementSynced([])).toThrow(
      "The plan was granted, but this member has no credit record yet, so their daily credits weren't set.",
    );
    expect(() => assertEntitlementSynced(null)).toThrow("no credit record yet");
  });
});

describe("billing server functions are wired to the helpers", () => {
  const fn = source("./member-billing.functions.ts");
  const grant = fn.slice(
    fn.indexOf("export const adminGrantStylingCredits"),
    fn.indexOf("export interface MemberPlanGrantResult"),
  );
  const setPlan = fn.slice(
    fn.indexOf("export const adminSetMemberPlan"),
    fn.indexOf("export interface MemberPlanEndResult"),
  );

  test("the grant's audit write cannot turn a landed grant into an error", () => {
    expect(grant).toContain("recordGrantAudit(");
    expect(grant).toContain("warning");
    // The audit record is written only after the ledger RPC has succeeded.
    expect(grant.indexOf('.rpc("grant_ai_credits"')).toBeLessThan(
      grant.indexOf("recordGrantAudit("),
    );
  });

  test("the grant never reads raw database text to staff", () => {
    expect(grant).toContain("describeGrantCreditsError(");
    expect(grant).not.toContain("throw new Error(error.message)");
  });

  test("the pre-write lookups say nothing changed, the ledger call never does", () => {
    const rpc = grant.indexOf('.rpc("grant_ai_credits"');
    const lookups = grant.slice(0, rpc);
    const afterRpc = grant.slice(rpc);
    expect(lookups.split("GRANT_LOOKUP_FAILED_MESSAGE").length - 1).toBe(2);
    expect(grant).not.toContain("Nothing was changed");
    expect(afterRpc).not.toContain("GRANT_LOOKUP_FAILED_MESSAGE");
  });

  test("the grant resolves the allowance with the member app's live-subscription rule", () => {
    expect(grant).toContain("current_period_end");
    expect(grant).toContain("cancel_at_period_end");
    expect(grant).toContain("liveDailyAllowance(");
  });

  test("the plan grant checks a credit row was updated before reporting success", () => {
    const update = setPlan.indexOf(".update({ ai_credits: plan.credits_included })");
    expect(update).toBeGreaterThan(-1);
    expect(setPlan.indexOf('.select("user_id")', update)).toBeGreaterThan(update);
    expect(setPlan.indexOf("assertEntitlementSynced(")).toBeGreaterThan(update);
    expect(setPlan.indexOf("assertEntitlementSynced(")).toBeLessThan(
      setPlan.indexOf("recordStaffAction("),
    );
  });

  test("the billing read uses the effective balance, not the raw columns", () => {
    expect(fn).toContain("effectiveDailyCredits(");
    expect(fn).toContain("credits_reset_at");
    expect(fn).not.toContain(
      "(entRes.data?.ai_credits ?? 0) + (entRes.data?.purchased_credits ?? 0)",
    );
  });

  test("the members list uses the effective balance, not the raw columns", () => {
    const list = source("./admin.functions.ts");
    expect(list).toContain("effectiveCredits(");
    expect(list).toContain("credits_reset_at");
    expect(list).not.toContain("entitlement.ai_credits + entitlement.purchased_credits");
  });
});

describe("the members page", () => {
  const page = source("../routes/_authed/members.tsx");
  const submit = page.slice(
    page.indexOf("async function submitCredits"),
    page.indexOf("const columns = getMembersColumns"),
  );
  const [tryBlock, catchBlock] = submit.split("} catch (e) {");

  test("shows the audit warning quietly under the success toast", () => {
    expect(tryBlock).toContain("result.warning");
    expect(tryBlock).toContain("setCreditsTarget(null)");
  });

  test("refreshes the list and the billing data after a failed grant too, so a landed grant shows", () => {
    expect(catchBlock).toBeDefined();
    expect(catchBlock).toContain("queryKeys.adminUsers");
    expect(catchBlock).toContain("queryKeys.adminMemberBilling(target.id)");
    // The dialog stays open on an error so the staff member reads the message.
    expect(catchBlock).not.toContain("setCreditsTarget(null)");
  });
});

describe("recordStaffAction", () => {
  const fn = source("./admin.functions.ts");
  const record = fn.slice(fn.indexOf("export const recordStaffAction"));
  const insertFailed = record.slice(
    record.indexOf("if (error)"),
    record.indexOf("export const getStaffAuthorization"),
  );

  test("keeps the database cause in the server log, never in the text staff read", () => {
    expect(insertFailed).toContain("console.error(");
    expect(insertFailed).toContain("error.message");
    expect(insertFailed).toContain(
      'throw new Error("The action succeeded, but its audit record could not be saved.")',
    );
    expect(insertFailed.indexOf("console.error(")).toBeLessThan(insertFailed.indexOf("throw new"));
  });
});
