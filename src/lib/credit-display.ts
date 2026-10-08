/**
 * The Credits column's words. A member's spendable balance is two different
 * things: what is left of today's daily allowance (it resets every UTC day) and
 * what they bought (it never expires). One sum hides which is which, and staff
 * need that to answer "why can't she style?".
 */
const whole = (value: number) => Math.max(0, Math.round(value));

export function describeMemberCredits(input: { daily: number; purchased: number }): {
  total: number;
  dailyLabel: string;
  purchasedLabel: string;
  summary: string;
} {
  const daily = whole(input.daily);
  const purchased = whole(input.purchased);
  const total = daily + purchased;
  const dailyLabel = `${daily} left today`;
  const purchasedLabel = `${purchased} purchased`;
  return {
    total,
    dailyLabel,
    purchasedLabel,
    summary: `${total} credit${total === 1 ? "" : "s"}: ${dailyLabel} and ${purchasedLabel}`,
  };
}
