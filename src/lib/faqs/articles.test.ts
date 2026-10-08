import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  FaqArticleError,
  groupByCategory,
  loadArticles,
  neighbours,
  parseArticle,
  slugFromPath,
} from "./articles";
import { formatUpdated } from "./format";

const fixture = (name: string) =>
  readFileSync(new URL(`../../content/faqs/__fixtures__/${name}`, import.meta.url), "utf8");

const ONE = fixture("sample-one.md");
const TWO = fixture("sample-two.md");

function raw(overrides: Record<string, string> = {}, body = "Some body text.\n") {
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
  return `---\n${block}\n---\n${body}`;
}

describe("slugFromPath", () => {
  test("is the file name without .md, wherever the file sits", () => {
    expect(slugFromPath("credits-and-refunds.md")).toBe("credits-and-refunds");
    expect(slugFromPath("../../content/faqs/dupe-hunter.md")).toBe("dupe-hunter");
    expect(slugFromPath("C:\\work\\faqs\\glossary.md")).toBe("glossary");
  });
});

describe("parseArticle", () => {
  test("builds an article from a file: slug from the file name, meta, outline, body", () => {
    const article = parseArticle("../../content/faqs/__fixtures__/sample-one.md", ONE);
    expect(article.slug).toBe("sample-one");
    expect(article.title).toBe("Sample article one");
    expect(article.category).toBe("Reference");
    expect(article.status).toBe("partly-live");
    expect(article.tags).toEqual(["sample", "fixture", "table"]);
    expect(article.order).toBe(1);
    expect(article.updated).toBe("2026-10-07");
    expect(article.body.startsWith("Intro paragraph")).toBe(true);
    expect(article.body).not.toContain("title: Sample article one");
    expect(article.headings.map((h) => h.id)).toEqual([
      "rules-at-a-glance",
      "worked-example",
      "examples",
      "examples-1",
    ]);
    expect(article.sections[0]?.text).toBe("Intro paragraph that comes before any heading.");
  });

  test("the slug always comes from the file name, never from the title", () => {
    expect(parseArticle("renamed.md", raw({ title: "Something Else" })).slug).toBe("renamed");
  });

  test("a heading line number points at the heading inside the body", () => {
    const article = parseArticle("a.md", raw({}, "Line one.\n\n## Heading\n"));
    expect(article.body.split("\n")[(article.headings[0]?.line ?? 0) - 1]).toBe("## Heading");
    // The frontmatter is 6 fields plus two rules, so the body starts on file line 9.
    expect(article.bodyLineOffset).toBe(8);
  });

  function failure(path: string, text: string): FaqArticleError {
    try {
      parseArticle(path, text);
    } catch (error) {
      expect(error).toBeInstanceOf(FaqArticleError);
      return error as FaqArticleError;
    }
    throw new Error("expected parseArticle to throw");
  }

  test("throws with every missing required field named, and the file", () => {
    const error = failure("empty.md", "---\n---\nBody\n");
    expect(error.path).toBe("empty.md");
    expect(error.issues).toHaveLength(6);
    expect(error.message).toContain("empty.md");
  });

  test("throws when the frontmatter itself cannot be read", () => {
    const error = failure("broken.md", "---\ntitle Hi\n---\nBody\n");
    expect(error.issues[0]).toContain("Line 2");
  });

  test("throws when there is no frontmatter", () => {
    expect(failure("bare.md", "## Just a heading\n").issues[0]).toContain("three dashes");
  });

  test("throws when the file name is not a lowercase kebab-case slug", () => {
    for (const name of [
      "Credits.md",
      "credits_and_refunds.md",
      "credits and refunds.md",
      "-x.md",
    ]) {
      expect(failure(name, raw()).issues[0]).toContain("kebab-case");
    }
  });

  test("throws when the body is empty, because that is never intended", () => {
    expect(failure("blank.md", raw({}, "\n  \n")).issues[0]).toContain("no body");
  });

  test("reports a bad name and bad fields together", () => {
    const error = failure("Bad Name.md", "---\n---\nBody\n");
    expect(error.issues.length).toBeGreaterThan(6);
  });
});

describe("loadArticles", () => {
  test("loads valid files and lists nothing as a problem", () => {
    const { articles, problems } = loadArticles({
      "x/sample-one.md": ONE,
      "x/sample-two.md": TWO,
    });
    expect(problems).toEqual([]);
    expect(articles.map((a) => a.slug)).toEqual(["sample-two", "sample-one"]);
  });

  test("with no files at all it is an empty library, not an error", () => {
    expect(loadArticles({})).toEqual({ articles: [], problems: [] });
  });

  test("ignores everything under __fixtures__", () => {
    const { articles, problems } = loadArticles({
      "../../content/faqs/__fixtures__/sample-one.md": ONE,
      "../../content/faqs/__fixtures__/bad.md": "not even frontmatter",
      "../../content/faqs/real.md": raw(),
    });
    expect(articles.map((a) => a.slug)).toEqual(["real"]);
    expect(problems).toEqual([]);
  });

  test("ignores a file that is not Markdown", () => {
    const { articles, problems } = loadArticles({ "notes.txt": "hello", "a.md": raw() });
    expect(articles).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  test("an invalid article is reported with its file and reason, never dropped quietly", () => {
    const { articles, problems } = loadArticles({
      "good.md": raw(),
      "bad.md": raw({ category: "Nonsense" }),
    });
    expect(articles.map((a) => a.slug)).toEqual(["good"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe("bad.md");
    expect(problems[0]?.message).toContain("Nonsense");
  });

  test("every issue in a file becomes its own problem", () => {
    const { problems } = loadArticles({ "bad.md": "---\n---\nBody\n" });
    expect(problems).toHaveLength(6);
    expect(new Set(problems.map((p) => p.file))).toEqual(new Set(["bad.md"]));
  });

  test("a duplicate slug is a problem that names both files, and the first one is kept", () => {
    const { articles, problems } = loadArticles({
      "a/credits.md": raw({ title: "First" }),
      "b/credits.md": raw({ title: "Second" }),
    });
    expect(articles.map((a) => a.title)).toEqual(["First"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe("b/credits.md");
    expect(problems[0]?.message).toContain("a/credits.md");
    expect(problems[0]?.message).toContain('"credits"');
  });

  test("the result does not depend on the order the files arrive in", () => {
    const files = { "b.md": raw({ title: "B" }), "a.md": raw({ title: "A" }) };
    const reversed = { "a.md": files["a.md"], "b.md": files["b.md"] };
    expect(loadArticles(files).articles.map((a) => a.slug)).toEqual(
      loadArticles(reversed).articles.map((a) => a.slug),
    );
  });

  test("sorts by category display order, then order, then title", () => {
    const { articles } = loadArticles({
      "z.md": raw({ category: "Reference", order: "1", title: "Zed" }),
      "m.md": raw({ category: "Credits & billing", order: "2", title: "Mid" }),
      "b.md": raw({ category: "Credits & billing", order: "1", title: "Bee" }),
      "a.md": raw({ category: "Credits & billing", order: "1", title: "Ant" }),
      "s.md": raw({ category: "Start here", order: "9", title: "Start" }),
    });
    expect(articles.map((a) => a.slug)).toEqual(["s", "a", "b", "m", "z"]);
  });
});

describe("groupByCategory", () => {
  test("groups in display order and leaves empty categories out", () => {
    const { articles } = loadArticles({
      "r.md": raw({ category: "Reference" }),
      "c1.md": raw({ category: "Credits & billing", order: "1" }),
      "c2.md": raw({ category: "Credits & billing", order: "2" }),
      "s.md": raw({ category: "Start here" }),
    });
    const groups = groupByCategory(articles);
    expect(groups.map((g) => g.category)).toEqual(["Start here", "Credits & billing", "Reference"]);
    expect(groups[1]?.articles.map((a) => a.slug)).toEqual(["c1", "c2"]);
  });

  test("no articles means no groups", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("neighbours", () => {
  const { articles } = loadArticles({
    "one.md": raw({ category: "Credits & billing", order: "1" }),
    "two.md": raw({ category: "Credits & billing", order: "2" }),
    "three.md": raw({ category: "Credits & billing", order: "3" }),
    "other.md": raw({ category: "Reference" }),
  });

  test("previous and next stay inside the category", () => {
    const middle = neighbours(articles, "two");
    expect(middle.previous?.slug).toBe("one");
    expect(middle.next?.slug).toBe("three");
  });

  test("the ends have only one neighbour, and never cross into another category", () => {
    expect(neighbours(articles, "one")).toEqual({ previous: null, next: articles[1] ?? null });
    expect(neighbours(articles, "three").next).toBeNull();
    expect(neighbours(articles, "other")).toEqual({ previous: null, next: null });
  });

  test("an unknown slug has no neighbours", () => {
    expect(neighbours(articles, "nope")).toEqual({ previous: null, next: null });
  });
});

describe("formatUpdated", () => {
  test("writes the date out in words, in UTC so no timezone moves it a day", () => {
    expect(formatUpdated("2026-10-07")).toBe("7 October 2026");
    expect(formatUpdated("2026-01-01")).toBe("1 January 2026");
    expect(formatUpdated("2026-12-31")).toBe("31 December 2026");
  });
});
