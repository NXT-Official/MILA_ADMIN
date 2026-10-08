import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseArticle } from "@/lib/faqs/articles";
import type { FaqArticle } from "@/lib/faqs/types";
import { renderWithRouter } from "../../../tests/helpers/render-with-router";
import { FaqMarkdown } from "./faq-markdown";

const fixture = (name: string) =>
  parseArticle(
    name,
    readFileSync(new URL(`../../content/faqs/__fixtures__/${name}`, import.meta.url), "utf8"),
  );

const SAMPLE_ONE = fixture("sample-one.md");

function articleWith(body: string): FaqArticle {
  const raw = [
    "---",
    "title: Test",
    "category: Reference",
    "summary: A summary.",
    "tags: [test]",
    "order: 1",
    "updated: 2026-10-07",
    "---",
    body,
  ].join("\n");
  return parseArticle("test.md", raw);
}

const render = (article: FaqArticle) =>
  renderWithRouter(
    <FaqMarkdown slug={article.slug} body={article.body} headings={article.headings} />,
    `/faqs/${article.slug}`,
  );

describe("FaqMarkdown", () => {
  test("renders a table as an accessible, scrollable region with column headers", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toContain("<table");
    expect(html).toContain('scope="col"');
    expect(html).toContain("<thead");
    expect(html).toContain("Daily limit");
    expect(html).toContain("Resets daily");
    // A table wider than the screen scrolls inside its own region, which a
    // keyboard user can focus and which has a name.
    expect(html).toMatch(/<div(?=[^>]*role="region")(?=[^>]*tabindex="0")[^>]*><table/);
    expect(html).toMatch(/<div(?=[^>]*role="region")(?=[^>]*aria-label="Table)[^>]*><table/);
  });

  test("a link to another article goes through the router, with its heading as the hash", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toContain('href="/faqs/sample-two"');
    expect(html).toContain('href="/faqs/sample-two#second-heading"');
    // Router links are client navigations: no new tab, no rel.
    const anchor = /<a [^>]*href="\/faqs\/sample-two"[^>]*>/.exec(html)?.[0] ?? "";
    expect(anchor).not.toContain("target=");
  });

  test("those links are built by the router's Link, not written by hand", async () => {
    // Under a base path a router Link prefixes it and a plain <a href="/faqs/x"> cannot.
    const html = await renderWithRouter(
      <FaqMarkdown slug={SAMPLE_ONE.slug} body={SAMPLE_ONE.body} headings={SAMPLE_ONE.headings} />,
      "/faqs/sample-one",
      { basepath: "/admin" },
    );
    expect(html).toContain('href="/admin/faqs/sample-two"');
    expect(html).toContain('href="/admin/faqs/sample-two#second-heading"');
    expect(html).not.toContain('href="/faqs/sample-two"');
  });

  test("a link to a heading of the same article is a plain anchor on the page", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toContain('href="#rules-at-a-glance"');
  });

  test("no link inside an article claims to be the current page", async () => {
    // Heading anchors and same-page links point at the page you are on; marking each
    // one aria-current="page" would have a screen reader announce it dozens of times.
    const html = await render(SAMPLE_ONE);
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("data-status");
  });

  test("an outside link opens in a new tab, safely, and says so", async () => {
    const html = await render(articleWith("Read [the docs](https://example.com/docs)."));
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("(opens in a new tab)");
  });

  test("an outside link is positioned, so its screen-reader-only label cannot escape the page's scroll area", async () => {
    // A visually hidden label is absolutely positioned. With no positioned ancestor it is
    // placed against the whole document, outside the staff shell's scrolling <main>, and
    // makes the document itself scrollable: an in-page jump then slides the whole shell up.
    const html = await render(articleWith("Read [the docs](https://example.com/docs)."));
    const anchor = /<a [^>]*target="_blank"[^>]*>/.exec(html)?.[0] ?? "";
    expect(anchor).toMatch(/class="[^"]*\brelative\b/);
  });

  test("a link to another screen of the admin is an ordinary link", async () => {
    const html = await render(articleWith("Open [Members](/members) first."));
    expect(html).toContain('href="/members"');
    expect(html).not.toContain('href="/members" target');
  });

  test("a mail link works and is not marked as a new tab", async () => {
    const html = await render(articleWith("Write to [us](mailto:help@example.com)."));
    expect(html).toContain('href="mailto:help@example.com"');
    expect(html).not.toContain("opens in a new tab");
  });

  test("gives each heading its anchor id, one level down so the page keeps a single h1 and an h2 title", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toMatch(/<h3[^>]*id="rules-at-a-glance"/);
    expect(html).toMatch(/<h4[^>]*id="worked-example"/);
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
  });

  test("a repeated heading gets a numbered id, the same one the outline lists", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toMatch(/<h3[^>]*id="examples"/);
    expect(html).toMatch(/<h3[^>]*id="examples-1"/);
    expect(SAMPLE_ONE.headings.map((h) => h.id)).toContain("examples-1");
  });

  test("every heading has a link to itself with a name that says where it goes", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toContain('aria-label="Link to this section: Rules at a glance"');
    expect(html).toContain('href="#worked-example"');
  });

  /** Every class token of every element, so a test can say what no element may carry. */
  const classTokens = (html: string) =>
    [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => (match[1] ?? "").split(/\s+/));

  /** A one-sided start/end border (border-l-4, border-r, md:border-s-2 ...), the "side tab". */
  const SIDE_BORDER = /(^|:)border-[lrse](-|$)/;

  const calloutClasses = (html: string, kind: "note" | "important") =>
    (
      new RegExp(`<div(?=[^>]*data-callout="${kind}")(?=[^>]*class="([^"]*)")`).exec(html)?.[1] ??
      ""
    ).split(/\s+/);

  test("a `> **Note:**` quote becomes a note callout with an icon and its label", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toMatch(/<div(?=[^>]*data-callout="note")(?=[^>]*role="note")[^>]*>/);
    expect(html).toContain("This is a callout note for the tests.");
    // The label is the meaning: it is visible text, in bold, right after the icon.
    expect(html).toMatch(
      /<div(?=[^>]*data-callout="note")[^>]*>\s*<svg(?=[^>]*lucide-info)(?=[^>]*aria-hidden="true")[^>]*>[\s\S]*?<strong[^>]*>Note:<\/strong>/,
    );
  });

  test("a `> **Important:**` quote becomes an important callout with its own icon and label", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toMatch(/<div(?=[^>]*data-callout="important")(?=[^>]*role="note")[^>]*>/);
    expect(html).toContain("This is an important callout for the tests.");
    expect(html).toMatch(
      /<div(?=[^>]*data-callout="important")[^>]*>\s*<svg(?=[^>]*lucide-triangle-alert)(?=[^>]*aria-hidden="true")[^>]*>[\s\S]*?<strong[^>]*>Important:<\/strong>/,
    );
  });

  test("the two callouts differ by label and icon shape, not only by colour", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toContain("lucide-info");
    expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain("Note:");
    expect(html).toContain("Important:");
  });

  test("a callout is a tinted panel with a hairline border on all four sides, in the admin's radius", async () => {
    const html = await render(SAMPLE_ONE);
    const note = calloutClasses(html, "note");
    const important = calloutClasses(html, "important");
    for (const classes of [note, important]) {
      expect(classes).toContain("border");
      expect(classes).toContain("rounded-panel");
      expect(classes).not.toContain("border-l-4");
    }
    expect(note).toContain("border-line");
    expect(note).toContain("bg-accent-soft/60");
    expect(important).toContain("border-warning/50");
    expect(important).toContain("bg-warning/10");
    // Text stays the ink colour on the tint (13:1 light, 9.5:1 dark), the tint carries no meaning alone.
    expect(note).toContain("text-ink");
    expect(important).toContain("text-ink");
  });

  test("no element in an article has a one-sided start or end border (the side-tab look)", async () => {
    for (const html of [
      await render(SAMPLE_ONE),
      await render(articleWith("> Just a thought.\n")),
    ]) {
      expect(classTokens(html).filter((token) => SIDE_BORDER.test(token))).toEqual([]);
    }
  });

  test("the side-border check can tell a side border from border-line", () => {
    expect(SIDE_BORDER.test("border-l-4")).toBe(true);
    expect(SIDE_BORDER.test("md:border-r")).toBe(true);
    expect(SIDE_BORDER.test("border-s-2")).toBe(true);
    expect(SIDE_BORDER.test("border-line")).toBe(false);
    expect(SIDE_BORDER.test("border-l-accent")).toBe(true);
  });

  test("an ordinary quote stays a blockquote, as a full-border panel", async () => {
    const html = await render(articleWith("> Just a thought.\n"));
    expect(html).toContain("<blockquote");
    expect(html).not.toContain("data-callout");
    const classes = (/<blockquote[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "").split(/\s+/);
    expect(classes).toContain("border");
    expect(classes).toContain("rounded-panel");
  });

  test("inline code and a code block are told apart, and a block can be scrolled by keyboard", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toContain("inline code</code>");
    expect(html).toMatch(/<pre(?=[^>]*role="region")(?=[^>]*tabindex="0")[^>]*>/);
    expect(html).toContain("a block of code");
  });

  test("lists render as lists", async () => {
    const html = await render(SAMPLE_ONE);
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
  });

  test("raw HTML is shown as text and never run", async () => {
    const html = await render(
      articleWith('Before <script>alert(1)</script> and <img src="x" onerror="alert(1)"> after.\n'),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;script&gt;");
  });

  test("a javascript: link is neutralised", async () => {
    const html = await render(articleWith("[bad](javascript:alert(1))\n"));
    expect(html).not.toContain("javascript:");
  });
});

describe("heading ids and targets", () => {
  test("a heading the outline does not list never reuses an id", async () => {
    const html = await render(articleWith("## Credits\n\nText.\n\n#### Credits\n\nMore text.\n"));
    const ids = [...html.matchAll(/<h[2-6][^>]* id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  test("the heading anchor is a 44px target and not faded on touch", async () => {
    const html = await render(SAMPLE_ONE);
    const anchor = /<a [^>]*aria-label="Link to this section[^>]*>/.exec(html)?.[0] ?? "";
    expect(anchor).toContain("size-11");
    expect(anchor).not.toContain("size-8");
    // Faded to 60% it was 2.4:1; only the hover-capable media query may hide it.
    expect(anchor).not.toMatch(/(^|[\s"])opacity-60/);
  });

  test("an article link underline is dark enough to see (3:1 against the canvas)", async () => {
    const html = await render(SAMPLE_ONE);
    const link = /<a [^>]*href="\/faqs\/sample-two"[^>]*>/.exec(html)?.[0] ?? "";
    expect(link).toContain("decoration-ink/60");
    expect(link).not.toContain("decoration-accent");
  });
});
