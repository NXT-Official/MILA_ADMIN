import { expect, test } from "bun:test";
import { analyticsCards, dashboardCards } from "../components/admin/stat-cards";
import type { AdminAnalyticsSummary } from "./analytics.functions";
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
    mrrCents: 4_200,
    mrrByCurrency: [],
    mrrCurrency: "USD",
    revenue: {
      available: true,
      note: null,
      currency: "USD",
      grossCents: 123_400,
      taxCents: 9_255,
      netCents: 114_145,
      taxKind: "percent",
      taxValue: 7.5,
      transactionCount: 3,
      mixedCurrencies: false,
      truncated: false,
    },
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

  // A refund or a plan change moves the tax card's description, and the
  // per-call figure is the total spend over the calls that could be priced.
  const cards = analyticsCards({
    activeSubscriptions: 0,
    mrrCents: 0,
    mrrByCurrency: [],
    mrrCurrency: "USD",
    revenue: {
      available: true,
      note: null,
      currency: "USD",
      grossCents: 0,
      taxCents: 0,
      netCents: 0,
      taxKind: "amount",
      taxValue: 12.5,
      transactionCount: 0,
      mixedCurrencies: false,
      truncated: false,
    },
    totalOutfits: 0,
    totalConciergeConversations: 0,
    totalConciergeMessages: 0,
    totalSavedPalettes: 0,
    totalProducts: 0,
    totalBrands: 0,
    totalPostItems: 0,
    activeRateLimitBuckets: 0,
    totalAiCalls: 4,
    totalAiSpendUsd: 0.0042,
    totalAiTokens: 0,
    aiCostPerCallUsd: 0.00105,
    totalAnalyticsEventsLast30d: 0,
    analyticsEventsBySource: {},
    topAnalyticsEvents: [],
  });
  const taxCard = cards.find((card) => card.label === "Revenue Tax");
  expect(taxCard?.value).toBe("12.5 deducted from gross");
  expect(taxCard?.to).toBe("/ai-settings");
  const perCall = cards.find((card) => card.label === "AI Cost per Call");
  expect(perCall?.value).toBe("$0.0011");
  expect(perCall?.to).toBe("/database");

  const [noSpendYet] = analyticsCards({
    activeSubscriptions: 0,
    mrrCents: 0,
    mrrByCurrency: [],
    mrrCurrency: "USD",
    revenue: {
      available: false,
      note: null,
      currency: "USD",
      grossCents: 0,
      taxCents: 0,
      netCents: 0,
      taxKind: "percent",
      taxValue: 0,
      transactionCount: 0,
      mixedCurrencies: false,
      truncated: false,
    },
    totalOutfits: 0,
    totalConciergeConversations: 0,
    totalConciergeMessages: 0,
    totalSavedPalettes: 0,
    totalProducts: 0,
    totalBrands: 0,
    totalPostItems: 0,
    activeRateLimitBuckets: 0,
    totalAiCalls: 0,
    totalAiSpendUsd: 0,
    totalAiTokens: 0,
    aiCostPerCallUsd: null,
    totalAnalyticsEventsLast30d: 0,
    analyticsEventsBySource: {},
    topAnalyticsEvents: [],
  });
  expect(noSpendYet.label).toBe("Active Subscriptions");

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
    mrrCents: 0,
    mrrByCurrency: [],
    mrrCurrency: "USD",
    revenue: {
      available: false,
      note: "Paddle keys aren't set on this deployment, so revenue can't be read.",
      currency: "USD",
      grossCents: 0,
      taxCents: 0,
      netCents: 0,
      taxKind: "percent",
      taxValue: 0,
      transactionCount: 0,
      mixedCurrencies: false,
      truncated: false,
    },
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

const quietStats: AdminAnalyticsSummary = {
  activeSubscriptions: 0,
  mrrCents: 0,
  mrrByCurrency: [],
  mrrCurrency: "usd",
  revenue: {
    available: false,
    note: null,
    currency: "USD",
    grossCents: 0,
    taxCents: 0,
    netCents: 0,
    taxKind: "percent",
    taxValue: 0,
    transactionCount: 0,
    mixedCurrencies: false,
    truncated: false,
  },
  totalOutfits: 0,
  totalConciergeConversations: 0,
  totalConciergeMessages: 0,
  totalSavedPalettes: 0,
  totalProducts: 0,
  totalBrands: 0,
  totalPostItems: 0,
  activeRateLimitBuckets: 0,
  totalAiCalls: 0,
  totalAiSpendUsd: 0,
  totalAiTokens: 0,
  aiCostPerCallUsd: null,
  totalAnalyticsEventsLast30d: 0,
  analyticsEventsBySource: { web: 0, mobile: 0 },
  topAnalyticsEvents: [],
};

const mrrCardValue = (mrrCents: number | undefined) =>
  analyticsCards(mrrCents === undefined ? undefined : { ...quietStats, mrrCents }).find(
    (card) => card.label === "MRR (estimate)",
  )?.value;

test("the MRR card shows dollars, not the cents the plans are stored in", () => {
  // One $49.99 member used to read as "$5,000": plan prices are cents.
  expect(mrrCardValue(4_999)).toBe("$49.99");
  expect(mrrCardValue(120_000)).toBe("$1,200.00");
  expect(mrrCardValue(0)).toBe("$0.00");
  expect(mrrCardValue(undefined)).toBe("$0.00");
});

test("the MRR card says what it leaves out", () => {
  const mrr = analyticsCards(undefined).find((card) => card.label.startsWith("MRR"));
  expect(mrr?.sublabel).toContain("Trials");
  expect(mrr?.sublabel).toContain("staff grants");
});

test("the MRR card shows one figure per currency, never a mixed sum", () => {
  const stats = {
    ...quietStats,
    mrrCents: 123_400,
    mrrCurrency: "USD",
    mrrByCurrency: [
      { currency: "USD", cents: 123_400 },
      { currency: "EUR", cents: 5_600 },
    ],
  };
  const card = analyticsCards(stats).find((item) => item.label.startsWith("MRR"));
  expect(card?.value).toBe("$1,234.00 · €56.00");
});
