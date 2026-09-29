import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import type { AdminRevenueSummary } from "@/lib/analytics.functions";
import { describeTaxSetting } from "@/lib/revenue";
import { formatPrice } from "@/lib/utils";

function Figure({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-panel border border-porcelain/60 bg-background/40 px-4 py-3">
      <div className="text-nano uppercase tracking-label-xwide text-stone">{label}</div>
      <div className={`mt-1 font-serif text-ink ${emphasize ? "text-3xl" : "text-2xl"}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-stone">{hint}</div>
    </div>
  );
}

/**
 * Gross → tax → net, read straight from Paddle's completed transactions and
 * the tax setting on /ai-settings. The "purchases" table is deliberately not
 * the source: nothing writes it yet, so it would report a permanent zero.
 */
export function RevenuePanel({ revenue }: { revenue: AdminRevenueSummary | undefined }) {
  if (!revenue) return null;

  return (
    <section className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Revenue</h2>
        <Link
          to="/ai-settings"
          className="text-xs text-stone underline-offset-4 hover:text-ink hover:underline"
        >
          Change the tax deduction
        </Link>
      </header>

      {revenue.available ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Figure
              label="Gross"
              value={formatPrice(revenue.grossCents / 100, revenue.currency)}
              hint={`${revenue.transactionCount} completed Paddle payments`}
            />
            <Figure
              label="Tax deducted"
              value={formatPrice(revenue.taxCents / 100, revenue.currency)}
              hint={describeTaxSetting(revenue.taxKind, revenue.taxValue)}
            />
            <Figure
              label="Net"
              value={formatPrice(revenue.netCents / 100, revenue.currency)}
              hint="Gross minus the deduction"
              emphasize
            />
          </div>
          {revenue.note && (
            <p className="mt-3 text-micro uppercase tracking-label text-stone">{revenue.note}</p>
          )}
        </>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-xs text-stone">
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {revenue.note}
        </p>
      )}
    </section>
  );
}
