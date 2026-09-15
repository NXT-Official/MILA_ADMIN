import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminAnalyticsTableQueryOptions } from "@/lib/queries/admin";
import { ANALYTICS_BROWSABLE_TABLES, type BrowsableTable } from "@/lib/analytics.functions";

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AnalyticsTableBrowser() {
  const [table, setTable] = useState<BrowsableTable>(ANALYTICS_BROWSABLE_TABLES[0]);
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching } = useQuery(adminAnalyticsTableQueryOptions(table, page));

  const rows = data?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function selectTable(next: string) {
    setTable(next as BrowsableTable);
    setPage(0);
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="atelier-label">Browse Table</h2>
        <Select value={table} onValueChange={selectTable}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANALYTICS_BROWSABLE_TABLES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-porcelain/30 hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="h-auto px-5 py-3 text-xs uppercase tracking-label-wide text-stone whitespace-nowrap"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="border-porcelain/30 hover:bg-transparent">
                <TableCell
                  colSpan={Math.max(columns.length, 1)}
                  className="h-24 text-center text-sm text-stone"
                >
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length > 0 ? (
              rows.map((row, i) => (
                <TableRow
                  key={i}
                  className="border-porcelain/30 transition-colors last:border-0 hover:bg-background/40"
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col}
                      className="px-5 py-3 text-sm text-ink whitespace-nowrap max-w-xs truncate"
                    >
                      {formatCell(row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="border-porcelain/30 hover:bg-transparent">
                <TableCell colSpan={1} className="h-32 text-center text-sm text-stone">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="size-6 text-muted" strokeWidth={1.75} aria-hidden="true" />
                    No rows.
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 py-4">
        <div className="atelier-label text-stone">
          {data ? `${data.total} total · page ${data.page + 1} of ${totalPages}` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || isFetching}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data || page + 1 >= totalPages || isFetching}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
