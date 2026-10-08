import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { identify } from "@/lib/observability/observability";

/**
 * Keeps the error reporter's identity in step with the session: the signed-in
 * Supabase user id (and nothing else) while signed in, cleared on sign-out.
 * Renders nothing. No-op when error reporting is not configured.
 */
export function ObservabilityIdentity() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    identify(userId);
  }, [userId]);

  return null;
}
