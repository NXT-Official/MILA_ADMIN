import { useEffect, useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronDown, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { neighbours } from "@/lib/faqs/articles";
import { formatUpdated } from "@/lib/faqs/format";
import type { FaqArticle, FaqHeading } from "@/lib/faqs/types";
import { FaqMarkdown } from "./faq-markdown";
import { FaqStatusPill } from "./faq-status-pill";

/**
 * `/faqs` is a prefix of `/faqs/<slug>`, so a router Link to the list would count as the
 * current page while an article is open and be announced as such. Match exactly instead.
 */
const EXACT = { exact: true } as const;

const BACK_LINK =
  "atelier-focus-ring -ml-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-ink transition-colors hover:bg-accent-soft/50";

/** `##` headings with the `###` headings that follow them nested underneath. */
function tocTree(headings: readonly FaqHeading[]) {
  const tree: { heading: FaqHeading; children: FaqHeading[] }[] = [];
  for (const heading of headings) {
    const parent = tree[tree.length - 1];
    if (heading.depth === 3 && parent) parent.children.push(heading);
    else tree.push({ heading, children: [] });
  }
  return tree;
}

function OnThisPage({ headings }: { headings: readonly FaqHeading[] }) {
  const link =
    "block rounded-control py-2.5 pr-3 text-muted transition-colors hover:bg-accent-soft/50 hover:text-ink xl:py-1.5";
  return (
    <nav aria-label="On this page">
      <ol className="text-sm">
        {tocTree(headings).map(({ heading, children }) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className={`${link} pl-3`}>
              {heading.text}
            </a>
            {children.length > 0 ? (
              <ol>
                {children.map((child) => (
                  <li key={child.id}>
                    <a href={`#${child.id}`} className={`${link} pl-6`}>
                      {child.text}
                    </a>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PreviousNext({
  articles,
  article,
}: {
  articles: readonly FaqArticle[];
  article: FaqArticle;
}) {
  const { previous, next } = useMemo(() => neighbours(articles, article.slug), [articles, article]);
  if (!previous && !next) return null;

  const card =
    "atelier-focus-ring group flex min-h-16 flex-col gap-1 rounded-panel border border-line p-4 transition-colors hover:bg-accent-soft/50";
  return (
    <nav
      aria-label={`More in ${article.category}`}
      className="mt-14 grid gap-3 border-t border-line pt-8 sm:grid-cols-2"
    >
      {previous ? (
        <Link
          to="/faqs/$slug"
          params={{ slug: previous.slug }}
          className={`${card} sm:col-start-1`}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            Previous
          </span>
          <span className="font-serif text-base font-semibold text-ink">{previous.title}</span>
        </Link>
      ) : null}
      {next ? (
        <Link
          to="/faqs/$slug"
          params={{ slug: next.slug }}
          className={`${card} sm:col-start-2 sm:items-end sm:text-right`}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted">
            Next
            <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="font-serif text-base font-semibold text-ink">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

export interface FaqArticleViewProps {
  article: FaqArticle;
  /** Every article, so previous and next can be worked out. */
  articles: readonly FaqArticle[];
  /** The search the reader came from, so they can go back to its results. */
  q?: string;
  /** The heading to scroll to, from the address. */
  hash?: string;
}

export function FaqArticleView({ article, articles, q, hash }: FaqArticleViewProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const showContents = article.headings.length >= 2;

  // The page scrolls inside the staff shell's <main>, which the router does not
  // reset. Land on the heading from the address, or at the top of a new article.
  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    if (hash) {
      document.getElementById(hash)?.scrollIntoView();
      return;
    }
    title.closest("main")?.scrollTo({ top: 0 });
    title.focus({ preventScroll: true });
  }, [article.slug, hash]);

  return (
    // `relative` keeps any absolutely positioned descendant inside the scrolling area.
    <article className="relative">
      <Link to="/faqs" search={{ q }} activeOptions={EXACT} className={BACK_LINK}>
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {q ? `Back to results for “${q}”` : "All FAQs"}
      </Link>

      <header className="mt-4 max-w-[68ch]">
        <p className="atelier-kicker">{article.category}</p>
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="mt-3 font-serif text-3xl font-bold tracking-tight text-ink outline-none sm:text-4xl"
        >
          {article.title}
        </h2>
        <p className="mt-4 text-lg leading-8 text-muted">{article.summary}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <FaqStatusPill status={article.status} />
          <p>
            Updated <time dateTime={article.updated}>{formatUpdated(article.updated)}</time>
          </p>
        </div>
      </header>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0">
          {showContents ? (
            <details className="group mb-8 rounded-panel border border-line xl:hidden">
              <summary className="atelier-focus-ring flex min-h-11 cursor-pointer items-center justify-between rounded-panel px-4 text-sm font-semibold text-ink">
                On this page
                <ChevronDown
                  className="size-4 text-muted transition-transform group-open:rotate-180"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </summary>
              <div className="px-4 pb-3">
                <OnThisPage headings={article.headings} />
              </div>
            </details>
          ) : null}

          <FaqMarkdown slug={article.slug} body={article.body} headings={article.headings} />
          <PreviousNext articles={articles} article={article} />

          <p className="mt-10 text-sm text-muted">
            Not what you were after?{" "}
            <Link
              to="/faqs"
              activeOptions={EXACT}
              className="rounded-sm text-ink underline decoration-accent decoration-2 underline-offset-4"
            >
              Search all articles
            </Link>
          </p>
        </div>

        {showContents ? (
          <aside className="hidden xl:block">
            {/* A long outline scrolls on its own so its last entries are never pushed off screen. */}
            <div className="sticky top-6 max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain pr-1">
              <p className="atelier-label mb-3">On this page</p>
              <OnThisPage headings={article.headings} />
            </div>
          </aside>
        ) : null}
      </div>
    </article>
  );
}

/** Shown when an address names an article that is not in the library. */
export function FaqArticleMissing({ q }: { q?: string }) {
  return (
    <EmptyState
      icon={<SearchX className="size-8" strokeWidth={1.5} />}
      title="That article is not here"
      description="It may have been renamed or removed. Go back and search for it again."
      action={
        <Button asChild variant="outline" size="md">
          <Link to="/faqs" search={{ q }} activeOptions={EXACT}>
            {q ? "Back to results" : "Back to all FAQs"}
          </Link>
        </Button>
      }
    />
  );
}
