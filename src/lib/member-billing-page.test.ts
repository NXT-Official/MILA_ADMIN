import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the members page after a billing action fails", () => {
  const page = source("../routes/_authed/members.tsx");
  const submit = page.slice(
    page.indexOf("async function submitBilling"),
    page.indexOf("async function submitCredits"),
  );
  const [tryBlock = "", rest = ""] = submit.split("} catch (e) {");
  const [catchBlock = ""] = rest.split("} finally {");

  test("has a try block that closes the dialog and a catch that does not", () => {
    expect(tryBlock.includes("setBillingTarget(null)")).toBe(true);
    expect(catchBlock.length).toBeGreaterThan(0);
    // The dialog stays open on an error so the staff member reads the message.
    expect(catchBlock.includes("setBillingTarget(null)")).toBe(false);
  });

  test("refreshes the members list and the member's billing data, so a change that landed shows", () => {
    expect(catchBlock.includes("queryKeys.adminUsers")).toBe(true);
    expect(catchBlock.includes("queryKeys.adminMemberBilling(target.id)")).toBe(true);
  });

  test("still tells staff what went wrong", () => {
    expect(catchBlock.includes("toast.error(")).toBe(true);
  });

  test("a failed Paddle action also refreshes analytics, since a refund may already have left", () => {
    expect(catchBlock.includes("queryKeys.adminAnalytics")).toBe(true);
  });
});

describe("suspending a member", () => {
  const page = source("../routes/_authed/members.tsx");
  const columns = source("../components/admin/members-columns.tsx");
  const dialog = source("../components/admin/member-suspend-dialog.tsx");

  test("no native browser confirm is left on the suspend path", () => {
    expect(columns.includes("window.confirm")).toBe(false);
    expect(columns.includes("confirmSuspend(")).toBe(false);
    expect(page.includes("window.confirm")).toBe(false);
    expect(dialog.includes("window.confirm")).toBe(false);
  });

  test("the page asks in the styled dialog before it writes, as the delete flow does", () => {
    expect(page.includes("<MemberSuspendDialog")).toBe(true);
    expect(page.includes("setSuspendTarget(request.member)")).toBe(true);
    expect(page.includes("await setSuspended(")).toBe(true);
    // The only place that suspends is the dialog's confirm.
    expect(page.includes("applySuspended(suspendTarget.id, true)")).toBe(true);
    expect(page.split("applySuspended(").length - 1).toBe(3);
  });

  test("suspending goes through the dialog; reinstating is a single click and never opens it", () => {
    const request = page.slice(
      page.indexOf("function requestSuspendToggle"),
      page.indexOf("async function confirmSuspension"),
    );
    expect(request.includes("setSuspendTarget(")).toBe(true);
    expect(request.includes("applySuspended(id, false)")).toBe(true);
    expect(request.includes("applySuspended(id, true)")).toBe(false);
  });

  test("the dialog closes only once the suspend is reported done, so a failure stays readable", () => {
    const confirm = page.slice(
      page.indexOf("async function confirmSuspension"),
      page.indexOf("async function confirmDelete"),
    );
    expect(confirm.includes("if (done) setSuspendOpen(false)")).toBe(true);
    expect(confirm.includes("setSuspendPending(false)")).toBe(true);
  });

  test("the dialog names the member, blocks double submits and uses accessible, dash-free copy", () => {
    expect(dialog.includes("suspendConfirmCopy(")).toBe(true);
    expect(dialog.includes("disabled={pending}")).toBe(true);
    expect(dialog.includes('aria-hidden="true"')).toBe(true);
    expect(/[–—]/.test(dialog)).toBe(false);
  });
});
