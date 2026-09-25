import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  CopyLinkButton,
  ExternalLinkButton,
  ShopItemThumb,
  ShopPrice,
  ShopStatusBadges,
} from "@/components/admin/shop-cells";
import { linkHost } from "@/lib/shop-display";
import type { ShopItem } from "@/lib/shop.functions";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-nano uppercase tracking-label-wide text-stone">{label}</dt>
      <dd className="mt-1 text-sm text-ink break-words">{children}</dd>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-porcelain/60 bg-background/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-nano uppercase tracking-label-wide text-stone">{label}</div>
        <div className="truncate text-xs text-ink" title={href}>
          {href}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <CopyLinkButton value={href} label={label} />
        <ExternalLinkButton href={href} label="Open" />
      </div>
    </div>
  );
}

function List({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-stone">—</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} className="text-nano uppercase tracking-label">
          {value}
        </Badge>
      ))}
    </span>
  );
}

export function ShopItemDialog({
  item,
  onOpenChange,
}: {
  item: ShopItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {item ? (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                <ShopItemThumb item={item} className="size-20" />
                <div className="min-w-0">
                  <DialogTitle className="font-serif">{item.title}</DialogTitle>
                  <DialogDescription className="mt-1 text-xs">
                    {item.brand_name ?? "Unknown brand"}
                    {item.brand_name ? ` · ${linkHost(item.brand_website)}` : ""} · added{" "}
                    {new Date(item.date_added).toLocaleDateString()}
                  </DialogDescription>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ShopPrice item={item} />
                    <Badge className="text-nano uppercase tracking-label">{item.category}</Badge>
                    <Badge className="text-nano uppercase tracking-label">{item.gender}</Badge>
                  </div>
                  <div className="mt-3">
                    <ShopStatusBadges item={item} />
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3">
              <h3 className="atelier-label">Links</h3>
              <div className="space-y-2">
                <LinkRow href={item.affiliate_link} label="Product link" />
                {item.brand_website ? (
                  <LinkRow href={item.brand_website} label="Brand site" />
                ) : null}
                {item.image_url ? <LinkRow href={item.image_url} label="Image" /> : null}
              </div>
            </div>

            <div>
              <h3 className="atelier-label mb-3">Item</h3>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Fact label="Category">{item.category}</Fact>
                <Fact label="Gender">{item.gender}</Fact>
                <Fact label="Price">
                  {item.price} {item.currency}
                  {item.discount_percent ? ` · −${item.discount_percent}%` : ""}
                </Fact>
                <Fact label="Rating">{item.rating ?? "—"}</Fact>
                <Fact label="Units sold">{item.units_sold ?? "—"}</Fact>
                <Fact label="Shipping">{item.shipping_info ?? "—"}</Fact>
                <Fact label="Verification">{item.verification_status}</Fact>
                <Fact label="Last verified">
                  {item.last_verified_at
                    ? new Date(item.last_verified_at).toLocaleDateString()
                    : "—"}
                </Fact>
                <Fact label="Regions">
                  <List values={item.available_regions} />
                </Fact>
                <Fact label="Body shapes">
                  <List values={item.body_shapes} />
                </Fact>
                <Fact label="Seasonal palettes">
                  <List values={item.seasonal_palettes} />
                </Fact>
              </dl>
            </div>

            <div>
              <h3 className="atelier-label mb-3">Brand</h3>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Fact label="Name">{item.brand_name ?? "—"}</Fact>
                <Fact label="Status">{item.brand_status ?? "—"}</Fact>
                <Fact label="Verified seller">{item.brand_is_verified_seller ? "Yes" : "No"}</Fact>
                <Fact label="Affiliate network">{item.brand_affiliate_network ?? "—"}</Fact>
                <Fact label="Commission">
                  {item.brand_commission_rate !== null ? `${item.brand_commission_rate}%` : "—"}
                </Fact>
              </dl>
            </div>

            {item.description ? (
              <div>
                <h3 className="atelier-label mb-2">Description</h3>
                <p className="text-sm leading-relaxed text-stone">{item.description}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
