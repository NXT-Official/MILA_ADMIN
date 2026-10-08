/**
 * Checks on an article's body that the content contract asks for and a parser
 * cannot enforce: no raw HTML, no em dashes, no level-one heading, and no link
 * that goes nowhere. `lintArticles` is what the content test runs over every
 * real article, so a bad one fails the build's tests instead of shipping.
 */
import { closesFence, openFence, type Fence } from "./outline";
import type { FaqArticle, FaqProblem } from "./types";

// Built from its code point so this file holds no dash of its own.
const EM_DASH = String.fromCodePoint(0x2014);
const FAQ_PREFIX = "/faqs/";

/**
 * The body with fenced code lines blanked and inline code spans replaced by
 * spaces, one entry per line, so a scan sees prose and nothing else.
 */
function proseLines(body: string): string[] {
  let fence: Fence | null = null;
  return body.split("\n").map((line) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      return "";
    }
    const opening = openFence(line);
    if (opening) {
      fence = opening;
      return "";
    }
    return line.replace(/(`+)(.+?)\1/g, (span) => " ".repeat(span.length));
  });
}

const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>|<!--/;

/** One finding per line, the first tag on it, which is enough to find and fix it. */
export function findRawHtml(body: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  proseLines(body).forEach((line, index) => {
    const tag = HTML_TAG.exec(line)?.[0];
    if (tag) found.push({ line: index + 1, text: tag });
  });
  return found;
}

/** Body lines that open with a single `#`. The title comes from the frontmatter. */
export function findLevelOneHeadings(body: string): number[] {
  const lines: number[] = [];
  proseLines(body).forEach((line, index) => {
    if (/^ {0,3}#[ \t]+\S/.test(line)) lines.push(index + 1);
  });
  return lines;
}

export interface FaqLink {
  slug: string;
  hash: string | null;
  line: number;
}

const INLINE_FAQ_LINK = /\]\(\s*<?(\/faqs\/[^\s)>]*)/g;
const REFERENCE_FAQ_LINK = /^ {0,3}\[[^\]]+\]:\s*<?(\/faqs\/\S*)/;

/** Links to other articles, `/faqs/<slug>` with an optional `#heading`. The index page is not one. */
export function findFaqLinks(body: string): FaqLink[] {
  const links: FaqLink[] = [];

  proseLines(body).forEach((line, index) => {
    const targets = [...line.matchAll(INLINE_FAQ_LINK)].map((match) => match[1] ?? "");
    const reference = REFERENCE_FAQ_LINK.exec(line)?.[1];
    if (reference) targets.push(reference);

    for (const target of targets) {
      const rest = target.slice(FAQ_PREFIX.length);
      const hashAt = rest.indexOf("#");
      const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt);
      const slug = beforeHash.split(/[/?]/)[0] ?? "";
      if (slug === "") continue;
      const hash = hashAt === -1 ? "" : rest.slice(hashAt + 1);
      links.push({ slug, hash: hash === "" ? null : hash, line: index + 1 });
    }
  });

  return links;
}

const SAME_PAGE_ANCHOR = /\]\(\s*#([^\s)]*)\)/g;

function findAnchorLinks(body: string): { hash: string; line: number }[] {
  const anchors: { hash: string; line: number }[] = [];
  proseLines(body).forEach((line, index) => {
    for (const match of line.matchAll(SAME_PAGE_ANCHOR)) {
      if (match[1]) anchors.push({ hash: match[1], line: index + 1 });
    }
  });
  return anchors;
}

function decode(hash: string): string {
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

/** Every contract problem across a set of articles. An empty list means clean. */
export function lintArticles(articles: readonly FaqArticle[]): FaqProblem[] {
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  const problems: FaqProblem[] = [];

  for (const article of articles) {
    const report = (message: string) => problems.push({ file: article.path, message });
    const fileLine = (bodyLine: number) => `line ${article.bodyLineOffset + bodyLine}`;

    for (const field of ["title", "summary"] as const) {
      if (article[field].includes(EM_DASH)) {
        report(`The ${field} has an em dash. Use a comma, colon, period or hyphen.`);
      }
    }
    if (article.tags.some((tag) => tag.includes(EM_DASH))) {
      report("A tag has an em dash. Use a hyphen.");
    }

    article.body.split("\n").forEach((line, index) => {
      if (line.includes(EM_DASH)) {
        report(
          `${fileLine(index + 1)}: em dash. Use a comma, colon, period, parentheses or a hyphen.`,
        );
      }
    });

    for (const { line, text } of findRawHtml(article.body)) {
      report(`${fileLine(line)}: raw HTML (${text}) is not allowed. Use Markdown.`);
    }

    for (const line of findLevelOneHeadings(article.body)) {
      report(
        `${fileLine(line)}: a level-one heading. Start sections at "##"; the title comes from the frontmatter.`,
      );
    }

    for (const { line, text } of findUnsupportedHeadings(article.body)) {
      report(
        `${fileLine(line)}: a heading the page cannot index (${text}). Use "##" or "###" at the start of a line, not "####", an underlined title, or a heading inside a quote or list.`,
      );
    }

    for (const link of findFaqLinks(article.body)) {
      const target = bySlug.get(link.slug);
      if (!target) {
        report(
          `${fileLine(link.line)}: links to ${FAQ_PREFIX}${link.slug}, but no article has the slug "${link.slug}".`,
        );
        continue;
      }
      if (link.hash !== null && !target.headings.some((h) => h.id === decode(link.hash ?? ""))) {
        const ids = target.headings.map((h) => h.id);
        report(
          `${fileLine(link.line)}: ${FAQ_PREFIX}${link.slug}#${link.hash} points at a heading that does not exist. ${
            ids.length > 0
              ? `Its heading ids are: ${ids.join(", ")}.`
              : "That article has no headings."
          }`,
        );
      }
    }

    for (const { hash, line } of findAnchorLinks(article.body)) {
      if (!article.headings.some((h) => h.id === decode(hash))) {
        const ids = article.headings.map((h) => h.id);
        report(
          `${fileLine(line)}: #${hash} matches no heading in this article. ${
            ids.length > 0 ? `Heading ids: ${ids.join(", ")}.` : "It has no headings."
          }`,
        );
      }
    }
  }

  return problems;
}

export interface UnsupportedHeading {
  line: number;
  text: string;
}

const TOO_DEEP_HEADING = /^ {0,3}#{4,6}[ \t]+\S/;
const NESTED_HEADING = /^\s*(?:(?:>\s?)+|(?:[-*+]|\d{1,9}[.)])[ \t]+)\s*#{1,6}[ \t]+\S/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const NOT_SETEXT_TEXT = /^\s*(?:$|[|>#]|[-*+][ \t]|\d{1,9}[.)][ \t]|(?:=+|-+)[ \t]*$)/;

/**
 * Headings the outline cannot see. The contract allows `##` and `###` at the start
 * of a line, and only those get a stable, de-duplicated id, a place in "On this
 * page" and a search section. A `####`, a setext heading (text over `---`) or a
 * heading inside a quote or list renders, but with none of that, so each is
 * reported for the author to turn into a `##` or `###`.
 */
export function findUnsupportedHeadings(body: string): UnsupportedHeading[] {
  const lines = proseLines(body);
  const found: UnsupportedHeading[] = [];
  lines.forEach((line, index) => {
    if (TOO_DEEP_HEADING.test(line) || NESTED_HEADING.test(line)) {
      found.push({ line: index + 1, text: line.trim() });
      return;
    }
    const previous = index > 0 ? (lines[index - 1] ?? "") : "";
    if (SETEXT_UNDERLINE.test(line) && !NOT_SETEXT_TEXT.test(previous)) {
      found.push({ line: index, text: previous.trim() });
    }
  });
  return found;
}

export interface UnloadableEntry {
  name: string;
  message: string;
}

/**
 * Entries in `src/content/faqs` the loader never sees. Vite's glob reads `*.md`
 * directly in the folder and is case-sensitive, so `Refunds.MD`, `notes.markdown`
 * and `billing/refunds.md` are skipped without a word and the article never
 * ships. Only `__fixtures__` (test data) is meant to sit there besides articles.
 */
export function findUnloadableEntries(
  entries: readonly { name: string; isFile(): boolean; isDirectory(): boolean }[],
): UnloadableEntry[] {
  const found: UnloadableEntry[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name !== "__fixtures__") {
        found.push({
          name: entry.name,
          message: "a subfolder is never loaded. Move its articles up into src/content/faqs.",
        });
      }
    } else if (!entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
      found.push({
        name: entry.name,
        message: 'only files ending in a lowercase ".md" are loaded. Rename it or move it out.',
      });
    }
  }
  return found;
}
