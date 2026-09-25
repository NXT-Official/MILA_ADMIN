import {
  Activity,
  Coins,
  Cpu,
  CreditCard,
  DollarSign,
  EyeOff,
  Gauge,
  Images,
  LifeBuoy,
  ListTree,
  MessageCircle,
  MessagesSquare,
  Palette,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminDashboardStats } from "@/lib/admin.functions";
import type { AdminAnalyticsSummary } from "@/lib/analytics.functions";
import type { BrowsableTable } from "@/lib/database.functions";
import type { StaffRoute } from "@/lib/authorization";
import { formatPrice } from "@/lib/utils";

/**
 * Every stat card is a door. Analytics cards open the table that backs their
 * number in the database viewer; dashboard cards open the screen where the
 * number is managed. `table` is required exactly when `to` is `/database`, so
 * a card added without a destination fails to compile.
 */
export type StatCard = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
} & ({ to: "/database"; table: BrowsableTable } | { to: Exclude<StaffRoute, "/database"> });

// AI spend accrues in fractions of a cent per call — formatPrice's
// whole-dollar rounding would show "$0" for a long time, which is
// inaccurate, not just imprecise.
function formatAiSpend(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(usd);
}

export function analyticsCards(stats: AdminAnalyticsSummary | undefined): StatCard[] {
  return [
    {
      icon: CreditCard,
      label: "Active Subscriptions",
      value: stats?.activeSubscriptions ?? 0,
      to: "/database",
      table: "subscriptions",
    },
    {
      icon: DollarSign,
      label: "MRR (estimate)",
      value: formatPrice(stats?.mrr ?? 0, stats?.mrrCurrency ?? "USD"),
      sublabel: "Monthly + yearly plans normalized",
      to: "/database",
      table: "subscriptions",
    },
    {
      icon: DollarSign,
      label: "Total Revenue",
      value: formatPrice((stats?.totalRevenueCents ?? 0) / 100, stats?.revenueCurrency ?? "USD"),
      sublabel: "Completed purchases",
      to: "/database",
      table: "purchases",
    },
    {
      icon: Images,
      label: "Looks Generated",
      value: stats?.totalOutfits ?? 0,
      to: "/database",
      table: "outfits",
    },
    {
      icon: MessageCircle,
      label: "Concierge Conversations",
      value: stats?.totalConciergeConversations ?? 0,
      to: "/database",
      table: "concierge_conversations",
    },
    {
      icon: MessagesSquare,
      label: "Concierge Messages",
      value: stats?.totalConciergeMessages ?? 0,
      to: "/database",
      table: "concierge_messages",
    },
    {
      icon: Palette,
      label: "Saved Palettes",
      value: stats?.totalSavedPalettes ?? 0,
      to: "/database",
      table: "saved_palettes",
    },
    {
      icon: ShoppingBag,
      label: "Catalog Products",
      value: stats?.totalProducts ?? 0,
      to: "/database",
      table: "products",
    },
    {
      icon: Tag,
      label: "Brands",
      value: stats?.totalBrands ?? 0,
      to: "/database",
      table: "brands",
    },
    {
      icon: ListTree,
      label: "Tagged Post Items",
      value: stats?.totalPostItems ?? 0,
      to: "/database",
      table: "post_items",
    },
    {
      icon: Gauge,
      label: "Active Rate-Limit Buckets",
      value: stats?.activeRateLimitBuckets ?? 0,
      sublabel: "Operational signal, not a business metric",
      to: "/database",
      table: "rate_limit_buckets",
    },
    {
      icon: Coins,
      label: "Total AI Spend",
      value: formatAiSpend(stats?.totalAiSpendUsd ?? 0),
      sublabel: `${stats?.totalAiCalls ?? 0} calls logged`,
      to: "/database",
      table: "ai_spend_log",
    },
    {
      icon: Cpu,
      label: "Total AI Tokens",
      value: stats?.totalAiTokens ?? 0,
      sublabel: "Gemini calls report tokens, no cost (model-dependent pricing)",
      to: "/database",
      table: "ai_spend_log",
    },
    {
      icon: Activity,
      label: "Product Events (30d)",
      value: stats?.totalAnalyticsEventsLast30d ?? 0,
      sublabel: "signup, onboarding, look-generated, purchase-started",
      to: "/database",
      table: "analytics_events",
    },
    {
      icon: Smartphone,
      label: "Web vs Mobile Events (30d)",
      value: `${stats?.analyticsEventsBySource.web ?? 0} / ${stats?.analyticsEventsBySource.mobile ?? 0}`,
      sublabel: "web / mobile",
      to: "/database",
      table: "analytics_events",
    },
    {
      icon: TrendingUp,
      label: "Top Event (30d)",
      value: stats?.topAnalyticsEvents[0]?.eventName ?? "—",
      sublabel: stats?.topAnalyticsEvents[0]
        ? `${stats.topAnalyticsEvents[0].count} occurrences`
        : "No events yet",
      to: "/database",
      table: "analytics_events",
    },
  ];
}

export function dashboardCards(stats: AdminDashboardStats | undefined): StatCard[] {
  return [
    {
      icon: Users,
      label: "Total Members",
      value: stats?.totalMembers ?? 0,
      to: "/members",
    },
    {
      icon: ShieldCheck,
      label: "Stewards",
      value: stats?.totalStewards ?? 0,
      to: "/members",
    },
    {
      icon: Coins,
      label: "AI Credits Available",
      value: stats?.aiCreditsAvailable ?? 0,
      sublabel: "Current balance across members",
      to: "/members",
    },
    {
      icon: Images,
      label: "Feed Posts",
      value: stats?.totalPosts ?? 0,
      to: "/moderation",
    },
    {
      icon: EyeOff,
      label: "Hidden Posts",
      value: stats?.hiddenPosts ?? 0,
      sublabel: "Moderation actions taken",
      to: "/moderation",
    },
    {
      icon: LifeBuoy,
      label: "Open Support Messages",
      value: stats?.openSupportMessages ?? 0,
      to: "/support",
    },
  ];
}
