import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/constants/query-keys";
import {
  getStaffAuthorization,
  adminDashboardStats,
  adminListUsers,
  adminListPosts,
  adminListSupportMessages,
} from "@/lib/admin.functions";
import { adminListSubscriptionPlans } from "@/lib/subscription-plans.functions";
import {
  adminAnalyticsSummary,
  adminBrowseTable,
  type BrowsableTable,
} from "@/lib/analytics.functions";

export function staffGateQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.staffGate,
    queryFn: () => getStaffAuthorization(),
  });
}

export function adminDashboardQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminDashboard,
    queryFn: () => adminDashboardStats(),
  });
}

export function adminMembersQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminUsers,
    queryFn: () => adminListUsers(),
  });
}

export function adminModerationQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminPosts,
    queryFn: () => adminListPosts(),
  });
}

export function adminSupportQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminSupportMessages,
    queryFn: () => adminListSupportMessages(),
  });
}

export function adminSubscriptionPlansQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminSubscriptionPlans,
    queryFn: () => adminListSubscriptionPlans(),
  });
}

export function adminAnalyticsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminAnalytics,
    queryFn: () => adminAnalyticsSummary(),
  });
}

export function adminAnalyticsTableQueryOptions(table: BrowsableTable, page: number) {
  return queryOptions({
    queryKey: queryKeys.adminAnalyticsTable(table, page),
    queryFn: () => adminBrowseTable({ data: { table, page } }),
  });
}
