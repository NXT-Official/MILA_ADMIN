import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseArticle } from "./articles";
import {
  findFaqLinks,
  findLevelOneHeadings,
  findRawHtml,
  findUnloadableEntries,
  findUnsupportedHeadings,
  lintArticles,
} from "./lint";
import type { FaqArticle } from "./types";

function article(slug: string, body: string, overrides: Record<string, string> = {}): FaqArticle {
  const fields: Record<string, string> = {
    title: "Sample",
    category: "Reference",
    summary: "A summary.",
    tags: "[sample]",
    order: "1",
    updated: "2026-10-07",
    ...overrides,
  };
  const block = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return parseArticle(`${slug}.md`, `---\n${block}\n---\n${body}`);
}

const messages = (articles: FaqArticle[]) => lintArticles(articles).map((p) => p.message);

describe("findRawHtml", () => {
  test("finds tags, closing tags, self-closing tags and comments, with their line", () => {
    const found = findRawHtml("ok\n<div>x</div>\nfine\n<br/>\n<!-- hidden -->\n</span>");
    expect(found.map((f) => f.line)).toEqual([2, 4, 5, 6]);
    expect(found[0]?.text).toBe("<div>");
  });

  test("a tag with attributes is found", () => {
    expect(findRawHtml('<a href="x">y</a>')).toHaveLength(1);
    expect(findRawHtml('<img src="x.png" />')).toHaveLength(1);
  });

  test("code is allowed to show a tag, fenced or inline", () => {
    expect(findRawHtml("Write `<div>` like so.\n\n```html\n<div>x</div>\n```\n")).toEqual([]);
    expect(findRawHtml("``<b>`` and `<i>`")).toEqual([]);
  });

  test("an autolink, an email link and plain comparisons are not HTML", () => {
    expect(findRawHtml("<https://example.com> and <a@b.co> and 1 < 2 > 0")).toEqual([]);
    expect(findRawHtml("Use 5 <= 6 and x<y")).toEqual([]);
  });
});

describe("findLevelOneHeadings", () => {
  test("finds `# Title` lines outside code and nothing else", () => {
    const body = "# Title\n\n## Fine\n\n```\n# comment in code\n```\n\n#hashtag\n\n# Another";
    expect(findLevelOneHeadings(body)).toEqual([1, 11]);
  });
});

describe("findFaqLinks", () => {
  test("finds article links with the slug, hash and line", () => {
    const body = [
      "See [a](/faqs/credits-and-refunds) and",
      "[b](/faqs/dupe-hunter#how-it-works) or [c](/faqs/glossary?q=x#term).",
    ].join("\n");
    expect(findFaqLinks(body)).toEqual([
      { slug: "credits-and-refunds", hash: null, line: 1 },
      { slug: "dupe-hunter", hash: "how-it-works", line: 2 },
      { slug: "glossary", hash: "term", line: 2 },
    ]);
  });

  test("the index page and links inside code are not article links", () => {
    expect(
      findFaqLinks("[all](/faqs) [search](/faqs?q=refund) [x](/faqs/) and `[y](/faqs/code)`"),
    ).toEqual([]);
  });

  test("reference-style definitions count too", () => {
    expect(findFaqLinks("Text [ref].\n\n[ref]: /faqs/glossary#term")).toEqual([
      { slug: "glossary", hash: "term", line: 3 },
    ]);
  });

  test("an uppercase slug is still reported so it can be flagged as unknown", () => {
    expect(findFaqLinks("[x](/faqs/Credits)")[0]?.slug).toBe("Credits");
  });
});

describe("lintArticles", () => {
  test("a clean set has no problems", () => {
    const a = article("alpha", "## One\n\nSee [b](/faqs/beta#two) and [up](#one).\n");
    const b = article("beta", "## Two\n\nText [a](/faqs/alpha).\n");
    expect(lintArticles([a, b])).toEqual([]);
  });

  test("the fixtures, which follow the contract, are clean", () => {
    const read = (name: string) =>
      readFileSync(new URL(`../../content/faqs/__fixtures__/${name}`, import.meta.url), "utf8");
    const set = [
      parseArticle("sample-one.md", read("sample-one.md")),
      parseArticle("sample-two.md", read("sample-two.md")),
    ];
    expect(lintArticles(set)).toEqual([]);
  });

  test("flags raw HTML and reports the line in the file, not in the body", () => {
    const found = lintArticles([article("alpha", "Fine.\n\n<div>no</div>\n")]);
    expect(found).toHaveLength(1);
    expect(found[0]?.file).toBe("alpha.md");
    // 6 fields + 2 rules = 8 lines of frontmatter, so body line 3 is file line 11.
    expect(found[0]?.message).toContain("line 11");
    expect(found[0]?.message).toContain("HTML");
  });

  test("flags an em dash in the body and in a frontmatter field", () => {
    const dash = String.fromCodePoint(0x2014);
    expect(messages([article("alpha", `One ${dash} two.\n`)]).join("\n")).toContain("em dash");
    expect(messages([article("alpha", "Fine.\n", { title: `A ${dash} B` })]).join("\n")).toContain(
      "title",
    );
    expect(
      messages([article("alpha", "Fine.\n", { summary: `A ${dash} B` })]).join("\n"),
    ).toContain("summary");
  });

  test("an en dash is left to the authors, only the em dash is banned by the contract", () => {
    const enDash = String.fromCodePoint(0x2013);
    expect(lintArticles([article("alpha", `Pages 1${enDash}3.\n`)])).toEqual([]);
  });

  test("flags a level-one heading, because the title comes from the frontmatter", () => {
    expect(messages([article("alpha", "# Title\n\nText\n")]).join("\n")).toContain("##");
  });

  test("flags a link to an article that does not exist", () => {
    const found = messages([article("alpha", "See [x](/faqs/missing).\n")]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("/faqs/missing");
  });

  test("flags a link to a heading that does not exist, and lists the ones that do", () => {
    const a = article("alpha", "See [x](/faqs/beta#nope).\n");
    const b = article("beta", "## Real heading\n\nText\n");
    const found = messages([a, b]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("#nope");
    expect(found[0]).toContain("real-heading");
  });

  test("flags a same-page anchor that does not exist", () => {
    const found = messages([article("alpha", "## Here\n\n[x](#there) [y](#here)\n")]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("#there");
  });

  test("an encoded anchor is decoded before it is compared", () => {
    const a = article("alpha", "[x](/faqs/beta#caf%C3%A9)\n");
    const b = article("beta", "## Café\n\nText\n");
    expect(lintArticles([a, b])).toEqual([]);
  });

  test("reports every problem in every article, each with its file", () => {
    const found = lintArticles([
      article("alpha", "<b>x</b>\n"),
      article("beta", "[x](/faqs/missing)\n"),
    ]);
    expect(found.map((p) => p.file)).toEqual(["alpha.md", "beta.md"]);
  });
});

describe("findUnsupportedHeadings", () => {
  test("rejects ####, setext underlines, and headings inside a quote or a list", () => {
    const body = [
      "## Fine",
      "",
      "#### Too deep",
      "",
      "Setext title",
      "------------",
      "",
      "> ## Quoted",
      "",
      "- ## Listed",
      "",
      "### Fine too",
    ].join("\n");
    expect(findUnsupportedHeadings(body).map((found) => found.line)).toEqual([3, 5, 8, 10]);
  });

  test("code may show a heading, and a horizontal rule after a blank line is not a heading", () => {
    const body = "Intro\n\n---\n\n```md\n#### shown\n```\n";
    expect(findUnsupportedHeadings(body)).toEqual([]);
  });

  test("lintArticles reports them with the file line", () => {
    const found = messages([article("deep", "## Fine\n\n#### Too deep\n")]);
    expect(found.some((message) => message.includes("heading") && message.includes("####"))).toBe(
      true,
    );
  });
});

describe("findUnloadableEntries", () => {
  const entry = (name: string, kind: "file" | "dir") => ({
    name,
    isFile: () => kind === "file",
    isDirectory: () => kind === "dir",
  });

  test("lowercase .md files and the fixtures folder are fine", () => {
    expect(
      findUnloadableEntries([entry("refunds.md", "file"), entry("__fixtures__", "dir")]),
    ).toEqual([]);
  });

  test("harmless dotfiles such as .gitkeep are ignored", () => {
    expect(findUnloadableEntries([entry(".gitkeep", "file"), entry(".DS_Store", "file")])).toEqual(
      [],
    );
  });

  test("an upper-case extension, another extension and a subfolder are named", () => {
    const found = findUnloadableEntries([
      entry("Refunds.MD", "file"),
      entry("notes.markdown", "file"),
      entry("billing", "dir"),
    ]);
    expect(found.map((item) => item.name)).toEqual(["Refunds.MD", "notes.markdown", "billing"]);
    expect(found.every((item) => item.message.length > 0)).toBe(true);
  });
});
