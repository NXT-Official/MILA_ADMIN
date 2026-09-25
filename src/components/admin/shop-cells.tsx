import { ExternalLink, ImageOff, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { formatShopListPrice, formatShopPrice, linkHost } from "@/lib/shop-display";
import { cn } from "@/lib/utils";
import type { ShopItem } from "@/lib/shop.functions";

export function ExternalLinkButton({
  href,
  label,
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      className={cn(
        "atelier-focus-ring inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-line px-2.5 py-1 text-micro uppercase tracking-label-wide text-ink transition-colors hover:border-accent/60 hover:text-accent",
        className,
      )}
    >
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label ?? linkHost(href)}</span>
    </a>
  );
}

export function CopyLinkButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success(`${label} copied.`))
          .catch(() => toast.error("Couldn't copy to the clipboard."));
      }}
      className="atelier-focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-stone transition-colors hover:border-accent/60 hover:text-accent"
    >
      <Link2 className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function ShopItemThumb({ item, className }: { item: ShopItem; className?: string }) {
  if (!item.image_url) {
    return (
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-control border border-porcelain/60 bg-atelier-panel text-muted",
          className,
        )}
        title="No image"
      >
        <ImageOff className="size-4" aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={item.image_url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn(
        "size-11 shrink-0 rounded-control border border-porcelain/60 bg-atelier-panel object-cover",
        className,
      )}
    />
  );
}

export function ShopStatusBadges({ item }: { item: ShopItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.in_stock ? (
        <Badge className="border-success/50 text-success text-nano uppercase tracking-label">
          In stock
        </Badge>
      ) : (
        <Badge className="border-destructive/50 text-destructive text-nano uppercase tracking-label">
          Out of stock
        </Badge>
      )}
      {item.verification_status === "verified" && (
        <Badge className="border-accent/50 text-accent text-nano uppercase tracking-label">
          Verified
        </Badge>
      )}
      {item.discount_percent ? (
        <Badge className="border-accent/50 text-accent text-nano uppercase tracking-label">
          −{item.discount_percent}%
        </Badge>
      ) : null}
    </div>
  );
}

/** Renders a price, showing the struck-through original when discounted. */
export function ShopPrice({ item }: { item: ShopItem }) {
  return (
    <div className="whitespace-nowrap">
      <span className="text-sm text-ink">{formatShopPrice(item)}</span>
      {item.discount_percent ? (
        <span className="ml-2 text-micro text-stone line-through">{formatShopListPrice(item)}</span>
      ) : null}
    </div>
  );
}
