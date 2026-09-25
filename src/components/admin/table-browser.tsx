import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminTableQueryOptions } from "@/lib/queries/admin";
import {
  BROWSABLE_TABLES,
  SEARCH_COLUMNS,
  TABLE_DESCRIPTIONS,
  isBrowsableTable,
  type BrowsableTable,
} from "@/lib/database.functions";

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Current page as CSV, so an owner can take the data into a spreadsheet. */
function downloadCsv(table: BrowsableTable, columns: string[], rows: Record<string, unknown>[]) {
  const escape = (value: unknown) => `"${formatCell(value).replace(/"/g, '""')}"`;
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(","));
  const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${table}-page.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TableBrowser({
  table,
  onTableChange,
}: {
  table: BrowsableTable;
  onTableChange: (table: BrowsableTable) => void;
}) {
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchable = SEARCH_COLUMNS[table].length > 0;

  // Debounce typing so every keystroke doesn't become a database query.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery(
    adminTableQueryOptions(table, page, search),
  );

  const rows = data?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const searching = search.length > 0;

  function selectTable(next: string) {
    if (!isBrowsableTable(next)) return;
    onTableChange(next);
    setPage(0);
    setSearchInput("");
    setSearch("");
  }

  return (
    <section>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="atelier-label mb-2">Browse Table</h2>
          <Select value={table} onValueChange={selectTable}>
            <SelectTrigger className="w-64" aria-label="Choose a table to browse">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BROWSABLE_TABLES.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-stone">{TABLE_DESCRIPTIONS[table]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            leadingIcon={Search}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={searchable ? `Search ${table}` : "No text columns to search"}
            aria-label={`Search ${table}`}
            disabled={!searchable}
            className="h-9 w-56 bg-background border-porcelain/60 rounded-full text-sm"
          />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(table, columns, rows)}
            disabled={rows.length === 0}
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 px-6 py-14 text-center">
          <p className="font-serif text-lg text-ink">Couldn't load {table}</p>
          <p className="mt-1 text-sm text-stone">Check your connection and try again.</p>
          <Button size="sm" variant="outline" className="mt-5" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : (
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
                        title={formatCell(row[col])}
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
                      {searching ? `No rows in ${table} match “${search}”.` : "No rows."}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 py-4">
        <div className="atelier-label text-stone">
          {data
            ? `${data.total} ${searching ? "matching" : "total"} · page ${data.page + 1} of ${totalPages}`
            : ""}
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
