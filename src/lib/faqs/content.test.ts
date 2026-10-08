/**
 * Runs the content contract over every REAL article in `src/content/faqs`.
 *
 * With no articles it passes. The moment one exists it has to be valid, and any
 * article that is not fails this file with the file name and the reason, so a bad
 * one cannot ship. Test fixtures live in `__fixtures__/` and are not checked here.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { loadArticles } from "./articles";
import { findFaqLinks, findUnloadableEntries, lintArticles } from "./lint";

const FAQS_DIR = new URL("../../content/faqs/", import.meta.url);
// Built from its code point so this file holds no dash of its own.
const EM_DASH = String.fromCodePoint(0x2014);

/** The same files Vite's `*.md` glob picks up: Markdown directly in the folder. */
function realArticleFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(FAQS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files[`src/content/faqs/${entry.name}`] = readFileSync(new URL(entry.name, FAQS_DIR), "utf8");
    }
  }
  return files;
}

const files = realArticleFiles();
const { articles, problems } = loadArticles(files);

const describeProblems = (list: { file: string; message: string }[]) =>
  list.map((problem) => `${problem.file}: ${problem.message}`).join("\n");

describe("the FAQ articles in src/content/faqs", () => {
  test("every file is a valid article, with frontmatter that follows the contract", () => {
    expect(describeProblems(problems)).toBe("");
  });

  test("every file became an article, so none was dropped", () => {
    expect(articles).toHaveLength(Object.keys(files).length);
  });

  test("slugs are unique", () => {
    const slugs = articles.map((article) => article.slug);
    expect(slugs.filter((slug, index) => slugs.indexOf(slug) !== index)).toEqual([]);
  });

  test("every category is one the contract knows", () => {
    // validateFrontmatter enforces this; the assertion is here so a loosened
    // validator is still caught by the content.
    const known = new Set([
      "Start here",
      "Credits & billing",
      "Members & accounts",
      "Sign-in & sessions",
      "AI features",
      "Shop & catalogue",
      "Community & moderation",
      "Support",
      "Platform & releases",
      "Reference",
    ]);
    expect(articles.filter((article) => !known.has(article.category)).map((a) => a.slug)).toEqual(
      [],
    );
  });

  test("there is no raw HTML, no em dash, no level-one heading and no broken link", () => {
    expect(describeProblems(lintArticles(articles))).toBe("");
  });

  test("every /faqs/<slug> link resolves to an article", () => {
    const slugs = new Set(articles.map((article) => article.slug));
    const broken = articles.flatMap((article) =>
      findFaqLinks(article.body)
        .filter((link) => !slugs.has(link.slug))
        .map((link) => `${article.path}: /faqs/${link.slug}`),
    );
    expect(broken).toEqual([]);
  });

  test("no body contains an em dash", () => {
    const withDash = articles
      .filter((article) => article.body.includes(EM_DASH))
      .map((article) => article.path);
    expect(withDash).toEqual([]);
  });
});

describe("the content test itself", () => {
  test("fails on a bad article, so it cannot pass by checking nothing", () => {
    const bad = loadArticles({
      "src/content/faqs/broken.md": "---\ntitle: Missing the rest\n---\nBody\n",
    });
    expect(bad.problems.length).toBeGreaterThan(0);
    expect(bad.articles).toEqual([]);
  });

  test("and fails on a good-looking one that breaks a body rule", () => {
    const { articles: loaded } = loadArticles({
      "src/content/faqs/oops.md": [
        "---",
        "title: Oops",
        "category: Reference",
        "summary: Breaks the rules.",
        "tags: [oops]",
        "order: 1",
        "updated: 2026-10-07",
        "---",
        `<div>raw</div> and a dash ${EM_DASH} and [a link](/faqs/missing).`,
      ].join("\n"),
    });
    const messages = lintArticles(loaded).map((problem) => problem.message);
    expect(messages.some((message) => message.includes("raw HTML"))).toBe(true);
    expect(messages.some((message) => message.includes("em dash"))).toBe(true);
    expect(messages.some((message) => message.includes("/faqs/missing"))).toBe(true);
  });

  test("reads the same files Vite bundles, and not the fixtures", () => {
    expect(Object.keys(files).some((path) => path.includes("__fixtures__"))).toBe(false);
    const library = readFileSync(new URL("./library.ts", import.meta.url), "utf8");
    expect(library).toContain('"../../content/faqs/*.md"');
    expect(library).toContain('query: "?raw"');
    expect(library).toContain("eager: true");
  });
});

describe("the content folder", () => {
  test("holds nothing the loader would silently skip", () => {
    const entries = readdirSync(FAQS_DIR, { withFileTypes: true });
    const skipped = findUnloadableEntries(entries).map((item) => `${item.name}: ${item.message}`);
    expect(skipped.join("\n")).toBe("");
  });

  test("still holds the credits and refunds guide, so an emptied folder cannot pass", () => {
    expect(articles.some((article) => article.slug === "credits-and-refunds")).toBe(true);
  });
});
