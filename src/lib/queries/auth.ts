import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { staffGateQueryOptions } from "@/lib/queries/admin";
import {
  hasPermission,
  staffHome,
  type AppPermission,
  type AppRole,
  type StaffRoute,
} from "@/lib/authorization";

export interface StaffViewerState {
  isAdmin: boolean;
  isModerator: boolean;
  canAccessStaffArea: boolean;
  roles: AppRole[];
  permissions: AppPermission[];
  destination: StaffRoute;
}

/**
 * No user id argument: the gate server function derives the viewer from the
 * bearer token, so passing an id would only invite the caller to pass a
 * different one than the session actually holds.
 */
export async function loadStaffViewerState(queryClient: QueryClient): Promise<StaffViewerState> {
  const gate = await queryClient.ensureQueryData(staffGateQueryOptions());
  const roles = gate?.roles ?? [];
  return {
    isAdmin: !!gate?.is_admin,
    isModerator: !!gate?.is_moderator,
    canAccessStaffArea: !!gate?.can_access_staff_area,
    roles,
    permissions: gate?.permissions ?? [],
    destination: staffHome(roles),
  };
}

export function useStaffViewerState(userId: string | undefined) {
  const gateQuery = useQuery({ ...staffGateQueryOptions(), enabled: !!userId });
  const roles = gateQuery.data?.roles ?? [];
  return {
    isLoading: gateQuery.isLoading,
    isAdmin: !!gateQuery.data?.is_admin,
    isModerator: !!gateQuery.data?.is_moderator,
    canAccessStaffArea: !!gateQuery.data?.can_access_staff_area,
    roles,
    permissions: gateQuery.data?.permissions ?? [],
    hasPermission: (permission: AppPermission) => hasPermission(roles, permission),
    destination: staffHome(roles),
  };
}
