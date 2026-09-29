import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ModelSettingsCard,
  ModelUsageCard,
  RevenueTaxCard,
} from "@/components/admin/ai-settings-cards";
import { queryKeys } from "@/constants/query-keys";
import { adminAiSettingsQueryOptions } from "@/lib/queries/admin";
import { requireStaffRoutePermission } from "@/lib/staff-route";

export const Route = createFileRoute("/_authed/ai-settings")({
  beforeLoad: ({ context }) =>
    requireStaffRoutePermission(context.queryClient, "aiSettings.manage"),
  component: AiSettingsPage,
});

function AiSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery(adminAiSettingsQueryOptions());
  const onSaved = () => qc.invalidateQueries({ queryKey: queryKeys.adminAiSettings });

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-stone">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 px-6 py-14 text-center">
        <p className="font-serif text-lg text-ink">Couldn't load the AI settings</p>
        <p className="mt-1 text-sm text-stone">Check your connection and try again.</p>
        <Button size="sm" variant="outline" className="mt-5" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone">
        Staff-only switch for the models behind styling, the tax used to report net revenue, and the
        AI cost per call. Model changes apply to the member app's next request — no deploy needed.
      </p>
      <ModelSettingsCard settings={data} onSaved={onSaved} />
      <ModelUsageCard settings={data} />
      <RevenueTaxCard settings={data} onSaved={onSaved} />
    </div>
  );
}
