export const APP_ROLES = ["admin", "moderator"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const APP_PERMISSIONS = [
  "admin.access",
  "admin.dashboard.view",
  "members.view",
  "members.manage",
  "members.suspend",
  "roles.manage",
  "moderation.view",
  "moderation.manage",
  "support.view",
  "support.manage",
  "subscriptionPlans.manage",
] as const;
export type AppPermission = (typeof APP_PERMISSIONS)[number];

export const ROLE_PERMISSIONS = {
  admin: APP_PERMISSIONS,
  moderator: [
    "admin.access",
    "moderation.view",
    "moderation.manage",
    "support.view",
    "support.manage",
  ],
} as const satisfies Record<AppRole, readonly AppPermission[]>;

/**
 * This whole app is the staff suite, so every screen sits at its own top-level
 * path and is gated by one permission. Declaration order is load-bearing:
 * `staffHome` walks these in order and hands the viewer the first door they can
 * open, which puts an admin on the dashboard and a moderator on the queue.
 */
export const STAFF_ROUTE_PERMISSIONS = {
  "/dashboard": "admin.dashboard.view",
  "/members": "members.view",
  "/subscription-plans": "subscriptionPlans.manage",
  "/moderation": "moderation.view",
  "/support": "support.view",
} as const satisfies Record<string, AppPermission>;

export type StaffRoute = keyof typeof STAFF_ROUTE_PERMISSIONS;

export const STAFF_ROUTES = Object.keys(STAFF_ROUTE_PERMISSIONS) as StaffRoute[];

export function isAppRole(role: string): role is AppRole {
  return APP_ROLES.includes(role as AppRole);
}

export function getPermissions(roles: readonly AppRole[]): AppPermission[] {
  return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
}

export function hasPermission(roles: readonly AppRole[], permission: AppPermission): boolean {
  return roles.some((role) =>
    (ROLE_PERMISSIONS[role] as readonly AppPermission[]).includes(permission),
  );
}

/** Where a viewer lands after sign-in: the first route their permissions open. */
export function staffHome(roles: readonly AppRole[]): StaffRoute {
  // A viewer holding no staff permission at all is refused at the sign-in form
  // and never reaches a guarded route, so the fallback is unreachable in practice.
  return (
    STAFF_ROUTES.find((route) => hasPermission(roles, STAFF_ROUTE_PERMISSIONS[route])) ??
    "/moderation"
  );
}
