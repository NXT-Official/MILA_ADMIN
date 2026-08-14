import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { STAFF_ROUTE_PERMISSIONS, STAFF_ROUTES } from "./authorization";
import { NON_STAFF_NOTICE } from "./staff-route";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the suite floor is admin.access and a lapsed session lands on the sign-in form", () => {
  const authed = source("../routes/_authed.tsx");
  expect(authed).toContain("!viewer.canAccessStaffArea");
  expect(authed).toContain('redirect({ to: "/", replace: true })');
  // Client-only, or the server SSRs the match as success and the guard never runs.
  expect(authed).toContain("ssr: false");
});

test("every staff screen re-checks its own permission in its route file", () => {
  // admin.access alone opens the shell; without a per-route check a moderator
  // could deep-link straight into the admin-only screens.
  const routes: Record<(typeof STAFF_ROUTES)[number], string> = {
    "/dashboard": "dashboard.tsx",
    "/members": "members.tsx",
    "/subscription-plans": "subscription-plans.tsx",
    "/moderation": "moderation.tsx",
    "/support": "support.tsx",
  };
  for (const route of STAFF_ROUTES) {
    const file = source(`../routes/_authed/${routes[route]}`);
    expect(file).toContain(`createFileRoute("/_authed${route}")`);
    expect(file).toContain(
      `requireStaffRoutePermission(context.queryClient, "${STAFF_ROUTE_PERMISSIONS[route]}")`,
    );
  }
});

test("a sign-in by a non-staff account is dropped, not redirected", () => {
  // Redirecting alone would leave this form a working entry point for member
  // credentials, so the session has to be signed out and the cache cleared.
  const staffRoute = source("./staff-route.ts");
  expect(staffRoute).toContain("await supabase.auth.signOut()");
  expect(staffRoute).toContain("queryClient.clear()");
  expect(source("../hooks/use-login-redirect.ts")).toContain("rejectNonStaffLogin(queryClient)");
  // The notice must not name a role — that tells a prober which one to guess.
  expect(NON_STAFF_NOTICE.toLowerCase()).not.toContain("steward");
  expect(NON_STAFF_NOTICE.toLowerCase()).not.toContain("moderator");
});

test("a suspended staff account is blocked from the whole suite", () => {
  expect(source("../routes/_authed.tsx")).toContain("<SuspendedGate>");
});

test("browser Supabase client never imports or reads the service-role credential", () => {
  const client = source("../integrations/supabase/client.ts");
  expect(client).not.toContain("SERVICE_ROLE");
  expect(client).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
});

test("password auth stays server-side and delegates abuse limits to Supabase Auth", () => {
  const auth = source("./auth-handler.server.ts");
  expect(auth).toContain("signInWithPassword");
  expect(auth).not.toContain("consumeRateLimit");
  expect(auth).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
});

test("the shared captcha hook clears expired/error tokens and resets after attempts", () => {
  const hook = source("../components/login/use-captcha.tsx");
  expect(hook).toContain("onExpire={clear}");
  expect(hook).toContain("onError={clear}");
  expect(hook).toContain("ref.current?.resetCaptcha()");
  expect(hook).toContain("setToken(null)");
});

test("the sign-in form goes through that hook rather than mounting its own widget", () => {
  const form = source("../components/login/login-form.tsx");
  expect(form).toContain("useCaptcha()");
  expect(form).toContain("captcha.reset()");
  // A form that renders its own <HCaptcha> would bypass the reset above and
  // silently reuse a spent, single-use token on the next attempt.
  expect(form).not.toContain("<HCaptcha");
});
