/**
 * The FAQ library as the app sees it: every `src/content/faqs/*.md` file, read at
 * build time and turned into articles. This is the only module that touches
 * `import.meta.glob`, which is Vite-only, so everything it feeds stays testable.
 */
import { loadArticles } from "./articles";
import { createFaqIndex } from "./search";
import type { FaqArticle } from "./types";

// src: https://vite.dev/guide/features#glob-import · vite 7.3.6 · 2026-10-07
// `?raw` + `import: "default"` gives each file's text; `eager` bundles them with the
// route instead of fetching on demand, which search needs anyway. `*.md` matches only
// files directly in the folder, so `__fixtures__/` is never bundled. Vite requires the
// arguments to be literals.
const files = import.meta.glob<string>("../../content/faqs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const loaded = loadArticles(files);

export const faqArticles: readonly FaqArticle[] = loaded.articles;
/** Files that could not become articles. The list page shows them; the content test fails on them. */
export const faqProblems = loaded.problems;
export const faqIndex = createFaqIndex(faqArticles);

export function findFaqArticle(slug: string): FaqArticle | undefined {
  return faqArticles.find((article) => article.slug === slug);
}
