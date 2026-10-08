import { isValidElement, useMemo, type ComponentProps, type ReactNode } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyHref } from "@/lib/faqs/links";
import { createSlugger } from "@/lib/faqs/outline";
import type { FaqHeading } from "@/lib/faqs/types";
import { FaqCallout, type FaqCalloutKind } from "./faq-callout";

/**
 * Renders an article's Markdown in the admin's own type and table styles.
 *
 * - react-markdown 10.1.0 builds React elements itself. Raw HTML in the source is
 *   shown as text, never parsed, and `defaultUrlTransform` drops `javascript:`
 *   links; neither is switched off here.
 *   src: https://github.com/remarkjs/react-markdown/blob/10.1.0/readme.md#security
 * - remark-gfm 4.0.1 adds tables, task lists and strikethrough.
 *   src: https://github.com/remarkjs/remark-gfm/blob/4.0.1/readme.md
 * - The page already has an h1 (the staff header) and an h2 (the article title),
 *   so a `##` in the source is drawn as an h3, a `###` as an h4, and so on.
 */

const REMARK_PLUGINS = [remarkGfm];

type HastNode = NonNullable<ExtraProps["node"]>;
type HastChild = HastNode["children"][number];

function hastText(node: HastChild): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(hastText).join("");
  return "";
}

/** `> **Note:** ...` and `> **Important:** ...` are callouts; any other quote is a quote. */
function calloutKind(node: HastNode | undefined): FaqCalloutKind | null {
  const paragraph = node?.children.find(
    (child): child is Extract<HastChild, { type: "element" }> =>
      child.type === "element" && child.tagName === "p",
  );
  const first = paragraph?.children.find(
    (child) => child.type !== "text" || child.value.trim() !== "",
  );
  if (first?.type !== "element" || first.tagName !== "strong") return null;
  const label = hastText(first).trim().replace(/:$/, "").toLowerCase();
  return label === "note" || label === "important" ? label : null;
}

function reactText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return reactText(node.props.children);
  return "";
}

// `relative` matters for the outside-link label: see the note on the sr-only span below.
const ARTICLE_LINK =
  "relative rounded-sm text-ink underline decoration-ink/60 decoration-2 underline-offset-4 transition-colors hover:bg-accent-soft/70";

const ALIGN: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function buildComponents(slug: string, headings: readonly FaqHeading[]): Components {
  const headingAtLine = new Map(headings.map((heading) => [heading.line, heading]));
  // A heading the outline did not list (the lint rejects them, but one can still arrive)
  // gets an id that cannot collide with the outline's ids or with another such heading.
  const spareSlug = createSlugger(headings.map((heading) => heading.id));
  const spareIds = new Map<number, string>();
  function spareId(text: string, line: number | undefined): string {
    if (line === undefined) return spareSlug(text);
    const known = spareIds.get(line);
    if (known) return known;
    const id = spareSlug(text);
    spareIds.set(line, id);
    return id;
  }

  function heading(source: 1 | 2 | 3 | 4 | 5 | 6, className: string) {
    const Tag = `h${Math.min(source + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
    return function FaqHeading({
      node,
      children,
      id: authoredId,
    }: ComponentProps<"h1"> & ExtraProps) {
      const known = headingAtLine.get(node?.position?.start.line ?? -1);
      const text = known?.depth === source ? known.text : reactText(children);
      const id =
        (known?.depth === source ? known.id : authoredId) ??
        spareId(text, node?.position?.start.line);
      return (
        <Tag id={id} className={cn("group scroll-mt-6 font-serif text-ink", className)}>
          {children}
          {id ? (
            // A plain `#id` link: the browser scrolls the article's own scroll area to it and
            // the address bar gains the hash. A router Link here would mark every heading
            // link as the current page.
            <a
              href={`#${id}`}
              aria-label={`Link to this section: ${text}`}
              className="ml-1 -my-3 inline-flex size-11 items-center justify-center rounded-control align-middle text-muted transition-opacity hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
            >
              <Hash className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </a>
          ) : null}
        </Tag>
      );
    };
  }

  return {
    h1: heading(1, "mt-12 mb-3 text-2xl font-semibold tracking-tight"),
    h2: heading(2, "mt-12 mb-3 text-2xl font-semibold tracking-tight"),
    h3: heading(3, "mt-8 mb-2 text-lg font-semibold"),
    h4: heading(4, "mt-6 mb-2 text-base font-semibold"),
    h5: heading(5, "mt-6 mb-2 text-base font-semibold"),
    h6: heading(6, "mt-6 mb-2 text-base font-semibold"),

    p: ({ node: _node, ...props }) => <p className="my-4" {...props} />,
    strong: ({ node: _node, ...props }) => <strong className="font-semibold text-ink" {...props} />,
    del: ({ node: _node, ...props }) => <del className="text-muted" {...props} />,
    hr: () => <hr className="my-10 border-0 border-t border-line" />,

    ul: ({ node: _node, className, ...props }) => (
      <ul
        className={cn(
          "my-4 list-disc space-y-1.5 pl-6 marker:text-muted [&_ol]:my-2 [&_ul]:my-2",
          className?.includes("contains-task-list") && "list-none pl-0",
          className,
        )}
        {...props}
      />
    ),
    ol: ({ node: _node, className, ...props }) => (
      <ol
        className={cn(
          "my-4 list-decimal space-y-1.5 pl-6 marker:text-muted [&_ol]:my-2 [&_ul]:my-2",
          className,
        )}
        {...props}
      />
    ),
    li: ({ node: _node, className, ...props }) => (
      <li className={cn("pl-1 [&>p]:my-1", className)} {...props} />
    ),
    input: ({ node: _node, ...props }) => <input className="mr-2 align-middle" {...props} />,

    a: ({ node: _node, href, children }) => {
      if (!href) return <span>{children}</span>;
      const target = classifyHref(href, slug);

      if (target.kind === "anchor") {
        return (
          <a href={`#${target.hash}`} className={ARTICLE_LINK}>
            {children}
          </a>
        );
      }
      if (target.kind === "article") {
        return (
          <Link
            to="/faqs/$slug"
            params={{ slug: target.slug }}
            hash={target.hash}
            className={ARTICLE_LINK}
          >
            {children}
          </Link>
        );
      }
      if (target.kind === "index") {
        return (
          <Link to="/faqs" search={{ q: target.q }} className={ARTICLE_LINK}>
            {children}
          </Link>
        );
      }
      if (target.kind === "external") {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className={ARTICLE_LINK}>
            {children}
            <ExternalLink
              className="ml-1 inline size-3.5 align-baseline"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {/* sr-only is absolutely positioned. Inside this positioned link it stays in the
                article's scrolling area; without one it is placed against the whole document
                and makes the page scrollable, so an in-page jump slides the staff shell up. */}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        );
      }
      return (
        <a href={href} className={ARTICLE_LINK}>
          {children}
        </a>
      );
    },

    blockquote: ({ node, children }) => {
      const kind = calloutKind(node);
      if (kind) return <FaqCallout kind={kind}>{children}</FaqCallout>;
      // An ordinary quote: a quiet panel, hairline border all round, no side stripe.
      return (
        <blockquote className="my-6 rounded-panel border border-line bg-card px-4 py-3 text-muted italic">
          {children}
        </blockquote>
      );
    },

    pre: ({ node: _node, children }) => (
      // A code block that overflows scrolls sideways, so it has to be reachable by keyboard.
      <pre
        role="region"
        aria-label="Code example"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="my-5 overflow-x-auto rounded-panel border border-line bg-card p-4 text-[0.8125rem] leading-6 text-ink"
      >
        {children}
      </pre>
    ),
    code: ({ node: _node, className, children }) => {
      const isBlock = /language-/.test(className ?? "") || reactText(children).includes("\n");
      return isBlock ? (
        <code className={cn("font-mono", className)}>{children}</code>
      ) : (
        <code className="rounded-control bg-accent-soft/70 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
          {children}
        </code>
      );
    },

    table: ({ node: _node, ...props }) => (
      // A wide table scrolls inside its own region instead of the page, so the
      // region is focusable and named.
      <div
        role="region"
        aria-label="Table, scrolls sideways when it is wider than the screen"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="my-6 overflow-x-auto rounded-panel border border-line"
      >
        <table className="w-full min-w-[26rem] border-collapse text-sm" {...props} />
      </div>
    ),
    thead: ({ node: _node, ...props }) => (
      <thead className="border-b border-line bg-accent-soft/50" {...props} />
    ),
    tr: ({ node: _node, ...props }) => (
      <tr className="border-b border-line last:border-b-0" {...props} />
    ),
    th: ({ node: _node, align, ...props }) => (
      <th
        scope="col"
        className={cn("px-4 py-3 text-xs font-semibold text-ink", ALIGN[align ?? "left"])}
        {...props}
      />
    ),
    td: ({ node: _node, align, ...props }) => (
      <td className={cn("px-4 py-3 align-top text-ink", ALIGN[align ?? "left"])} {...props} />
    ),

    img: ({ node: _node, alt, ...props }) => (
      <img
        alt={alt ?? ""}
        loading="lazy"
        className="my-5 max-w-full rounded-panel border border-line"
        {...props}
      />
    ),
  };
}

export function FaqMarkdown({
  slug,
  body,
  headings,
}: {
  slug: string;
  body: string;
  headings: readonly FaqHeading[];
}) {
  const components = useMemo(() => buildComponents(slug, headings), [slug, headings]);
  return (
    <div className="max-w-[68ch] text-base leading-7 text-ink/90 [overflow-wrap:anywhere]">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {body}
      </Markdown>
    </div>
  );
}
