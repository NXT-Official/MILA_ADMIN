import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin.functions";
import type { Database, Json } from "@/integrations/supabase/types";

const PAGE_SIZE = 50;

export const ANALYTICS_BROWSABLE_TABLES = [
  "subscriptions",
  "purchases",
  "products",
  "brands",
  "outfits",
  "post_items",
  "saved_palettes",
  "concierge_conversations",
  "concierge_messages",
  "staff_audit_log",
  "rate_limit_buckets",
] as const satisfies readonly (keyof Database["public"]["Tables"])[];
export type BrowsableTable = (typeof ANALYTICS_BROWSABLE_TABLES)[number];

/** Not every table shares a `created_at` column, so the sort column is per-table. */
const ORDER_COLUMN: Record<BrowsableTable, string> = {
  subscriptions: "created_at",
  purchases: "created_at",
  products: "date_added",
  brands: "created_at",
  outfits: "created_at",
  post_items: "created_at",
  saved_palettes: "created_at",
  concierge_conversations: "created_at",
  concierge_messages: "created_at",
  staff_audit_log: "created_at",
  rate_limit_buckets: "window_start",
};

export interface AdminAnalyticsSummary {
  activeSubscriptions: number;
  mrr: number;
  mrrCurrency: string;
  totalRevenueCents: number;
  revenueCurrency: string;
  totalOutfits: number;
  totalConciergeConversations: number;
  totalConciergeMessages: number;
  totalSavedPalettes: number;
  totalProducts: number;
  totalBrands: number;
  totalPostItems: number;
  activeRateLimitBuckets: number;
}

export const adminAnalyticsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAnalyticsSummary> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      activeSubs,
      purchasesRes,
      outfitsCount,
      conversationsCount,
      messagesCount,
      palettesCount,
      productsCount,
      brandsCount,
      postItemsCount,
      rateLimitCount,
    ] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("plan_id", { count: "exact" })
        .eq("status", "active"),
      supabaseAdmin.from("purchases").select("amount_cents,currency").eq("status", "completed"),
      supabaseAdmin.from("outfits").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("concierge_conversations").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("concierge_messages").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("saved_palettes").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("products").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("brands").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("post_items").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("rate_limit_buckets").select("*", { count: "exact", head: true }),
    ]);

    const planIds = [...new Set((activeSubs.data ?? []).map((s) => s.plan_id))];
    const plansRes = planIds.length
      ? await supabaseAdmin
          .from("subscription_plans")
          .select("id,price_amount,currency,billing_interval")
          .in("id", planIds)
      : { data: [] };
    const planById = new Map((plansRes.data ?? []).map((p) => [p.id, p]));

    let mrr = 0;
    let mrrCurrency = "USD";
    for (const sub of activeSubs.data ?? []) {
      const plan = planById.get(sub.plan_id);
      if (!plan) continue;
      mrrCurrency = plan.currency;
      if (plan.billing_interval === "monthly") mrr += plan.price_amount;
      else if (plan.billing_interval === "yearly") mrr += plan.price_amount / 12;
    }

    const totalRevenueCents = (purchasesRes.data ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
    const revenueCurrency = purchasesRes.data?.[0]?.currency ?? "USD";

    return {
      activeSubscriptions: activeSubs.count ?? 0,
      mrr,
      mrrCurrency,
      totalRevenueCents,
      revenueCurrency,
      totalOutfits: outfitsCount.count ?? 0,
      totalConciergeConversations: conversationsCount.count ?? 0,
      totalConciergeMessages: messagesCount.count ?? 0,
      totalSavedPalettes: palettesCount.count ?? 0,
      totalProducts: productsCount.count ?? 0,
      totalBrands: brandsCount.count ?? 0,
      totalPostItems: postItemsCount.count ?? 0,
      activeRateLimitBuckets: rateLimitCount.count ?? 0,
    };
  });

export interface BrowseTableResult {
  rows: Record<string, Json>[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminBrowseTable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        table: z.enum(ANALYTICS_BROWSABLE_TABLES),
        page: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<BrowseTableResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const from = data.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const {
      data: rows,
      count,
      error,
    } = await supabaseAdmin
      .from(data.table)
      .select("*", { count: "exact" })
      .order(ORDER_COLUMN[data.table], { ascending: false })
      .range(from, to);
    if (error) {
      console.error("[adminBrowseTable] query failed", data.table, error);
      throw new Error("Couldn't load that table.");
    }

    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });
