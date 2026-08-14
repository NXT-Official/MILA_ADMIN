export const queryKeys = {
  suspended: (userId: string | undefined) => ["suspended", userId] as const,
  staffGate: ["staff:gate"] as const,
  adminUsers: ["admin:users"] as const,
  adminPosts: ["admin:posts"] as const,
  adminSupportMessages: ["admin:support-messages"] as const,
  adminDashboard: ["admin:dashboard"] as const,
  adminSubscriptionPlans: ["admin:subscription-plans"] as const,
};
