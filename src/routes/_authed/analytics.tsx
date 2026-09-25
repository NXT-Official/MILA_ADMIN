import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { adminAnalyticsQueryOptions } from "@/lib/queries/admin";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { analyticsCards } from "@/components/admin/stat-cards";
import { TableBrowser } from "@/components/admin/table-browser";
import { BROWSABLE_TABLES, type BrowsableTable } from "@/lib/database.functions";
import { requireStaffRoutePermission } from "@/lib/staff-route";

export const Route = createFileRoute("/_authed/analytics")({
  beforeLoad: ({ context }) => requireStaffRoutePermission(context.queryClient, "analytics.view"),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const { data: stats, isLoading } = useQuery(adminAnalyticsQueryOptions());
  const [table, setTable] = useState<BrowsableTable>(BROWSABLE_TABLES[0]);

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-stone">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p className="text-sm text-stone">
        Select any card to open the table behind its number. Every table is also browsable below.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {analyticsCards(stats).map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </div>

      <TableBrowser table={table} onTableChange={setTable} />
    </div>
  );
}
