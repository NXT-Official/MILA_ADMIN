import { expect, test } from "bun:test";
import { analyticsCards, dashboardCards } from "../components/admin/stat-cards";
import { STAFF_ROUTES } from "./authorization";
import {
  BROWSABLE_TABLES,
  SEARCH_COLUMNS,
  TABLE_DESCRIPTIONS,
  isBrowsableTable,
  sanitizeSearch,
} from "./database.functions";

test("every analytics and dashboard card opens something", () => {
  // The cards used to be decorative; an owner had to know which screen or
  // table held the number. Every card now names its destination, and a
  // database card names the table it opens.
  const cards = [...analyticsCards(undefined), ...dashboardCards(undefined)];
  expect(cards.length).toBeGreaterThan(10);
  for (const card of cards) {
    expect(STAFF_ROUTES).toContain(card.to);
    if (card.to === "/database") {
      expect(BROWSABLE_TABLES).toContain(card.table);
    }
    expect(card.label.length).toBeGreaterThan(0);
  }
});

test("cards read their values from the stats they are handed", () => {
  const [first] = analyticsCards({
    activeSubscriptions: 7,
    mrr: 42,
    mrrCurrency: "USD",
    totalRevenueCents: 123_400,
    revenueCurrency: "USD",
    totalOutfits: 3,
    totalConciergeConversations: 1,
    totalConciergeMessages: 2,
    totalSavedPalettes: 4,
    totalProducts: 5,
    totalBrands: 6,
    totalPostItems: 8,
    activeRateLimitBuckets: 9,
    totalAiCalls: 10,
    totalAiSpendUsd: 0.0042,
    totalAiTokens: 11,
    totalAnalyticsEventsLast30d: 12,
    analyticsEventsBySource: { web: 7, mobile: 5 },
    topAnalyticsEvents: [{ eventName: "signup", count: 3 }],
  });
  expect(first.label).toBe("Active Subscriptions");
  expect(first.value).toBe(7);

  const hiddenPosts = dashboardCards({
    totalMembers: 1,
    totalStewards: 1,
    aiCreditsAvailable: 1,
    totalPosts: 1,
    hiddenPosts: 4,
    openSupportMessages: 1,
    totalProducts: 9,
    recentMembers: [],
    recentPosts: [],
  }).find((card) => card.label === "Hidden Posts");
  expect(hiddenPosts?.value).toBe(4);
  expect(hiddenPosts?.to).toBe("/moderation");
});

test("the catalogue count opens the shop inventory from both screens", () => {
  const analyticsCatalogue = analyticsCards({
    activeSubscriptions: 0,
    mrr: 0,
    mrrCurrency: "USD",
    totalRevenueCents: 0,
    revenueCurrency: "USD",
    totalOutfits: 0,
    totalConciergeConversations: 0,
    totalConciergeMessages: 0,
    totalSavedPalettes: 0,
    totalProducts: 50,
    totalBrands: 9,
    totalPostItems: 0,
    activeRateLimitBuckets: 0,
    totalAiCalls: 0,
    totalAiSpendUsd: 0,
    totalAiTokens: 0,
    totalAnalyticsEventsLast30d: 0,
    analyticsEventsBySource: {},
    topAnalyticsEvents: [],
  }).find((card) => card.label === "Catalog Products");
  expect(analyticsCatalogue?.value).toBe(50);
  // The bare table shows rows; the shop screen shows the items and their links.
  expect(analyticsCatalogue?.to).toBe("/shop");

  const dashboardShop = dashboardCards({
    totalMembers: 0,
    totalStewards: 0,
    aiCreditsAvailable: 0,
    totalPosts: 0,
    hiddenPosts: 0,
    openSupportMessages: 0,
    totalProducts: 50,
    recentMembers: [],
    recentPosts: [],
  }).find((card) => card.label === "Shop Items");
  expect(dashboardShop?.value).toBe(50);
  expect(dashboardShop?.to).toBe("/shop");
});

test("every browsable table is described and searchable-declared", () => {
  for (const table of BROWSABLE_TABLES) {
    expect(TABLE_DESCRIPTIONS[table].length).toBeGreaterThan(0);
    expect(Array.isArray(SEARCH_COLUMNS[table])).toBe(true);
  }
  expect(isBrowsableTable("profiles")).toBe(true);
  expect(isBrowsableTable("pg_catalog")).toBe(false);
  expect(isBrowsableTable(7)).toBe(false);
});

test("a search term cannot break out of the PostgREST or-filter grammar", () => {
  // `.or()` joins `column.ilike.%term%` with commas and parens; a term carrying
  // either would change the filter, so both are stripped before the request.
  expect(sanitizeSearch("a,b(c)")).toBe("a b c");
  expect(sanitizeSearch("  mila  ")).toBe("mila");
  expect(sanitizeSearch(',()\\*"')).toBe("");
  expect(sanitizeSearch("%")).toBe("%");
});
