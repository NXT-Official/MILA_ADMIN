import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin.functions";
import { sanitizeSearch } from "@/lib/database.functions";
import { formatMoney } from "@/lib/shop-display";
import type { CsvColumn } from "@/lib/csv";
import type { Database } from "@/integrations/supabase/types";

export const SHOP_PAGE_SIZE = 50;
/** Export guard: a catalogue export is a snapshot for a spreadsheet, not a data dump. */
const EXPORT_LIMIT = 2000;

const SHOP_SELECT =
  "*, brands(name,website_url,affiliate_network,commission_rate,is_verified_seller,status)";

type BrandRow = Database["public"]["Tables"]["brands"]["Row"];
type ShopQueryRow = Database["public"]["Tables"]["products"]["Row"] & {
  brands: Pick<
    BrandRow,
    | "name"
    | "website_url"
    | "affiliate_network"
    | "commission_rate"
    | "is_verified_seller"
    | "status"
  > | null;
};

/**
 * One catalogue item with its brand flattened in, so the table, the detail
 * dialog and the CSV export all read from the same shape.
 */
export interface ShopItem {
  id: string;
  title: string;
  category: string;
  gender: string;
  price: number;
  currency: string;
  discount_percent: number | null;
  image_url: string | null;
  affiliate_link: string;
  in_stock: boolean;
  rating: number | null;
  units_sold: number | null;
  shipping_info: string | null;
  verification_status: string;
  last_verified_at: string | null;
  available_regions: string[];
  body_shapes: string[];
  seasonal_palettes: string[];
  description: string | null;
  date_added: string;
  brand_id: string;
  brand_name: string | null;
  brand_website: string | null;
  brand_affiliate_network: string | null;
  brand_commission_rate: number | null;
  brand_is_verified_seller: boolean;
  brand_status: string | null;
}

function toShopItem(row: ShopQueryRow): ShopItem {
  const brand = row.brands;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    gender: row.gender,
    price: row.price,
    currency: row.currency,
    discount_percent: row.discount_percent,
    image_url: row.image_url,
    affiliate_link: row.affiliate_link,
    in_stock: row.in_stock,
    rating: row.rating,
    units_sold: row.units_sold,
    shipping_info: row.shipping_info,
    verification_status: row.verification_status,
    last_verified_at: row.last_verified_at,
    available_regions: row.available_regions,
    body_shapes: row.body_shapes,
    seasonal_palettes: row.seasonal_palettes,
    description: row.description,
    date_added: row.date_added,
    brand_id: row.brand_id,
    brand_name: brand?.name ?? null,
    brand_website: brand?.website_url ?? null,
    brand_affiliate_network: brand?.affiliate_network ?? null,
    brand_commission_rate: brand?.commission_rate ?? null,
    brand_is_verified_seller: brand?.is_verified_seller ?? false,
    brand_status: brand?.status ?? null,
  };
}

/**
 * Filter values are free strings from the catalogue (categories and genders are
 * data, not enums), so they are only ever used as `eq` parameters — never
 * interpolated into a filter string.
 */
const ShopFilterInput = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  gender: z.string().trim().max(30).optional(),
  brand_id: z.string().uuid().optional(),
  stock: z.enum(["all", "in", "out"]).default("all"),
});
type ShopFilters = z.infer<typeof ShopFilterInput>;

async function fetchShopItems(filters: ShopFilters, range?: { from: number; to: number }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const term = filters.search ? sanitizeSearch(filters.search) : "";

  let query = supabaseAdmin
    .from("products")
    .select(SHOP_SELECT, { count: "exact" })
    .order("date_added", { ascending: false });

  if (term) {
    query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`);
  }
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.brand_id) query = query.eq("brand_id", filters.brand_id);
  if (filters.stock === "in") query = query.eq("in_stock", true);
  if (filters.stock === "out") query = query.eq("in_stock", false);

  const { data, count, error } = range
    ? await query.range(range.from, range.to)
    : await query.limit(EXPORT_LIMIT);
  if (error) {
    console.error("[shop] product query failed", error);
    throw new Error("Couldn't load the shop inventory.");
  }

  return { items: ((data ?? []) as ShopQueryRow[]).map(toShopItem), total: count ?? 0 };
}

export interface ShopItemsPage {
  items: ShopItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminListShopItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    ShopFilterInput.extend({ page: z.number().int().min(0) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ShopItemsPage> => {
    await assertAdmin(context.supabase, context.userId);
    const from = data.page * SHOP_PAGE_SIZE;
    const { items, total } = await fetchShopItems(data, {
      from,
      to: from + SHOP_PAGE_SIZE - 1,
    });
    return { items, total, page: data.page, pageSize: SHOP_PAGE_SIZE };
  });

export interface ShopExport {
  items: ShopItem[];
  /** True when the catalogue is larger than the export cap. */
  truncated: boolean;
}

export const adminExportShopItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ShopFilterInput.parse(input))
  .handler(async ({ data, context }): Promise<ShopExport> => {
    await assertAdmin(context.supabase, context.userId);
    const { items, total } = await fetchShopItems(data);
    return { items, truncated: total > items.length };
  });

export interface ShopOptions {
  categories: string[];
  genders: string[];
  brands: { id: string; name: string; status: string; is_verified_seller: boolean }[];
}

/** Client-side filter state; empty strings mean "no filter". */
export interface ShopFilterState {
  search: string;
  category: string;
  gender: string;
  brand_id: string;
  stock: "all" | "in" | "out";
}

export const EMPTY_SHOP_FILTERS: ShopFilterState = {
  search: "",
  category: "",
  gender: "",
  brand_id: "",
  stock: "all",
};

export function toShopFilterInput(filters: ShopFilterState): ShopFilters {
  return {
    search: filters.search || undefined,
    category: filters.category || undefined,
    gender: filters.gender || undefined,
    brand_id: filters.brand_id || undefined,
    stock: filters.stock,
  };
}

export function shopFiltersActive(filters: ShopFilterState): boolean {
  return Boolean(
    filters.search ||
    filters.category ||
    filters.gender ||
    filters.brand_id ||
    filters.stock !== "all",
  );
}

/** Spreadsheet layout: every visible field plus every link, so the shop can leave the console. */
export const SHOP_CSV_COLUMNS: CsvColumn<ShopItem>[] = [
  { key: "title", label: "Item", value: (item) => item.title },
  { key: "brand", label: "Brand", value: (item) => item.brand_name },
  { key: "category", label: "Category", value: (item) => item.category },
  { key: "gender", label: "Gender", value: (item) => item.gender },
  { key: "price", label: "Price", value: (item) => item.price },
  { key: "currency", label: "Currency", value: (item) => item.currency },
  { key: "discount", label: "Discount %", value: (item) => item.discount_percent },
  {
    key: "final_price",
    label: "Final price",
    value: (item) =>
      item.discount_percent
        ? formatMoney(item.price * (1 - item.discount_percent / 100), item.currency)
        : formatMoney(item.price, item.currency),
  },
  { key: "in_stock", label: "In stock", value: (item) => (item.in_stock ? "yes" : "no") },
  { key: "verification", label: "Verification", value: (item) => item.verification_status },
  { key: "rating", label: "Rating", value: (item) => item.rating },
  { key: "units_sold", label: "Units sold", value: (item) => item.units_sold },
  { key: "shipping", label: "Shipping", value: (item) => item.shipping_info },
  { key: "link", label: "Product link", value: (item) => item.affiliate_link },
  { key: "brand_site", label: "Brand site", value: (item) => item.brand_website },
  { key: "network", label: "Affiliate network", value: (item) => item.brand_affiliate_network },
  { key: "commission", label: "Commission %", value: (item) => item.brand_commission_rate },
  { key: "image", label: "Image URL", value: (item) => item.image_url },
  { key: "added", label: "Added", value: (item) => item.date_added },
  { key: "regions", label: "Regions", value: (item) => item.available_regions.join(", ") },
  { key: "body_shapes", label: "Body shapes", value: (item) => item.body_shapes.join(", ") },
  {
    key: "palettes",
    label: "Seasonal palettes",
    value: (item) => item.seasonal_palettes.join(", "),
  },
  { key: "verified_at", label: "Last verified", value: (item) => item.last_verified_at },
];

/** Values for the filter dropdowns, read from the catalogue itself. */
export const adminShopOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShopOptions> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [productsRes, brandsRes] = await Promise.all([
      supabaseAdmin.from("products").select("category,gender").limit(1000),
      supabaseAdmin.from("brands").select("id,name,status,is_verified_seller").order("name"),
    ]);
    if (productsRes.error || brandsRes.error) {
      console.error("[shop] options query failed", productsRes.error ?? brandsRes.error);
      throw new Error("Couldn't load the shop filters.");
    }

    const categories = [...new Set((productsRes.data ?? []).map((row) => row.category))].sort();
    const genders = [...new Set((productsRes.data ?? []).map((row) => row.gender))].sort();
    return { categories, genders, brands: brandsRes.data ?? [] };
  });
