import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Loader2, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  formatTrackerAmount,
  formatTrackerDate,
  isExpired,
  trackerStatusLabel,
  trackerStatusTone,
  type SubscriptionTrackerRow,
  type TrackerTone,
} from "@/lib/subscription-tracker";

interface SubscriptionColumnsOptions {
  /** `${subscriptionId}:invoice` / `:receipt` while a document link is fetched. */
  pendingDocument: string | null;
  onOpenInvoice: (row: SubscriptionTrackerRow) => void;
  onOpenReceipt: (row: SubscriptionTrackerRow) => void;
}

const TONE_CLASSES: Record<TrackerTone, string> = {
  live: "border-accent/50 bg-accent-soft/40 text-ink",
  granted: "border-accent/40 text-accent",
  attention: "border-destructive/50 text-destructive",
  ended: "border-line text-stone",
};

/**
 * One row per membership, named — the console exists so staff can see people,
 * not ids. The last column carries the two documents the member paid for:
 * Paddle's own invoice and the receipt Mila generated.
 */
export function getSubscriptionColumns({
  pendingDocument,
  onOpenInvoice,
  onOpenReceipt,
}: SubscriptionColumnsOptions): ColumnDef<SubscriptionTrackerRow>[] {
  return [
    {
      accessorKey: "memberName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-serif text-sm text-ink truncate">{row.original.memberName}</div>
          <div className="text-micro uppercase tracking-label text-stone mt-0.5 truncate">
            {row.original.memberEmail ?? "no email"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "planTitle",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Plan" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="text-sm text-ink truncate">{row.original.planTitle}</div>
          {row.original.isManual && (
            <div className="text-micro uppercase tracking-label text-stone mt-0.5">
              Granted by the Mila team
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge
          className={`text-nano uppercase tracking-label ${TONE_CLASSES[trackerStatusTone(row.original)]}`}
        >
          {trackerStatusLabel(row.original)}
        </Badge>
      ),
    },
    {
      accessorKey: "startedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Started" />,
      cell: ({ row }) => (
        <div className="text-xs text-stone">{formatTrackerDate(row.original.startedAt)}</div>
      ),
    },
    {
      accessorKey: "expiresAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expires" />,
      cell: ({ row }) => (
        <div className="text-xs text-stone">
          {formatTrackerDate(row.original.expiresAt)}
          {isExpired(row.original) && <span className="block text-destructive">expired</span>}
        </div>
      ),
    },
    {
      id: "paid",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Paid" className="justify-end w-full" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <div className="text-sm text-ink">
            {formatTrackerAmount(
              row.original.payment?.amountCents ?? null,
              row.original.payment?.currency ?? null,
            )}
          </div>
          <div className="text-micro uppercase tracking-label text-stone mt-0.5">
            {formatTrackerDate(row.original.payment?.paidAt ?? null)}
          </div>
        </div>
      ),
    },
    {
      id: "documents",
      header: () => <div className="text-right sr-only">Documents</div>,
      cell: ({ row }) => {
        const payment = row.original.payment;
        const invoiceKey = `${row.original.subscriptionId}:invoice`;
        const receiptKey = `${row.original.subscriptionId}:receipt`;
        const hasInvoice = Boolean(payment?.transactionId && payment.invoiceNumber);
        const hasReceipt = Boolean(payment?.receiptPath);
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-nano uppercase tracking-label"
              disabled={!hasInvoice || pendingDocument === invoiceKey}
              title={
                hasInvoice
                  ? `Paddle invoice ${payment?.invoiceNumber}`
                  : "No Paddle invoice for this membership yet."
              }
              onClick={() => onOpenInvoice(row.original)}
            >
              {pendingDocument === invoiceKey ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5" />
              )}
              Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-nano uppercase tracking-label"
              disabled={!hasReceipt || pendingDocument === receiptKey}
              title={
                hasReceipt
                  ? "Mila's own receipt"
                  : "Mila's receipt is written when a payment lands."
              }
              onClick={() => onOpenReceipt(row.original)}
            >
              {pendingDocument === receiptKey ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ReceiptText className="size-3.5" />
              )}
              Receipt
            </Button>
          </div>
        );
      },
    },
  ];
}
