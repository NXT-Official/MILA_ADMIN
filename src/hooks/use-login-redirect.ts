import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useStaffViewerState } from "@/lib/queries/auth";
import { rejectNonStaffLogin } from "@/lib/staff-route";
import { postLoginDestination } from "@/lib/safe-redirect";
import type { StaffRoute } from "@/lib/authorization";

/**
 * Sends a signed-in staff member on from the sign-in screen, and refuses the
 * session outright when the account holds no staff role. There is no member
 * experience on this origin, so a non-staff session here is always wrong —
 * however it arrived, it gets dropped rather than redirected.
 *
 * `redirectTo` is the screen the guard stopped them at, already validated by
 * the route. They land there when their role may open it, on their own home
 * screen otherwise.
 */
export function useLoginRedirect(redirectTo?: StaffRoute) {
  const { session, loading } = useAuth();
  const viewer = useStaffViewerState(session?.user.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // A string, so the effect below does not re-run on a fresh `roles` array
  // while the gate query has no data yet.
  const destination = postLoginDestination(redirectTo, viewer.roles);

  useEffect(() => {
    if (loading || viewer.isLoading || !session) return;
    if (!viewer.canAccessStaffArea) {
      void rejectNonStaffLogin(queryClient);
      return;
    }
    // Replace, so Back from the screen they land on does not return to sign-in.
    navigate({ to: destination, replace: true });
  }, [
    loading,
    session,
    viewer.isLoading,
    viewer.canAccessStaffArea,
    destination,
    navigate,
    queryClient,
  ]);
}
