import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { getSubscriptionColumns } from "@/components/admin/subscription-columns";
import { adminSubscriptionsQueryOptions } from "@/lib/queries/admin";
import { requireStaffRoutePermission } from "@/lib/staff-route";
import { adminMilaReceiptUrl, adminPaddleInvoiceUrl } from "@/lib/subscription-tracker.functions";
import type { SubscriptionTrackerRow } from "@/lib/subscription-tracker";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authed/subscriptions")({
  beforeLoad: ({ context }) =>
    requireStaffRoutePermission(context.queryClient, "subscriptions.view"),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { data, isLoading, isFetching, refetch } = useQuery(adminSubscriptionsQueryOptions());
  const fetchInvoiceUrl = useServerFn(adminPaddleInvoiceUrl);
  const fetchReceiptUrl = useServerFn(adminMilaReceiptUrl);
  const [pendingDocument, setPendingDocument] = useState<string | null>(null);

  async function openInvoice(row: SubscriptionTrackerRow) {
    const transactionId = row.payment?.transactionId;
    if (!transactionId) return;
    const key = `${row.subscriptionId}:invoice`;
    setPendingDocument(key);
    try {
      const { url } = await fetchInvoiceUrl({ data: { transaction_id: transactionId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't open that Paddle invoice."));
    } finally {
      setPendingDocument(null);
    }
  }

  async function openReceipt(row: SubscriptionTrackerRow) {
    const path = row.payment?.receiptPath;
    if (!path) return;
    const key = `${row.subscriptionId}:receipt`;
    setPendingDocument(key);
    try {
      const { url } = await fetchReceiptUrl({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't open that Mila receipt."));
    } finally {
      setPendingDocument(null);
    }
  }

  const columns = getSubscriptionColumns({
    pendingDocument,
    onOpenInvoice: openInvoice,
    onOpenReceipt: openReceipt,
  });
  const summary = data?.summary;

  return (
    <div>
      {data?.paddleError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-panel border border-destructive/40 px-4 py-3 text-xs text-stone">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            {data.paddleError} Amounts and invoice links below come from what Mila recorded.
          </span>
        </div>
      )}

      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Memberships" value={summary.total} />
          <Stat label="Granted by staff" value={summary.granted} />
          <Stat label="Receipts on file" value={summary.withReceipt} />
          <Stat label="Paid, no receipt yet" value={summary.paidWithoutReceipt} />
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search by name, email, or plan"
        searchText={(row) =>
          `${row.memberName} ${row.memberEmail ?? ""} ${row.planTitle} ${row.status}`
        }
        countLabel="memberships"
        emptyMessage="No memberships yet. They appear here as soon as someone subscribes."
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
            Refresh
          </Button>
        }
      />

      {data?.notes.map((note) => (
        <p key={note} className="mt-3 text-xs text-stone">
          {note}
        </p>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-panel border border-porcelain/60 px-4 py-3">
      <div className="text-nano uppercase tracking-label-xwide text-stone">{label}</div>
      <div className="mt-1 font-serif text-xl text-ink">{value}</div>
    </div>
  );
}
