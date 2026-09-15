import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  DollarSign,
  Images,
  MessageCircle,
  MessagesSquare,
  Palette,
  ShoppingBag,
  Tag,
  ListTree,
  Gauge,
  Cpu,
  Coins,
  Loader2,
} from "lucide-react";
import { adminAnalyticsQueryOptions } from "@/lib/queries/admin";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AnalyticsTableBrowser } from "@/components/admin/analytics-table-browser";
import { requireStaffRoutePermission } from "@/lib/staff-route";
import { formatPrice } from "@/lib/utils";

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

export const Route = createFileRoute("/_authed/analytics")({
  beforeLoad: ({ context }) => requireStaffRoutePermission(context.queryClient, "analytics.view"),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const { data: stats, isLoading } = useQuery(adminAnalyticsQueryOptions());

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-stone">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminStatCard
          icon={CreditCard}
          label="Active Subscriptions"
          value={stats?.activeSubscriptions ?? 0}
        />
        <AdminStatCard
          icon={DollarSign}
          label="MRR (estimate)"
          value={formatPrice(stats?.mrr ?? 0, stats?.mrrCurrency ?? "USD")}
          sublabel="Monthly + yearly plans normalized"
        />
        <AdminStatCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatPrice(
            (stats?.totalRevenueCents ?? 0) / 100,
            stats?.revenueCurrency ?? "USD",
          )}
          sublabel="Completed purchases"
        />
        <AdminStatCard icon={Images} label="Looks Generated" value={stats?.totalOutfits ?? 0} />
        <AdminStatCard
          icon={MessageCircle}
          label="Concierge Conversations"
          value={stats?.totalConciergeConversations ?? 0}
        />
        <AdminStatCard
          icon={MessagesSquare}
          label="Concierge Messages"
          value={stats?.totalConciergeMessages ?? 0}
        />
        <AdminStatCard
          icon={Palette}
          label="Saved Palettes"
          value={stats?.totalSavedPalettes ?? 0}
        />
        <AdminStatCard
          icon={ShoppingBag}
          label="Catalog Products"
          value={stats?.totalProducts ?? 0}
        />
        <AdminStatCard icon={Tag} label="Brands" value={stats?.totalBrands ?? 0} />
        <AdminStatCard
          icon={ListTree}
          label="Tagged Post Items"
          value={stats?.totalPostItems ?? 0}
        />
        <AdminStatCard
          icon={Gauge}
          label="Active Rate-Limit Buckets"
          value={stats?.activeRateLimitBuckets ?? 0}
          sublabel="Operational signal, not a business metric"
        />
        <AdminStatCard
          icon={Coins}
          label="Total AI Spend"
          value={formatAiSpend(stats?.totalAiSpendUsd ?? 0)}
          sublabel={`${stats?.totalAiCalls ?? 0} calls logged`}
        />
        <AdminStatCard
          icon={Cpu}
          label="Total AI Tokens"
          value={stats?.totalAiTokens ?? 0}
          sublabel="Gemini calls report tokens, no cost (model-dependent pricing)"
        />
      </div>

      <AnalyticsTableBrowser />
    </div>
  );
}
