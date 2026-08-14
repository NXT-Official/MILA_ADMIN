import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { hasPermission, staffHome, type AppPermission } from "@/lib/authorization";
import { loadStaffViewerState } from "@/lib/queries/auth";

/** Deliberately generic — naming the roles would tell a prober which one to guess. */
export const NON_STAFF_NOTICE = "This sign-in is for Mila staff only.";

/**
 * Undoes a sign-in by an account with no staff role, cache and all. Redirecting
 * alone would leave this form a working entry point for member credentials.
 */
export async function rejectNonStaffLogin(queryClient: QueryClient) {
  await supabase.auth.signOut();
  queryClient.clear();
  toast.error(NON_STAFF_NOTICE);
}

export async function requireStaffRoutePermission(
  queryClient: QueryClient,
  permission: AppPermission,
) {
  if (typeof window === "undefined") return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const viewer = await loadStaffViewerState(queryClient);
  if (!hasPermission(viewer.roles, permission)) {
    // Send them to a door they can open rather than bouncing them to sign-in.
    throw redirect({ to: staffHome(viewer.roles), replace: true });
  }
}
