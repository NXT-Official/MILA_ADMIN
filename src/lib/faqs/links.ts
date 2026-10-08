/** Sorts a link written in an article into the kind of link the page should draw. */

export type FaqHref =
  /** A heading on the page you are already on. Drawn as a plain `#heading` link. */
  | { kind: "anchor"; hash: string }
  | { kind: "article"; slug: string; hash: string | undefined }
  | { kind: "index"; q: string | undefined }
  | { kind: "external" }
  | { kind: "other" };

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function classifyHref(href: string, currentSlug: string): FaqHref {
  if (/^https?:\/\//i.test(href)) return { kind: "external" };

  if (href.startsWith("#")) {
    return href.length > 1 ? { kind: "anchor", hash: decode(href.slice(1)) } : { kind: "other" };
  }

  const article = /^\/faqs\/([^/?#]+)(?:\?[^#]*)?(?:#(.*))?$/.exec(href);
  if (article) {
    const slug = article[1] ?? "";
    const hash = article[2] === undefined || article[2] === "" ? undefined : decode(article[2]);
    if (slug === currentSlug && hash !== undefined) return { kind: "anchor", hash };
    return { kind: "article", slug, hash };
  }

  const index = /^\/faqs\/?(?:\?([^#]*))?(?:#.*)?$/.exec(href);
  if (index) {
    const q = new URLSearchParams(index[1] ?? "").get("q");
    return { kind: "index", q: q === null || q === "" ? undefined : q };
  }

  return { kind: "other" };
}
