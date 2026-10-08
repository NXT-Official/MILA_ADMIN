import { createFileRoute, redirect } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff/staff-shell";
import { loadStaffViewerState } from "@/lib/queries/auth";
import { supabase } from "@/integrations/supabase/client";
import { SuspendedGate } from "@/components/layout/suspended-gate";
import { signInRedirectSearch } from "@/lib/safe-redirect";

// The way out of the guard: the sign-in screen, remembering which screen was
// asked for so the form can send them back once they are in.
//
// `reloadDocument` is deliberate. This route is `ssr: false`, so the guard runs
// while React is still hydrating the shell in time-sliced chunks. A redirect
// committed to router state in the gap between two chunks removes the pending
// match's store before React has rendered it, and Match then reads `.routeId`
// of undefined (React #520 and #422 in the console, the sign-in form only
// appearing after React falls back to a full client render). Leaving the
// document commits nothing to router state, so there is nothing to race.
// src: @tanstack/router-core/skills/router-core/auth-and-guards/SKILL.md (redirect + search param)
// src: @tanstack/router-core/src/redirect.ts (reloadDocument is a redirect option) · @tanstack/react-router 1.170.41 · 2026-10-07
function toSignIn(pathname: string) {
  return redirect({
    to: "/",
    search: signInRedirectSearch(pathname),
    replace: true,
    reloadDocument: true,
  });
}

export const Route = createFileRoute("/_authed")({
  // Session lives in localStorage, so the guard can only run on the client.
  // Without this the server SSRs the match as "success" and beforeLoad never
  // re-runs on hydration — the tree renders signed out.
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw toSignIn(location.pathname);
    const viewer = await loadStaffViewerState(context.queryClient);
    // admin.access is the floor for the suite; each screen re-checks its own
    // permission in its route file, so a moderator can't reach admin-only pages.
    if (!viewer.canAccessStaffArea) throw toSignIn(location.pathname);
  },
  component: StaffLayout,
});

function StaffLayout() {
  return (
    <SuspendedGate>
      <StaffShell />
    </SuspendedGate>
  );
}
