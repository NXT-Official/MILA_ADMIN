/**
 * The two native questions a steward is asked before a one-click action lands.
 * The browser dialog is injected so the answers are testable: `window.prompt`
 * returns `null` for Cancel and a string (possibly empty) for OK, and the two
 * must never be confused.
 */

/**
 * The reason a steward gives for hiding a post. `null` means they pressed
 * Cancel — the post stays visible. An empty string is a deliberate OK with no
 * reason, which still hides it.
 */
export function askHideReason(
  ask: (message: string) => string | null = (message) => window.prompt(message),
): string | null {
  return ask("Reason for hiding (optional):");
}

/** True when the steward confirms suspending this member. */
export function confirmSuspend(
  memberName: string,
  ask: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  return ask(`Suspend ${memberName}? They won't be able to sign in until you reinstate them.`);
}

/**
 * The words of the styled suspend confirmation (`MemberSuspendDialog`), kept
 * here so the copy is testable. The console no longer asks with the browser's
 * native confirm; `confirmSuspend` above stays as the injected-answer helper.
 */
export function suspendConfirmCopy(memberName: string): {
  title: string;
  description: string;
  confirmLabel: string;
} {
  return {
    title: `Suspend ${memberName}?`,
    description:
      "They won't be able to sign in until you reinstate them. Nothing is deleted, and you can reinstate them from the same menu.",
    confirmLabel: "Suspend",
  };
}
