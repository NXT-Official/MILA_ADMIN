import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseArticle } from "@/lib/faqs/articles";
import type { FaqArticle } from "@/lib/faqs/types";
import { renderWithRouter } from "../../../tests/helpers/render-with-router";
import { FaqArticleMissing, FaqArticleView } from "./faq-article-view";

const fixture = (name: string) =>
  parseArticle(
    name,
    readFileSync(new URL(`../../content/faqs/__fixtures__/${name}`, import.meta.url), "utf8"),
  );

const ONE = fixture("sample-one.md");
const TWO = fixture("sample-two.md");

function make(slug: string, order: number, category = "Credits & billing", body = "Some text.\n") {
  return parseArticle(
    `${slug}.md`,
    [
      "---",
      `title: Article ${slug}`,
      `category: ${category}`,
      "summary: A summary.",
      "tags: [sample]",
      `order: ${order}`,
      "updated: 2026-10-07",
      "---",
      body,
    ].join("\n"),
  );
}

const view = (article: FaqArticle, articles: FaqArticle[], q?: string) =>
  renderWithRouter(
    <FaqArticleView article={article} articles={articles} q={q} />,
    `/faqs/${article.slug}`,
  );

const DASHES = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`);

describe("FaqArticleView", () => {
  test("shows the title as a heading, the summary and the category", async () => {
    const html = await view(ONE, [ONE, TWO]);
    expect(html).toMatch(/<h2[^>]*>Sample article one<\/h2>/);
    expect(html).toContain("A placeholder article used by the test suite.");
    expect(html).toContain("Reference");
  });

  test("states when it was last updated, in words, in a time element", async () => {
    const html = await view(ONE, [ONE, TWO]);
    expect(html).toContain("Updated");
    // React writes the attribute as dateTime; HTML does not care about the case.
    expect(html).toMatch(/<time[^>]*datetime="2026-10-07"[^>]*>7 October 2026<\/time>/i);
  });

  test("shows the status pill when the article sets one, and not otherwise", async () => {
    expect(await view(ONE, [ONE])).toContain("Partly live");
    const plain = make("plain", 1);
    expect(await view(plain, [plain])).not.toMatch(/data-status="(live|partly-live|coming)"/);
  });

  test("the links back to the list are not marked as the current page", async () => {
    // /faqs is a prefix of /faqs/<slug>, so a router Link would call it active unless told
    // to match exactly. aria-current="page" on a "back" link is wrong.
    for (const html of [await view(ONE, [ONE]), await view(ONE, [ONE], "refund")]) {
      expect(html).not.toContain("aria-current");
    }
  });

  test("lists the headings under On this page, each as a link to its anchor", async () => {
    const html = await view(ONE, [ONE, TWO]);
    expect(html).toContain('aria-label="On this page"');
    expect(html).toContain('href="#rules-at-a-glance"');
    expect(html).toContain('href="#worked-example"');
    expect(html).toContain('href="#examples-1"');
  });

  test("a deeper heading is indented under its parent", async () => {
    const html = await view(ONE, [ONE]);
    const nav = /aria-label="On this page"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(nav.indexOf("Rules at a glance")).toBeLessThan(nav.indexOf("Worked example"));
    expect(nav).toMatch(/<ol[^>]*>[\s\S]*<ol/);
  });

  test("an article with fewer than two headings has no On this page list", async () => {
    const short = make("short", 1, "Credits & billing", "Intro.\n\n## Only one\n\nText.\n");
    expect(await view(short, [short])).not.toContain("On this page");
  });

  test("renders the body, tables and all", async () => {
    const html = await view(ONE, [ONE, TWO]);
    expect(html).toContain("<table");
    expect(html).toContain("This is a callout note for the tests.");
  });

  test("offers previous and next inside the category, and never across it", async () => {
    const a = make("alpha", 1);
    const b = make("beta", 2);
    const c = make("gamma", 3);
    const elsewhere = make("delta", 1, "Reference");
    const html = await view(b, [a, b, c, elsewhere]);
    expect(html).toContain('aria-label="More in Credits &amp; billing"');
    expect(html).toMatch(/href="\/faqs\/alpha"/);
    expect(html).toMatch(/href="\/faqs\/gamma"/);
    expect(html).not.toContain('href="/faqs/delta"');
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
    expect(html).toContain("Article alpha");
    expect(html).toContain("Article gamma");
  });

  test("the first article has no Previous and the last has no Next", async () => {
    const a = make("alpha", 1);
    const b = make("beta", 2);
    const first = await view(a, [a, b]);
    expect(first).not.toContain("Previous");
    expect(first).toContain("Next");
    const last = await view(b, [a, b]);
    expect(last).toContain("Previous");
    expect(last).not.toContain("Next");
  });

  test("an article alone in its category has no previous and next navigation", async () => {
    const solo = make("solo", 1);
    expect(await view(solo, [solo])).not.toContain("More in");
  });

  test("links back to all the FAQs, or to the results it came from", async () => {
    const plain = await view(ONE, [ONE]);
    expect(plain).toMatch(/<a[^>]*href="\/faqs"[^>]*>[\s\S]*?All FAQs/);

    const fromSearch = await view(ONE, [ONE], "refund rules");
    expect(fromSearch).toContain("Back to results for");
    expect(fromSearch).toContain("refund rules");
    expect(fromSearch).toMatch(/href="\/faqs\?q=refund(%20|\+)rules"/);
  });

  test("ends with a way back to search", async () => {
    const html = await view(ONE, [ONE]);
    expect(html).toContain("Search all articles");
  });

  test("has no one-sided start or end border anywhere, outline rail included (the side-tab look)", async () => {
    const html = await view(ONE, [ONE, TWO], "refund");
    const tokens = [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
      (match[1] ?? "").split(/\s+/),
    );
    expect(tokens.filter((token) => /(^|:)border-[lrse](-|$)/.test(token))).toEqual([]);
  });

  test("avoids em and en dashes in everything it writes", async () => {
    expect(DASHES.test(await view(ONE, [ONE, TWO]))).toBe(false);
    expect(DASHES.test(await view(ONE, [ONE, TWO], "refund"))).toBe(false);
  });
});

describe("FaqArticleMissing", () => {
  test("says the article is not there and links back, with the search if there was one", async () => {
    const html = await renderWithRouter(<FaqArticleMissing q="dupe" />, "/faqs/nope");
    expect(html).toContain("That article is not here");
    expect(html).toMatch(/href="\/faqs\?q=dupe"/);
    expect(DASHES.test(html)).toBe(false);
  });

  test("without a search it links to the whole list", async () => {
    const html = await renderWithRouter(<FaqArticleMissing />, "/faqs/nope");
    expect(html).toMatch(/href="\/faqs"/);
  });
});

test("the missing-article button is a 44px target", async () => {
  const html = await renderWithRouter(<FaqArticleMissing />, "/faqs/nope");
  const link = /<a [^>]*href="\/faqs"[^>]*>/.exec(html)?.[0] ?? "";
  expect(link).toContain("h-11");
  expect(link).not.toContain("h-9");
});
