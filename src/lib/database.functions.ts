import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin.functions";
import type { Database, Json } from "@/integrations/supabase/types";

const PAGE_SIZE = 50;

/**
 * The database viewer behind `/database`. Business-first order: the tables an
 * owner reaches for most sit at the top, operational plumbing at the bottom.
 */
export const BROWSABLE_TABLES = [
  "subscriptions",
  "purchases",
  "subscription_plans",
  "products",
  "brands",
  "outfits",
  "post_items",
  "posts",
  "saved_palettes",
  "concierge_conversations",
  "concierge_messages",
  "profiles",
  "user_roles",
  "user_entitlements",
  "support_messages",
  "staff_audit_log",
  "ai_spend_log",
  "analytics_events",
  "rate_limit_buckets",
] as const satisfies readonly (keyof Database["public"]["Tables"])[];
export type BrowsableTable = (typeof BROWSABLE_TABLES)[number];

export function isBrowsableTable(value: unknown): value is BrowsableTable {
  return typeof value === "string" && (BROWSABLE_TABLES as readonly string[]).includes(value);
}

/** One line of plain English per table, shown beside the selector. */
export const TABLE_DESCRIPTIONS: Record<BrowsableTable, string> = {
  subscriptions: "Member subscriptions and their status",
  purchases: "Credit purchases, completed and pending",
  subscription_plans: "Membership plan catalog",
  products: "Catalog products used in looks and dupe matches",
  brands: "Fashion brands in the catalog",
  outfits: "Generated looks — one row per generation",
  post_items: "Products tagged inside feed posts",
  posts: "Feed posts published by members",
  saved_palettes: "Colour palettes members have saved",
  concierge_conversations: "Concierge chat threads",
  concierge_messages: "Individual concierge messages",
  profiles: "Member profiles and style settings",
  user_roles: "Staff roles — Steward and Moderator",
  user_entitlements: "Credit balances and look flags",
  support_messages: "Help desk and feedback messages",
  staff_audit_log: "Every privileged staff action",
  ai_spend_log: "AI calls with token usage and cost",
  analytics_events: "Product analytics events, web and mobile",
  rate_limit_buckets: "Live rate-limit counters",
};

/** Not every table shares a `created_at` column, so the sort column is per-table. */
const ORDER_COLUMN: Record<BrowsableTable, string> = {
  subscriptions: "created_at",
  purchases: "created_at",
  subscription_plans: "created_at",
  products: "date_added",
  brands: "created_at",
  outfits: "created_at",
  post_items: "created_at",
  posts: "created_at",
  saved_palettes: "created_at",
  concierge_conversations: "created_at",
  concierge_messages: "created_at",
  profiles: "created_at",
  user_roles: "created_at",
  user_entitlements: "created_at",
  support_messages: "created_at",
  staff_audit_log: "created_at",
  ai_spend_log: "created_at",
  analytics_events: "created_at",
  rate_limit_buckets: "window_start",
};

/**
 * Text columns only. `ilike` against a uuid, enum, boolean, numeric or jsonb
 * column fails at the database with 42883 ("operator does not exist"), so
 * those are deliberately absent — `user_roles` and `user_entitlements` have no
 * text column at all and the viewer disables search for them.
 */
export const SEARCH_COLUMNS: Record<BrowsableTable, readonly string[]> = {
  subscriptions: ["status", "paddle_customer_id", "paddle_subscription_id"],
  purchases: ["status"],
  subscription_plans: ["title", "slug", "description"],
  products: ["title", "category", "description"],
  brands: ["name", "status", "website_url", "affiliate_network"],
  outfits: ["image_url"],
  post_items: ["category", "label", "source_url"],
  posts: ["caption"],
  saved_palettes: ["style_vibe"],
  concierge_conversations: ["title"],
  concierge_messages: ["content", "role"],
  profiles: ["full_name", "username"],
  user_roles: [],
  user_entitlements: [],
  support_messages: ["message", "kind"],
  staff_audit_log: ["action", "target_type", "target_id"],
  ai_spend_log: ["model", "provider"],
  analytics_events: ["event_name", "source"],
  rate_limit_buckets: ["key"],
};

/** Commas, parens and quotes would break PostgREST's `or` filter grammar. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[,()\\*"]/g, " ").trim();
}

const BrowseTableInput = z.object({
  table: z.enum(BROWSABLE_TABLES),
  page: z.number().int().min(0),
  search: z.string().trim().max(100).optional(),
});

export interface BrowseTableResult {
  rows: Record<string, Json>[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * One page of one table, newest first, optionally filtered by a text search
 * across that table's searchable columns.
 */
export const adminBrowseTable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BrowseTableInput.parse(input))
  .handler(async ({ data, context }): Promise<BrowseTableResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const term = data.search ? sanitizeSearch(data.search) : "";
    const searchable = SEARCH_COLUMNS[data.table];
    const filter =
      term && searchable.length
        ? searchable.map((column) => `${column}.ilike.%${term}%`).join(",")
        : null;

    const from = data.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const query = supabaseAdmin.from(data.table).select("*", { count: "exact" });
    const {
      data: rows,
      count,
      error,
    } = await (filter ? query.or(filter) : query)
      .order(ORDER_COLUMN[data.table], { ascending: false })
      .range(from, to);
    if (error) {
      console.error("[adminBrowseTable] query failed", data.table, error);
      throw new Error("Couldn't load that table.");
    }

    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });
