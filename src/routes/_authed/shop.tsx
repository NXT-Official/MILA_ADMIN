import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  Store,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShopItemDialog } from "@/components/admin/shop-item-dialog";
import {
  ExternalLinkButton,
  ShopItemThumb,
  ShopPrice,
  ShopStatusBadges,
} from "@/components/admin/shop-cells";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  EMPTY_SHOP_FILTERS,
  SHOP_CSV_COLUMNS,
  adminExportShopItems,
  shopFiltersActive,
  toShopFilterInput,
  type ShopFilterState,
  type ShopItem,
} from "@/lib/shop.functions";
import { adminShopItemsQueryOptions, adminShopOptionsQueryOptions } from "@/lib/queries/admin";
import { requireStaffRoutePermission } from "@/lib/staff-route";
import { errorMessage } from "@/lib/utils";

const ALL = "all";

export const Route = createFileRoute("/_authed/shop")({
  beforeLoad: ({ context }) => requireStaffRoutePermission(context.queryClient, "shop.view"),
  component: ShopPage,
});

function ShopPage() {
  const exportItems = useServerFn(adminExportShopItems);
  const [filters, setFilters] = useState<ShopFilterState>(EMPTY_SHOP_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [viewing, setViewing] = useState<ShopItem | null>(null);
  const [exporting, setExporting] = useState(false);

  // Debounce typing so every keystroke doesn't become a catalogue query.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput.trim() }));
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery(
    adminShopItemsQueryOptions(filters, page),
  );
  const { data: options } = useQuery(adminShopOptionsQueryOptions());

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? 1)));
  const filtered = shopFiltersActive(filters);

  function update(patch: Partial<ShopFilterState>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  }

  function clearFilters() {
    setFilters(EMPTY_SHOP_FILTERS);
    setSearchInput("");
    setPage(0);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const { items: all, truncated } = await exportItems({
        data: toShopFilterInput(filters),
      });
      if (all.length === 0) {
        toast.error("Nothing to export with these filters.");
        return;
      }
      downloadCsv(
        `shop-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(SHOP_CSV_COLUMNS, all),
      );
      toast.success(
        truncated
          ? `Exported the first ${all.length} items — the catalogue is larger.`
          : `Exported ${all.length} items with their links.`,
      );
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't export the inventory."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-stone">
        Every item in the catalogue, with the links members are sent to. Open an item for its full
        details, or export the rows you are looking at — links included.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          leadingIcon={Search}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by title, category or description"
          aria-label="Search the catalogue"
          className="h-9 w-72 bg-background border-porcelain/60 rounded-full text-sm"
        />
        <Select
          value={filters.category || ALL}
          onValueChange={(value) => update({ category: value === ALL ? "" : value })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {(options?.categories ?? []).map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.brand_id || ALL}
          onValueChange={(value) => update({ brand_id: value === ALL ? "" : value })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by brand">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All brands</SelectItem>
            {(options?.brands ?? []).map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.gender || ALL}
          onValueChange={(value) => update({ gender: value === ALL ? "" : value })}
        >
          <SelectTrigger className="w-36" aria-label="Filter by gender">
            <SelectValue placeholder="All genders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All genders</SelectItem>
            {(options?.genders ?? []).map((gender) => (
              <SelectItem key={gender} value={gender}>
                {gender}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.stock}
          onValueChange={(value) => update({ stock: value as ShopFilterState["stock"] })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by stock">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stock</SelectItem>
            <SelectItem value="in">In stock only</SelectItem>
            <SelectItem value="out">Out of stock only</SelectItem>
          </SelectContent>
        </Select>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X aria-hidden="true" />
            Clear
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
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
            onClick={exportCsv}
            disabled={exporting || items.length === 0}
          >
            {exporting ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-panel border border-porcelain/60 bg-atelier-panel/40 px-6 py-14 text-center">
          <p className="font-serif text-lg text-ink">Couldn't load the shop inventory</p>
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
                {["Item", "Category", "Price", "Links", "Status", "Added", ""].map(
                  (heading, index) => (
                    <TableHead
                      key={heading || index}
                      className="h-auto px-5 py-3 text-xs uppercase tracking-label-wide text-stone whitespace-nowrap"
                    >
                      <span className={heading ? undefined : "sr-only"}>
                        {heading || "Actions"}
                      </span>
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-porcelain/30 hover:bg-transparent">
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-stone">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length > 0 ? (
                items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="border-porcelain/30 transition-colors last:border-0 hover:bg-background/40"
                  >
                    <TableCell className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ShopItemThumb item={item} />
                        <div className="min-w-0">
                          <div className="font-serif text-sm text-ink truncate max-w-[18rem]">
                            {item.title}
                          </div>
                          <div className="text-micro uppercase tracking-label text-stone mt-0.5">
                            {item.brand_name ?? "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <div className="text-sm text-ink">{item.category}</div>
                      <div className="text-micro uppercase tracking-label text-stone">
                        {item.gender}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <ShopPrice item={item} />
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ExternalLinkButton href={item.affiliate_link} />
                        {item.brand_website ? (
                          <ExternalLinkButton href={item.brand_website} label="Brand site" />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <ShopStatusBadges item={item} />
                    </TableCell>
                    <TableCell className="px-5 py-3 text-micro uppercase tracking-label text-stone whitespace-nowrap">
                      {new Date(item.date_added).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewing(item)}
                        aria-label={`Open details for ${item.title}`}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-porcelain/30 hover:bg-transparent">
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-stone">
                    <div className="flex flex-col items-center gap-2">
                      <Inbox className="size-6 text-muted" strokeWidth={1.75} aria-hidden="true" />
                      {filtered
                        ? "No items match these filters."
                        : "No items in the catalogue yet."}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="atelier-label text-stone flex items-center gap-2">
          <Store className="size-3.5" aria-hidden="true" />
          {`${total} ${filtered ? "matching" : "total"} · page ${page + 1} of ${totalPages}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0 || isFetching}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => current + 1)}
            disabled={page + 1 >= totalPages || isFetching}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <ShopItemDialog item={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </div>
  );
}
