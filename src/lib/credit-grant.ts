/** Quiet note staff see when credits landed but the staff audit record did not. */
export const CREDIT_AUDIT_WARNING =
  "The credits were added, but the staff activity log entry couldn't be saved.";

/**
 * Writes the staff audit record for a grant that has already landed. The credits
 * are in the member's balance by now, so a failing audit write must not turn
 * into an error — staff would see a failure, retry, and grant twice. The failure
 * is handed to `onError` for the server log and reported as a warning instead.
 */
export async function recordGrantAudit(
  write: () => Promise<void>,
  onError: (error: unknown) => void,
): Promise<string | null> {
  try {
    await write();
    return null;
  } catch (error) {
    onError(error);
    return CREDIT_AUDIT_WARNING;
  }
}

/**
 * The lookups that run before the ledger call fail before anything is written,
 * so staff can be told it is safe to try again.
 */
export const GRANT_LOOKUP_FAILED_MESSAGE =
  "Couldn't read this member's plan. Nothing was changed — please try again.";

/**
 * An error from the ledger call we can't read — a dropped connection or a lost
 * response can arrive after the grant has committed, so this must never promise
 * that nothing changed or invite a blind retry.
 */
export const GRANT_UNCONFIRMED_MESSAGE =
  "Couldn't confirm the credits were added. Check the member's balance before trying again.";

/**
 * Plain sentences for what the `grant_ai_credits` ledger refuses with. Those
 * refusals are raised before the ledger writes anything; every other error is
 * ambiguous about whether the grant landed.
 */
export function describeGrantCreditsError(message: string): string {
  if (message.includes("entitlements_not_found")) return "This member has no credit record yet.";
  if (message.includes("invalid_amount"))
    return "Enter a whole number of credits from 1 to 100,000.";
  if (message.includes("invalid_daily_allowance")) {
    return "This member's plan has an invalid daily allowance. Check it on the Plans screen.";
  }
  return GRANT_UNCONFIRMED_MESSAGE;
}

/**
 * A write to `user_entitlements` that matches no row still reports success, so
 * the caller asks for the touched rows back and this refuses an empty answer.
 */
export function assertEntitlementSynced(rows: readonly { user_id: string }[] | null): void {
  if (!rows || rows.length === 0) {
    throw new Error(
      "The plan was granted, but this member has no credit record yet, so their daily credits weren't set.",
    );
  }
}
