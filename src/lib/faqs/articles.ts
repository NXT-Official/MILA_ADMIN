/**
 * Turns the Markdown files in `src/content/faqs` into articles.
 *
 * Nothing here touches the file system or `import.meta.glob`, so it can be tested
 * with plain strings; `library.ts` is the one place that feeds it the real files.
 * A file that cannot become an article is never dropped silently: it comes back
 * in `problems`, which the page shows to staff and the content test fails on.
 */
import { FrontmatterError, parseFrontmatter } from "./frontmatter";
import { extractOutline } from "./outline";
import { FAQ_CATEGORIES, type FaqArticle, type FaqCategory, type FaqProblem } from "./types";
import { validateFrontmatter } from "./validate";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Test fixtures live here and must never reach staff. */
const FIXTURES_DIR = "__fixtures__";

export class FaqArticleError extends Error {
  readonly path: string;
  readonly issues: string[];

  constructor(path: string, issues: string[]) {
    super(`${path}: ${issues.join(" ")}`);
    this.name = "FaqArticleError";
    this.path = path;
    this.issues = issues;
  }
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]/);
}

/** `a/b/credits-and-refunds.md` is `credits-and-refunds`. */
export function slugFromPath(path: string): string {
  const name = pathSegments(path).pop() ?? path;
  return name.replace(/\.md$/i, "");
}

/** Builds one article, or throws a `FaqArticleError` naming everything wrong with it. */
export function parseArticle(path: string, raw: string): FaqArticle {
  const slug = slugFromPath(path);
  const issues: string[] = [];

  if (!SLUG_PATTERN.test(slug)) {
    issues.push(
      `The file name "${slug}" must be lowercase kebab-case, like credits-and-refunds.md.`,
    );
  }

  let parsed: ReturnType<typeof parseFrontmatter> | null = null;
  try {
    parsed = parseFrontmatter(raw);
  } catch (error) {
    if (!(error instanceof FrontmatterError)) throw error;
    issues.push(error.message);
  }

  const validation = parsed ? validateFrontmatter(parsed.data) : null;
  if (validation) issues.push(...validation.issues);

  if (parsed && parsed.body.trim() === "") {
    issues.push("The article has no body text after the frontmatter.");
  }

  if (issues.length > 0 || !parsed || !validation?.meta) {
    throw new FaqArticleError(path, issues);
  }

  const { headings, sections } = extractOutline(parsed.body);
  return {
    ...validation.meta,
    slug,
    path,
    body: parsed.body,
    bodyLineOffset: parsed.bodyLineOffset,
    headings,
    sections,
  };
}

const categoryRank = (category: FaqCategory) => FAQ_CATEGORIES.indexOf(category);

/** Category display order, then the author's `order`, then the title. */
export function compareArticles(a: FaqArticle, b: FaqArticle): number {
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    a.order - b.order ||
    a.title.localeCompare(b.title, "en")
  );
}

export interface LoadedFaqs {
  articles: FaqArticle[];
  problems: FaqProblem[];
}

/**
 * `files` maps a path to the raw text of that file. Fixtures and non-Markdown
 * files are skipped on purpose; everything else either becomes an article or a
 * problem, so the two lists together account for every real file.
 */
export function loadArticles(files: Record<string, string>): LoadedFaqs {
  const articles: FaqArticle[] = [];
  const problems: FaqProblem[] = [];
  const seen = new Map<string, string>();

  for (const path of Object.keys(files).sort()) {
    if (pathSegments(path).includes(FIXTURES_DIR)) continue;
    if (!/\.md$/i.test(path)) continue;

    try {
      const article = parseArticle(path, files[path] ?? "");
      const firstPath = seen.get(article.slug);
      if (firstPath !== undefined) {
        problems.push({
          file: path,
          message: `The slug "${article.slug}" is already used by ${firstPath}. Slugs come from file names and must be unique.`,
        });
        continue;
      }
      seen.set(article.slug, path);
      articles.push(article);
    } catch (error) {
      if (error instanceof FaqArticleError) {
        for (const issue of error.issues) problems.push({ file: path, message: issue });
      } else {
        problems.push({ file: path, message: `Could not be read: ${String(error)}` });
      }
    }
  }

  return { articles: articles.sort(compareArticles), problems };
}

export interface FaqCategoryGroup {
  category: FaqCategory;
  articles: FaqArticle[];
}

/** Non-empty categories in display order, each with its articles in order. */
export function groupByCategory(articles: readonly FaqArticle[]): FaqCategoryGroup[] {
  const sorted = [...articles].sort(compareArticles);
  return FAQ_CATEGORIES.map((category) => ({
    category,
    articles: sorted.filter((article) => article.category === category),
  })).filter((group) => group.articles.length > 0);
}

/** The articles either side of `slug` inside its own category. */
export function neighbours(
  articles: readonly FaqArticle[],
  slug: string,
): { previous: FaqArticle | null; next: FaqArticle | null } {
  const current = articles.find((article) => article.slug === slug);
  if (!current) return { previous: null, next: null };
  const siblings = articles
    .filter((article) => article.category === current.category)
    .sort(compareArticles);
  const index = siblings.findIndex((article) => article.slug === slug);
  return { previous: siblings[index - 1] ?? null, next: siblings[index + 1] ?? null };
}
