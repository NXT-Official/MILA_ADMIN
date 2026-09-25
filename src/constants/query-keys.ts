export const queryKeys = {
  suspended: (userId: string | undefined) => ["suspended", userId] as const,
  staffGate: ["staff:gate"] as const,
  adminUsers: ["admin:users"] as const,
  adminPosts: ["admin:posts"] as const,
  adminSupportMessages: ["admin:support-messages"] as const,
  adminDashboard: ["admin:dashboard"] as const,
  adminSubscriptionPlans: ["admin:subscription-plans"] as const,
  adminAnalytics: ["admin:analytics"] as const,
  adminTable: (table: string, page: number, search: string) =>
    ["admin:database-table", table, page, search] as const,
  adminShopItems: (filters: object, page: number) => ["admin:shop-items", filters, page] as const,
  adminShopOptions: ["admin:shop-options"] as const,
};
