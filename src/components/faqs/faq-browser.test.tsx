import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseArticle } from "@/lib/faqs/articles";
import { createFaqIndex } from "@/lib/faqs/search";
import type { FaqProblem } from "@/lib/faqs/types";
import { renderWithRouter } from "../../../tests/helpers/render-with-router";
import { FaqBrowser } from "./faq-browser";
import { FaqPending } from "./faq-pending";
import { FaqSearchBox } from "./faq-search-box";
import { FaqStatusPill } from "./faq-status-pill";

const fixture = (name: string) =>
  parseArticle(
    name,
    readFileSync(new URL(`../../content/faqs/__fixtures__/${name}`, import.meta.url), "utf8"),
  );

const ONE = fixture("sample-one.md");
const TWO = fixture("sample-two.md");
const ARTICLES = [TWO, ONE];

function browser(
  query: string,
  overrides: { articles?: typeof ARTICLES; problems?: FaqProblem[] } = {},
) {
  const articles = overrides.articles ?? ARTICLES;
  return renderWithRouter(
    <FaqBrowser
      articles={articles}
      problems={overrides.problems ?? []}
      index={createFaqIndex(articles)}
      query={query}
      onQueryChange={() => {}}
    />,
  );
}

const DASHES = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`);

describe("FaqBrowser with no search", () => {
  test("lists articles under their category, in the contract's category order", async () => {
    const html = await browser("");
    const startHere = html.indexOf(">Start here<");
    const reference = html.indexOf(">Reference<");
    expect(startHere).toBeGreaterThan(-1);
    expect(reference).toBeGreaterThan(startHere);
  });

  test("each row links to its article and shows the title, summary, status and update date", async () => {
    const html = await browser("");
    expect(html).toContain('href="/faqs/sample-one"');
    expect(html).toContain('href="/faqs/sample-two"');
    expect(html).toContain("Sample article one");
    expect(html).toContain("A placeholder article used by the test suite.");
    expect(html).toContain("Partly live");
    expect(html).toContain("Coming");
    expect(html).toContain("Updated 7 October 2026");
    expect(html).toContain("Updated 30 September 2026");
  });

  test("says how many articles there are, in how many topics", async () => {
    expect(await browser("")).toContain("2 articles in 2 topics");
    expect(await browser("", { articles: [ONE] })).toContain("1 article in 1 topic");
  });

  test("the search box has a visible label above it, a shortcut hint and no placeholder-only label", async () => {
    const html = await browser("");
    expect(html).toMatch(/<label[^>]*for="faq-search"[^>]*>Search the training articles<\/label>/);
    expect(html).toMatch(/<input(?=[^>]*id="faq-search")(?=[^>]*aria-keyshortcuts="\/")[^>]*>/);
    expect(html).toContain("Press / to jump to the search box");
  });
});

describe("FaqBrowser with a search", () => {
  test("shows matching articles with the words marked, and says how many", async () => {
    const html = await browser("second heading");
    expect(html).toContain("2 articles match");
    expect(html).toMatch(/<mark[^>]*>Second<\/mark>/);
    expect(html).toMatch(/<mark[^>]*>heading<\/mark>/i);
    // The best match is first.
    expect(html.indexOf("Sample article two")).toBeLessThan(html.indexOf("Sample article one"));
  });

  test("a result links to the heading it matched, and carries the search back with it", async () => {
    const html = await browser("second heading");
    expect(html).toMatch(/href="\/faqs\/sample-two\?q=second(%20|\+)heading#second-heading"/);
    expect(html).toContain("Jumps to");
  });

  test("a single result says article, not articles", async () => {
    const html = await browser("diacriticos");
    expect(html).toContain("1 article matches");
  });

  test("ignores accents and case, as the search does", async () => {
    const html = await browser("CAFE");
    expect(html).toContain("Sample article two");
    expect(html).toMatch(/<mark[^>]*>café<\/mark>/i);
  });

  test("a search that finds nothing says so and offers a way out", async () => {
    const html = await browser("giraffe");
    expect(html).toContain("Nothing matches");
    expect(html).toContain("giraffe");
    expect(html).toContain("Every word has to appear in the same article");
    expect(html).toContain("Clear search");
    expect(html).not.toContain('href="/faqs/sample-one');
  });

  test("a search of only symbols finds nothing rather than everything", async () => {
    expect(await browser("?!")).toContain("Nothing matches");
  });

  test("the result count is announced politely to a screen reader", async () => {
    const html = await browser("second heading");
    expect(html).toMatch(
      /<p(?=[^>]*role="status")(?=[^>]*aria-live="polite")[^>]*>2 articles match/,
    );
  });

  test("the box shows what was typed, with a clear button", async () => {
    const html = await browser("second heading");
    expect(html).toContain('value="second heading"');
    expect(html).toContain('aria-label="Clear search"');
  });

  test("with the box empty there is no clear button, only the shortcut hint", async () => {
    const html = await browser("");
    expect(html).not.toContain('aria-label="Clear search"');
    expect(html).toMatch(/<kbd[^>]*>\/<\/kbd>/);
  });
});

describe("FaqBrowser when there is nothing to show", () => {
  test("an empty library says so plainly", async () => {
    const html = await browser("", { articles: [] });
    expect(html).toContain("No training articles yet");
    expect(html).not.toContain("articles in");
  });

  test("a search over an empty library still reads sensibly", async () => {
    const html = await browser("refund", { articles: [] });
    expect(html).toContain("No training articles yet");
  });

  test("files that could not be loaded are shown, never hidden", async () => {
    const html = await browser("", {
      problems: [
        { file: "credits.md", message: '"summary" is required and must be some text.' },
        { file: "credits.md", message: '"order" is required and must be a whole number.' },
      ],
    });
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain("2 problems");
    expect(html).toContain("credits.md");
    expect(html).toContain("&quot;summary&quot; is required");
  });

  test("one problem is not pluralised", async () => {
    const html = await browser("", { problems: [{ file: "a.md", message: "Bad." }] });
    expect(html).toContain("1 problem");
    expect(html).not.toContain("1 problems");
  });

  test("the good articles still show next to a problem", async () => {
    const html = await browser("", { problems: [{ file: "a.md", message: "Bad." }] });
    expect(html).toContain("Sample article one");
  });
});

describe("everything on screen avoids em and en dashes", () => {
  test("every state", async () => {
    for (const html of [
      await browser(""),
      await browser("second heading"),
      await browser("giraffe"),
      await browser("", { articles: [] }),
      await browser("", { problems: [{ file: "a.md", message: "Bad." }] }),
    ]) {
      expect(DASHES.test(html)).toBe(false);
    }
  });
});

describe("FaqStatusPill", () => {
  test("says the status in words for each of the three", () => {
    // Rendering a pill needs no router.
    for (const [status, label] of [
      ["live", "Live"],
      ["partly-live", "Partly live"],
      ["coming", "Coming"],
    ] as const) {
      const html = renderPill(status);
      expect(html).toContain(label);
      expect(html).toContain(`data-status="${status}"`);
    }
  });

  test("an article with no status shows no pill", () => {
    expect(renderPill(undefined)).toBe("");
  });
});

describe("FaqPending", () => {
  test("announces that it is loading and holds the shape of the list while it does", () => {
    const html = renderPending();
    expect(html).toMatch(/role="status"/);
    // Its screen-reader-only text is absolutely positioned; the wrapper has to be
    // positioned too or the text lands outside the shell's scrolling area.
    expect(html).toMatch(/<div(?=[^>]*role="status")(?=[^>]*class="[^"]*\brelative\b)[^>]*>/);
    expect(html).toContain("Loading the training articles");
    expect(html).toContain("animate-pulse");
  });
});

import { renderToStaticMarkup } from "react-dom/server";

function renderPill(status: Parameters<typeof FaqStatusPill>[0]["status"]) {
  return renderToStaticMarkup(<FaqStatusPill status={status} />);
}

function renderPending() {
  return renderToStaticMarkup(<FaqPending />);
}

describe("the clear controls are 44px targets", () => {
  const button = (html: string, label: string) =>
    new RegExp("<button[^>]*" + label + "[^>]*>").exec(html)?.[0] ?? "";

  test("the clear button in the search box", async () => {
    const html = await renderWithRouter(<FaqSearchBox value="refund" onChange={() => {}} />);
    const clear = button(html, 'aria-label="Clear search"');
    expect(clear).toContain("size-11");
    expect(clear).not.toContain("size-10");
  });

  test("Clear search in the no-results state", async () => {
    const html = await browser("zzzzqqqq");
    const clear = /<button[^>]*>(?:(?!<\/button>).)*Clear search/s.exec(html)?.[0] ?? "";
    expect(clear).toContain("h-11");
    expect(clear).not.toContain("h-9");
  });
});
