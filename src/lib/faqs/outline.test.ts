import { describe, expect, test } from "bun:test";
import {
  createSlugger,
  extractOutline,
  inlineMarkdownToText,
  markdownToPlainText,
  slugifyHeading,
} from "./outline";

describe("slugifyHeading", () => {
  test("follows the GitHub rule so a GitHub-style link works", () => {
    expect(slugifyHeading("Live today")).toBe("live-today");
    expect(slugifyHeading("What's new?")).toBe("whats-new");
    expect(slugifyHeading("Credits & billing")).toBe("credits--billing");
    expect(slugifyHeading("  Sign-in  ")).toBe("sign-in");
    expect(slugifyHeading("Café crédito")).toBe("café-crédito");
  });
});

describe("createSlugger", () => {
  test("numbers a repeated heading, as GitHub does", () => {
    const slug = createSlugger();
    expect(slug("Examples")).toBe("examples");
    expect(slug("Examples")).toBe("examples-1");
    expect(slug("Examples")).toBe("examples-2");
  });

  test("never hands out an id that is already taken", () => {
    const slug = createSlugger();
    expect(slug("A")).toBe("a");
    expect(slug("A 1")).toBe("a-1");
    expect(slug("A")).toBe("a-2");
  });

  test("a heading with nothing sluggable still gets an id", () => {
    const slug = createSlugger();
    expect(slug("???")).toBe("section");
    expect(slug("!!!")).toBe("section-1");
  });
});

describe("inlineMarkdownToText", () => {
  test("removes links, images, emphasis and code marks but keeps the words", () => {
    expect(inlineMarkdownToText("See [the **refund** rules](/faqs/credits) and `daily`")).toBe(
      "See the refund rules and daily",
    );
    expect(inlineMarkdownToText("![a chart](x.png) _soft_ ~~old~~")).toBe("a chart soft old");
  });

  test("leaves an underscore inside a word alone", () => {
    expect(inlineMarkdownToText("the credit_balance column")).toBe("the credit_balance column");
  });

  test("unescapes a backslash", () => {
    expect(inlineMarkdownToText("1\\. Not a list")).toBe("1. Not a list");
  });
});

describe("markdownToPlainText", () => {
  test("flattens lists, quotes, callouts, tables and code into one line of words", () => {
    const md = [
      "A paragraph with **bold**.",
      "",
      "- first item",
      "- second item",
      "1. numbered",
      "",
      "> **Note:** a callout",
      "",
      "| Plan | Credits |",
      "| --- | --- |",
      "| Free | 10 |",
      "",
      "```",
      "const x = 1;",
      "```",
      "",
      "---",
      "",
      "### A heading",
    ].join("\n");
    expect(markdownToPlainText(md)).toBe(
      "A paragraph with bold. first item second item numbered Note: a callout Plan Credits Free 10 const x = 1; A heading",
    );
  });

  test("an empty body is an empty string", () => {
    expect(markdownToPlainText("\n\n")).toBe("");
  });
});

describe("extractOutline", () => {
  const body = [
    "Intro line.",
    "",
    "## Live today",
    "",
    "Text under live.",
    "",
    "### Details",
    "",
    "More text.",
    "",
    "## Live today",
    "",
    "Again.",
  ].join("\n");

  test("lists h2 and h3 headings with ids, depth and body line", () => {
    const { headings } = extractOutline(body);
    expect(headings).toEqual([
      { id: "live-today", text: "Live today", depth: 2, line: 3 },
      { id: "details", text: "Details", depth: 3, line: 7 },
      { id: "live-today-1", text: "Live today", depth: 2, line: 11 },
    ]);
  });

  test("splits the body into sections, the first with no heading", () => {
    const { sections } = extractOutline(body);
    expect(sections.map((s) => [s.headingId, s.headingText, s.text])).toEqual([
      [null, "", "Intro line."],
      ["live-today", "Live today", "Text under live."],
      ["details", "Details", "More text."],
      ["live-today-1", "Live today", "Again."],
    ]);
  });

  test("ignores a hash line inside a fenced code block", () => {
    const { headings, sections } = extractOutline(
      ["## Real", "", "```sh", "## not a heading", "```", "", "~~~", "### nor this", "~~~"].join(
        "\n",
      ),
    );
    expect(headings.map((h) => h.id)).toEqual(["real"]);
    expect(sections[1]?.text).toContain("not a heading");
  });

  test("a longer fence is closed only by a fence at least as long", () => {
    const { headings } = extractOutline(
      ["````", "```", "## still code", "````", "## Out"].join("\n"),
    );
    expect(headings.map((h) => h.id)).toEqual(["out"]);
  });

  test("a hash with no space is not a heading, and h1 and h4 are not outline entries", () => {
    const { headings } = extractOutline("#hashtag\n\n# Title\n\n#### Deep\n\n## Yes");
    expect(headings.map((h) => h.text)).toEqual(["Yes"]);
  });

  test("strips inline Markdown and a closing hash run from the heading text", () => {
    const { headings } = extractOutline("## The **daily** [limit](/faqs/x) ##");
    expect(headings[0]).toEqual({
      id: "the-daily-limit",
      text: "The daily limit",
      depth: 2,
      line: 1,
    });
  });

  test("a body with no headings is one headingless section", () => {
    const { headings, sections } = extractOutline("Just text.");
    expect(headings).toEqual([]);
    expect(sections).toEqual([{ headingId: null, headingText: "", text: "Just text." }]);
  });
});
