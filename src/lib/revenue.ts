import { z } from "zod";

/**
 * How the tax deducted from gross revenue is expressed. The admin console
 * stores this in `platform_settings` (single row) and /analytics turns it into
 * the net figure; "amount" is a fixed deduction in major currency units and
 * "percent" is a share of gross.
 */
export const TAX_DEDUCTION_KINDS = ["percent", "amount"] as const;
export type TaxDeductionKind = (typeof TAX_DEDUCTION_KINDS)[number];

export const TAX_DEDUCTION_LABELS: Record<TaxDeductionKind, string> = {
  percent: "Percentage of gross",
  amount: "Fixed amount",
};

export const taxDeductionKindSchema = z.enum(TAX_DEDUCTION_KINDS);

/**
 * Upper bounds are the schema's own limits (NUMERIC(10,4), CHECK <= 1e6), so a
 * value the database would reject is refused with a readable message instead.
 */
export const taxDeductionValueSchema = z
  .number({ invalid_type_error: "Enter a number." })
  .finite("Enter a number.")
  .min(0, "Tax can't be negative.")
  .max(1_000_000, "Keep the tax under 1,000,000.");

export function describeTaxSetting(kind: TaxDeductionKind, value: number): string {
  if (value <= 0) return "No tax deducted";
  return kind === "percent"
    ? `${formatTaxNumber(value)}% of gross`
    : `${formatTaxNumber(value)} deducted from gross`;
}

function formatTaxNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

/**
 * Tax never exceeds gross: a 120% setting (or a fixed amount larger than the
 * revenue) would otherwise report a negative net, which reads as a refund to
 * the whole business.
 */
export function computeTaxDeductionCents(
  grossCents: number,
  kind: TaxDeductionKind,
  value: number,
): number {
  if (!Number.isFinite(value) || value <= 0 || grossCents <= 0) return 0;
  const raw = kind === "percent" ? (grossCents * value) / 100 : value * 100;
  return Math.min(grossCents, Math.max(0, Math.round(raw)));
}

/** What Paddle hands back on a transaction — only the fields the sums need. */
export interface PaddleTransactionLike {
  id?: string;
  status?: string;
  currency_code?: string;
  created_at?: string | null;
  details?: {
    totals?: {
      grand_total?: string | null;
      total?: string | null;
    } | null;
  } | null;
}

export interface CollectedRevenue {
  currency: string;
  grossCents: number;
  transactionCount: number;
  /** True when transactions of another currency were skipped. */
  mixedCurrencies: boolean;
}

/**
 * Paddle reports totals as integer strings in minor units ("1999" = $19.99).
 * `grand_total` is the amount actually charged (it folds in credits/balance
 * adjustments); `total` is the fallback when a transaction has no grand total.
 */
export function transactionAmountCents(transaction: PaddleTransactionLike): number | null {
  const totals = transaction.details?.totals;
  const raw = totals?.grand_total ?? totals?.total;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Only `completed` transactions count as revenue — draft, billed and canceled
 * ones never became money. When several currencies are present the dominant
 * one (by transaction count) is summed and the rest are reported as skipped,
 * because one number mixing currencies would be wrong, not just imprecise.
 */
export function collectCompletedRevenue(
  transactions: readonly PaddleTransactionLike[],
): CollectedRevenue {
  const completed = transactions.filter((t) => t.status === "completed");
  const countsByCurrency = new Map<string, number>();
  for (const t of completed) {
    const currency = (t.currency_code ?? "USD").toUpperCase();
    countsByCurrency.set(currency, (countsByCurrency.get(currency) ?? 0) + 1);
  }
  const [currency = "USD"] = [...countsByCurrency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);

  let grossCents = 0;
  let transactionCount = 0;
  let skippedOtherCurrency = false;
  for (const t of completed) {
    const amount = transactionAmountCents(t);
    if (amount === null) continue;
    if ((t.currency_code ?? "USD").toUpperCase() !== currency) {
      skippedOtherCurrency = true;
      continue;
    }
    grossCents += amount;
    transactionCount++;
  }

  return { currency, grossCents, transactionCount, mixedCurrencies: skippedOtherCurrency };
}
