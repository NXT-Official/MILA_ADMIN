import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useStaffViewerState } from "@/lib/queries/auth";
import { rejectNonStaffLogin } from "@/lib/staff-route";

/**
 * Sends a signed-in staff member on from the sign-in screen, and refuses the
 * session outright when the account holds no staff role. There is no member
 * experience on this origin, so a non-staff session here is always wrong —
 * however it arrived, it gets dropped rather than redirected.
 */
export function useLoginRedirect() {
  const { session, loading } = useAuth();
  const viewer = useStaffViewerState(session?.user.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (loading || viewer.isLoading || !session) return;
    if (!viewer.canAccessStaffArea) {
      void rejectNonStaffLogin(queryClient);
      return;
    }
    navigate({ to: viewer.destination });
  }, [
    loading,
    session,
    viewer.isLoading,
    viewer.canAccessStaffArea,
    viewer.destination,
    navigate,
    queryClient,
  ]);
}
