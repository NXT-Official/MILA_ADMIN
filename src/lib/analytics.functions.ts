import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin.functions";
import { computeMrr } from "@/lib/mrr";
import { describePaddleError, isPaddleConfigured, paddleListAll } from "@/lib/paddle.server";
import {
  collectCompletedRevenue,
  computeTaxDeductionCents,
  type PaddleTransactionLike,
  type TaxDeductionKind,
} from "@/lib/revenue";

const ANALYTICS_EVENTS_WINDOW_DAYS = 30;
/** Newest completed Paddle payments summed per load; see `revenue.truncated`. */
const REVENUE_MAX_PAGES = 5;

/**
 * Revenue as staff report it: gross (money Paddle actually collected), the tax
 * deducted according to `platform_settings`, and the net that remains.
 * `available: false` means this deployment has no Paddle keys, so the screens
 * say so instead of showing a confident zero.
 */
export interface AdminRevenueSummary {
  available: boolean;
  note: string | null;
  currency: string;
  grossCents: number;
  taxCents: number;
  netCents: number;
  taxKind: TaxDeductionKind;
  taxValue: number;
  transactionCount: number;
  mixedCurrencies: boolean;
  truncated: boolean;
}

export interface AdminAnalyticsSummary {
  activeSubscriptions: number;
  /** Monthly recurring revenue from billed plans, in cents. Granted plans earn nothing. */
  mrrCents: number;
  mrrCurrency: string;
  revenue: AdminRevenueSummary;
  totalOutfits: number;
  totalConciergeConversations: number;
  totalConciergeMessages: number;
  totalSavedPalettes: number;
  totalProducts: number;
  totalBrands: number;
  totalPostItems: number;
  activeRateLimitBuckets: number;
  totalAiCalls: number;
  totalAiSpendUsd: number;
  totalAiTokens: number;
  /** Total AI spend divided by logged calls — the per-call unit cost. */
  aiCostPerCallUsd: number | null;
  /** Product analytics, last ANALYTICS_EVENTS_WINDOW_DAYS days. */
  totalAnalyticsEventsLast30d: number;
  analyticsEventsBySource: { web: number; mobile: number };
  topAnalyticsEvents: { eventName: string; count: number }[];
}

export const adminAnalyticsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAnalyticsSummary> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      activeSubs,
      outfitsCount,
      conversationsCount,
      messagesCount,
      palettesCount,
      productsCount,
      brandsCount,
      postItemsCount,
      rateLimitCount,
      aiSpendRes,
      analyticsEventsRes,
      platformSettingsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("plan_id,paddle_subscription_id", { count: "exact" })
        .eq("status", "active"),
      supabaseAdmin.from("outfits").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("concierge_conversations").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("concierge_messages").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("saved_palettes").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("products").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("brands").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("post_items").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("rate_limit_buckets").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("ai_spend_log").select("cost_usd,total_tokens", { count: "exact" }),
      supabaseAdmin
        .from("analytics_events")
        .select("event_name,source", { count: "exact" })
        .gte(
          "created_at",
          new Date(Date.now() - ANALYTICS_EVENTS_WINDOW_DAYS * 86_400_000).toISOString(),
        ),
      // The tax that turns gross into net is set on /ai-settings.
      supabaseAdmin
        .from("platform_settings")
        .select("tax_deduction_kind,tax_deduction_value")
        .eq("id", true)
        .maybeSingle(),
    ]);

    const planIds = [...new Set((activeSubs.data ?? []).map((s) => s.plan_id))];
    const plansRes = planIds.length
      ? await supabaseAdmin
          .from("subscription_plans")
          .select("id,price_amount,currency,billing_interval")
          .in("id", planIds)
      : { data: [] };

    const { cents: mrrCents, currency: mrrCurrency } = computeMrr(
      activeSubs.data ?? [],
      plansRes.data ?? [],
    );

    const revenue = await loadRevenueSummary(platformSettingsRes.data);

    const analyticsEventsBySource = { web: 0, mobile: 0 };
    const eventCounts = new Map<string, number>();
    for (const row of analyticsEventsRes.data ?? []) {
      if (row.source === "web") analyticsEventsBySource.web++;
      else if (row.source === "mobile") analyticsEventsBySource.mobile++;
      eventCounts.set(row.event_name, (eventCounts.get(row.event_name) ?? 0) + 1);
    }
    const topAnalyticsEvents = [...eventCounts.entries()]
      .map(([eventName, count]) => ({ eventName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const totalAiCalls = aiSpendRes.count ?? 0;
    const totalAiSpendUsd = (aiSpendRes.data ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

    return {
      activeSubscriptions: activeSubs.count ?? 0,
      mrrCents,
      mrrCurrency,
      revenue,
      totalOutfits: outfitsCount.count ?? 0,
      totalConciergeConversations: conversationsCount.count ?? 0,
      totalConciergeMessages: messagesCount.count ?? 0,
      totalSavedPalettes: palettesCount.count ?? 0,
      totalProducts: productsCount.count ?? 0,
      totalBrands: brandsCount.count ?? 0,
      totalPostItems: postItemsCount.count ?? 0,
      activeRateLimitBuckets: rateLimitCount.count ?? 0,
      totalAiCalls,
      totalAiSpendUsd,
      totalAiTokens: (aiSpendRes.data ?? []).reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
      aiCostPerCallUsd: totalAiCalls > 0 ? totalAiSpendUsd / totalAiCalls : null,
      totalAnalyticsEventsLast30d: analyticsEventsRes.count ?? 0,
      analyticsEventsBySource,
      topAnalyticsEvents,
    };
  });

/**
 * Gross comes from Paddle, not from `purchases`: nothing in either app writes
 * a purchase row yet (checkout still runs through Paddle's hosted flow), so
 * summing that table would quietly report zero forever. Paddle's completed
 * transactions are the money that actually moved.
 */
async function loadRevenueSummary(
  settings: { tax_deduction_kind: string; tax_deduction_value: number } | null | undefined,
): Promise<AdminRevenueSummary> {
  const taxKind: TaxDeductionKind =
    settings?.tax_deduction_kind === "amount" ? "amount" : "percent";
  const taxValue = settings?.tax_deduction_value ?? 0;
  const unavailable = (note: string): AdminRevenueSummary => ({
    available: false,
    note,
    currency: "USD",
    grossCents: 0,
    taxCents: 0,
    netCents: 0,
    taxKind,
    taxValue,
    transactionCount: 0,
    mixedCurrencies: false,
    truncated: false,
  });

  if (!isPaddleConfigured()) {
    return unavailable(
      "Paddle keys aren't set on this deployment, so revenue can't be read. Add PADDLE_ENV and the matching API key to the admin app (see .env.example).",
    );
  }

  try {
    const { data, truncated } = await paddleListAll<PaddleTransactionLike>(
      "/transactions",
      { status: "completed", order_by: "created_at[DESC]", per_page: 30 },
      REVENUE_MAX_PAGES,
    );
    const collected = collectCompletedRevenue(data);
    const taxCents = computeTaxDeductionCents(collected.grossCents, taxKind, taxValue);
    const notes: string[] = [];
    if (truncated) notes.push("Totals cover the newest completed payments only.");
    if (collected.mixedCurrencies)
      notes.push(`Only ${collected.currency} payments are summed — other currencies are excluded.`);
    return {
      available: true,
      note: notes.length > 0 ? notes.join(" ") : null,
      currency: collected.currency,
      grossCents: collected.grossCents,
      taxCents,
      netCents: collected.grossCents - taxCents,
      taxKind,
      taxValue,
      transactionCount: collected.transactionCount,
      mixedCurrencies: collected.mixedCurrencies,
      truncated,
    };
  } catch (error) {
    console.error("[analytics] paddle revenue read failed", error);
    return unavailable(describePaddleError(error, "Couldn't read revenue from Paddle."));
  }
}
