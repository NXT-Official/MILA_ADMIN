import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EMPTY_SHOP_FILTERS,
  SHOP_CSV_COLUMNS,
  shopFiltersActive,
  toShopFilterInput,
  type ShopItem,
} from "./shop.functions";
import { toCsv } from "./csv";
import { formatShopListPrice, formatShopPrice, linkHost } from "./shop-display";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const sampleItem: ShopItem = {
  id: "5f2b2e2a-2f4b-4a5a-9d2e-6f2a2b2e2a2f",
  title: 'Silk "Bias" Dress',
  category: "Dresses",
  gender: "Female",
  price: 248,
  currency: "USD",
  discount_percent: 20,
  image_url: "https://cdn.example.com/silk-dress.jpg",
  affiliate_link: "https://www.reformation.com/ref123?utm_source=mila",
  in_stock: true,
  rating: 4.5,
  units_sold: 1200,
  shipping_info: "Free returns",
  verification_status: "verified",
  last_verified_at: "2026-09-20T10:00:00Z",
  available_regions: ["US", "AE"],
  body_shapes: ["hourglass"],
  seasonal_palettes: ["warm-autumn"],
  description: "Bias-cut silk dress.",
  date_added: "2026-09-01T09:00:00Z",
  brand_id: "0b0b0b0b-1b1b-4b1b-8b1b-2b2b2b2b2b2b",
  brand_name: "Reformation",
  brand_website: "https://www.reformation.com",
  brand_affiliate_network: "Impact",
  brand_commission_rate: 6,
  brand_is_verified_seller: true,
  brand_status: "active",
};

test("the shop export carries every link, not just the labels", () => {
  const csv = toCsv(SHOP_CSV_COLUMNS, [sampleItem]);
  const [header, row] = csv.split("\n");
  expect(header).toContain('"Product link"');
  expect(header).toContain('"Brand site"');
  expect(header).toContain('"Image URL"');
  expect(row).toContain(sampleItem.affiliate_link);
  expect(row).toContain(sampleItem.brand_website!);
  expect(row).toContain(sampleItem.image_url!);
  // Owners read the discounted number, so the export computes it too.
  expect(row).toContain("$198.40");
  expect(row).toContain('"20"');
});

test("csv cells survive quotes, commas and newlines", () => {
  const csv = toCsv(SHOP_CSV_COLUMNS, [sampleItem]);
  const row = csv.split("\n")[1];
  expect(row).toContain('"Silk ""Bias"" Dress"');
  expect(csv.split("\n").length).toBe(2);
});

test("empty filter strings mean 'no filter' on the wire", () => {
  expect(toShopFilterInput(EMPTY_SHOP_FILTERS)).toEqual({
    search: undefined,
    category: undefined,
    gender: undefined,
    brand_id: undefined,
    stock: "all",
  });
  expect(shopFiltersActive(EMPTY_SHOP_FILTERS)).toBe(false);
  expect(shopFiltersActive({ ...EMPTY_SHOP_FILTERS, gender: "Female" })).toBe(true);
  expect(shopFiltersActive({ ...EMPTY_SHOP_FILTERS, stock: "out" })).toBe(true);
});

test("every shop server function re-checks admin on the server", () => {
  // The client's route guard is UX only; each server function is the boundary.
  const module = source("./shop.functions.ts");
  const handlers = module.match(/\.handler\(/g) ?? [];
  const adminChecks = module.match(/await assertAdmin\(/g) ?? [];
  expect(handlers.length).toBeGreaterThanOrEqual(3);
  expect(adminChecks.length).toBe(handlers.length);
});

test("the shop screen is reachable from the sidebar and the header names it", () => {
  expect(source("../components/staff/staff-sidebar.tsx")).toContain('to: "/shop"');
  expect(source("../components/staff/staff-header.tsx")).toContain('"/shop":');
});

test("links are labelled by the host a steward would be sent to", () => {
  expect(linkHost("https://www.reformation.com/ref123?utm_source=mila")).toBe("reformation.com");
  expect(linkHost("https://cdn.example.com/x.jpg")).toBe("cdn.example.com");
  expect(linkHost(null)).toBe("—");
  // Unparseable values stay visible rather than silently rendering blank.
  expect(linkHost("not a url")).toBe("not a url");
});

test("prices show the discounted number and keep the original for context", () => {
  expect(formatShopPrice(sampleItem)).toBe("$198.40");
  expect(formatShopListPrice(sampleItem)).toBe("$248.00");
  expect(formatShopPrice({ ...sampleItem, discount_percent: null, currency: "AED" })).toBe(
    "AED 248.00",
  );
});
