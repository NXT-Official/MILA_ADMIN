import { useMemo, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, CornerDownRight, SearchX, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { groupByCategory } from "@/lib/faqs/articles";
import { formatUpdated } from "@/lib/faqs/format";
import { slugifyHeading } from "@/lib/faqs/outline";
import { searchFaqs, type FaqIndex, type FaqSearchHit } from "@/lib/faqs/search";
import type { FaqArticle, FaqProblem } from "@/lib/faqs/types";
import { FaqHighlight } from "./faq-highlight";
import { FaqSearchBox } from "./faq-search-box";
import { FaqStatusPill } from "./faq-status-pill";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function ProblemsNotice({ problems }: { problems: readonly FaqProblem[] }) {
  return (
    <div
      role="alert"
      className="rounded-panel border border-destructive/40 bg-destructive/10 p-4 text-sm text-ink"
    >
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {plural(problems.length, "problem", "problems")} with the training files. Articles with a
        problem are left out.
      </p>
      <ul className="mt-2 space-y-1 pl-6">
        {problems.map((problem, index) => (
          <li key={`${problem.file}-${index}`}>
            <code className="font-mono text-[0.85em]">{fileName(problem.file)}</code>:{" "}
            {problem.message}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-muted">A developer needs to fix these files and release again.</p>
    </div>
  );
}

function ArticleRow({ article }: { article: FaqArticle }) {
  return (
    <li>
      <Link
        to="/faqs/$slug"
        params={{ slug: article.slug }}
        className="atelier-focus-ring group -mx-3 flex flex-col gap-2 rounded-panel px-3 py-4 transition-colors hover:bg-accent-soft/50 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
      >
        <div className="min-w-0">
          <h3 className="font-serif text-lg font-semibold text-ink decoration-accent decoration-2 underline-offset-4 group-hover:underline">
            {article.title}
          </h3>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted">{article.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted sm:flex-col sm:items-end sm:gap-1.5">
          <FaqStatusPill status={article.status} />
          <span>Updated {formatUpdated(article.updated)}</span>
        </div>
      </Link>
    </li>
  );
}

function Topics({ articles }: { articles: readonly FaqArticle[] }) {
  const groups = useMemo(() => groupByCategory(articles), [articles]);
  return (
    <div>
      {groups.map(({ category, articles: inCategory }) => {
        const headingId = `faq-topic-${slugifyHeading(category)}`;
        return (
          <section
            key={category}
            aria-labelledby={headingId}
            className="grid gap-3 border-t border-line py-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-10"
          >
            <div>
              <h2 id={headingId} className="font-serif text-xl font-semibold text-ink">
                {category}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {plural(inCategory.length, "article", "articles")}
              </p>
            </div>
            <ul className="divide-y divide-line">
              {inCategory.map((article) => (
                <ArticleRow key={article.slug} article={article} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ResultRow({ hit, query }: { hit: FaqSearchHit; query: string }) {
  const { article, heading } = hit;
  return (
    <li>
      <Link
        to="/faqs/$slug"
        params={{ slug: article.slug }}
        search={{ q: query }}
        hash={heading?.id}
        className="atelier-focus-ring block rounded-panel px-3 py-4 transition-colors hover:bg-accent-soft/50"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{article.category}</span>
          <FaqStatusPill status={article.status} />
        </div>
        <h3 className="mt-1.5 font-serif text-lg font-semibold text-ink">
          <FaqHighlight parts={hit.titleParts} />
        </h3>
        <p className="mt-1 max-w-[68ch] text-sm leading-6 text-ink/80">
          <FaqHighlight parts={hit.snippet} />
        </p>
        {heading ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink">
            <CornerDownRight
              className="size-3.5 shrink-0 text-muted"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="text-muted">Jumps to</span>
            <span>
              <FaqHighlight parts={heading.parts} />
            </span>
          </p>
        ) : null}
      </Link>
    </li>
  );
}

export interface FaqBrowserProps {
  articles: readonly FaqArticle[];
  problems: readonly FaqProblem[];
  index: FaqIndex;
  query: string;
  onQueryChange: (query: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/** The FAQs list: a search box over the articles, and the articles grouped by topic. */
export function FaqBrowser({
  articles,
  problems,
  index,
  query,
  onQueryChange,
  inputRef,
}: FaqBrowserProps) {
  const trimmed = query.trim();
  const hits = useMemo(() => searchFaqs(index, query), [index, query]);
  const topicCount = useMemo(() => groupByCategory(articles).length, [articles]);
  const hasArticles = articles.length > 0;

  let status = "";
  if (hasArticles) {
    status =
      trimmed === ""
        ? `${plural(articles.length, "article", "articles")} in ${plural(topicCount, "topic", "topics")}`
        : `${plural(hits.length, "article matches", "articles match")} “${trimmed}”`;
  }

  return (
    <div className="relative space-y-6">
      {problems.length > 0 ? <ProblemsNotice problems={problems} /> : null}

      <FaqSearchBox value={query} onChange={onQueryChange} inputRef={inputRef} />

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted">
        {status}
      </p>

      {!hasArticles ? (
        <EmptyState
          icon={<BookOpen className="size-8" strokeWidth={1.5} />}
          title="No training articles yet"
          description="Articles are written as files in the admin project and arrive with a release. Check back after the next one."
        />
      ) : trimmed === "" ? (
        <Topics articles={articles} />
      ) : hits.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-8" strokeWidth={1.5} />}
          title={`Nothing matches “${trimmed}”`}
          description="Every word has to appear in the same article. Try fewer or shorter words, or check the spelling."
          action={
            <Button variant="outline" size="md" onClick={() => onQueryChange("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {hits.map((hit) => (
            <ResultRow key={hit.article.slug} hit={hit} query={trimmed} />
          ))}
        </ul>
      )}
    </div>
  );
}
