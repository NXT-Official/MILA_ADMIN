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
import { adminAnalyticsSummary } from "@/lib/analytics.functions";
import { adminAiSettings } from "@/lib/ai-settings.functions";
import { adminGetMemberBilling } from "@/lib/member-billing.functions";
import { adminBrowseTable, type BrowsableTable } from "@/lib/database.functions";
import {
  adminListShopItems,
  adminShopOptions,
  toShopFilterInput,
  type ShopFilterState,
} from "@/lib/shop.functions";

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

export function adminAiSettingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminAiSettings,
    queryFn: () => adminAiSettings(),
  });
}

export function adminMemberBillingQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: queryKeys.adminMemberBilling(userId),
    queryFn: () => adminGetMemberBilling({ data: { user_id: userId ?? "" } }),
    enabled: !!userId,
  });
}

export function adminTableQueryOptions(table: BrowsableTable, page: number, search: string) {
  return queryOptions({
    queryKey: queryKeys.adminTable(table, page, search),
    queryFn: () => adminBrowseTable({ data: { table, page, search: search || undefined } }),
  });
}

export function adminShopItemsQueryOptions(filters: ShopFilterState, page: number) {
  return queryOptions({
    queryKey: queryKeys.adminShopItems(filters, page),
    queryFn: () => adminListShopItems({ data: { ...toShopFilterInput(filters), page } }),
  });
}

export function adminShopOptionsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.adminShopOptions,
    queryFn: () => adminShopOptions(),
  });
}
