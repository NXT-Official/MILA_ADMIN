import { expect, test } from "bun:test";
import {
  APP_PERMISSIONS,
  hasPermission,
  ROLE_PERMISSIONS,
  staffHome,
  STAFF_ROUTE_PERMISSIONS,
  STAFF_ROUTES,
} from "./authorization";

test("each role lands on the first screen its permissions open", () => {
  expect(staffHome(["admin"])).toBe("/dashboard");
  expect(staffHome(["moderator"])).toBe("/moderation");
  // Someone holding both is a steward first.
  expect(staffHome(["moderator", "admin"])).toBe("/dashboard");
});

test("a moderator is shut out of every admin-only screen", () => {
  const adminOnly = ["/dashboard", "/members", "/subscription-plans"] as const;
  for (const route of adminOnly) {
    expect(hasPermission(["moderator"], STAFF_ROUTE_PERMISSIONS[route])).toBe(false);
    expect(hasPermission(["admin"], STAFF_ROUTE_PERMISSIONS[route])).toBe(true);
  }
  for (const route of ["/moderation", "/support"] as const) {
    expect(hasPermission(["moderator"], STAFF_ROUTE_PERMISSIONS[route])).toBe(true);
  }
});

test("an admin holds every permission and both roles clear the suite floor", () => {
  for (const permission of APP_PERMISSIONS) {
    expect(hasPermission(["admin"], permission)).toBe(true);
  }
  expect(hasPermission(["moderator"], "admin.access")).toBe(true);
  // No role at all reaches nothing — staffHome is only ever asked about staff.
  expect(hasPermission([], "admin.access")).toBe(false);
});

test("every declared staff route is reachable by at least one role", () => {
  for (const route of STAFF_ROUTES) {
    const permission = STAFF_ROUTE_PERMISSIONS[route];
    const reachable = (Object.keys(ROLE_PERMISSIONS) as ("admin" | "moderator")[]).some((role) =>
      hasPermission([role], permission),
    );
    expect(reachable).toBe(true);
  }
});
