import { createFileRoute, redirect } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff/staff-shell";
import { loadStaffViewerState } from "@/lib/queries/auth";
import { supabase } from "@/integrations/supabase/client";
import { SuspendedGate } from "@/components/layout/suspended-gate";

export const Route = createFileRoute("/_authed")({
  // Session lives in localStorage, so the guard can only run on the client.
  // Without this the server SSRs the match as "success" and beforeLoad never
  // re-runs on hydration — the tree renders signed out.
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/", replace: true });
    const viewer = await loadStaffViewerState(context.queryClient);
    // admin.access is the floor for the suite; each screen re-checks its own
    // permission in its route file, so a moderator can't reach admin-only pages.
    if (!viewer.canAccessStaffArea) throw redirect({ to: "/", replace: true });
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
