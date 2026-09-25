import type { ShopItem } from "@/lib/shop.functions";

/** Host of an outbound link, so the console shows where a click actually lands. */
export function linkHost(url: string | null | undefined): string {
  if (!url) return "—";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Money in the item's own currency. Intl separates the code with a
 * non-breaking space (U+00A0); it is normalised so the value greps and copies
 * the same everywhere it is rendered or exported.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    })
      .format(amount)
      .replace(/\u00a0/g, " ");
  } catch {
    return `${currency} ${amount}`;
  }
}

/** Price after any discount, in the item's own currency. */
export function formatShopPrice(item: ShopItem): string {
  const amount = item.discount_percent
    ? item.price * (1 - item.discount_percent / 100)
    : item.price;
  return formatMoney(amount, item.currency);
}

/** The undiscounted price, shown struck through beside a discount. */
export function formatShopListPrice(item: ShopItem): string {
  return formatMoney(item.price, item.currency);
}
