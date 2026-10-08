import { describe, expect, test } from "bun:test";
import { parseArticle } from "./articles";
import {
  createFaqIndex,
  foldText,
  queryTerms,
  searchFaqs,
  SEARCH_WEIGHTS,
  type SnippetPart,
} from "./search";
import type { FaqArticle } from "./types";

/** An accent written as its own character after the letter, which an editor can show as e + accent. */
const COMBINING_ACUTE = String.fromCodePoint(0x301);

interface Spec {
  slug: string;
  title?: string;
  summary?: string;
  tags?: string[];
  category?: string;
  order?: number;
  body?: string;
}

function make(spec: Spec): FaqArticle {
  const fields = [
    `title: ${JSON.stringify(spec.title ?? "Plain title")}`,
    `category: ${spec.category ?? "Reference"}`,
    `summary: ${JSON.stringify(spec.summary ?? "A plain summary.")}`,
    `tags: ${JSON.stringify(spec.tags ?? ["plain"])}`,
    `order: ${spec.order ?? 1}`,
    "updated: 2026-10-07",
  ];
  return parseArticle(
    `${spec.slug}.md`,
    `---\n${fields.join("\n")}\n---\n${spec.body ?? "Plain body text.\n"}`,
  );
}

const search = (articles: FaqArticle[], query: string) =>
  searchFaqs(createFaqIndex(articles), query);
const slugs = (articles: FaqArticle[], query: string) =>
  search(articles, query).map((hit) => hit.article.slug);
const plain = (parts: SnippetPart[]) => parts.map((part) => part.text).join("");
const marked = (parts: SnippetPart[]) => parts.filter((part) => part.match).map((p) => p.text);

describe("foldText", () => {
  test("ignores case and diacritics", () => {
    expect(foldText("Crédito")).toBe("credito");
    expect(foldText("ÀÉÎÕÜ ñ")).toBe("aeiou n");
    expect(foldText("Café")).toBe(foldText("CAFE"));
  });

  test("treats an already-decomposed accent the same as a precomposed one", () => {
    const decomposed = `cafe${COMBINING_ACUTE}`;
    expect(decomposed).toHaveLength(5);
    expect(foldText(decomposed)).toBe("cafe");
  });
});

describe("queryTerms", () => {
  test("splits on anything that is not a letter or number, folds, and drops repeats", () => {
    expect(queryTerms("  Refund,  daily-limit! refund ")).toEqual(["refund", "daily", "limit"]);
  });

  test("keeps numbers and accented words", () => {
    expect(queryTerms("Crédito 20")).toEqual(["credito", "20"]);
  });

  test("nothing searchable gives no terms", () => {
    expect(queryTerms("")).toEqual([]);
    expect(queryTerms(" ?! -- ")).toEqual([]);
  });

  test("characters that mean something to a regex are only characters", () => {
    expect(queryTerms("a+b(c")).toEqual(["a", "b", "c"]);
  });
});

describe("ranking by field weight", () => {
  test("the weights are title 5, tags 4, headings 3, summary 2, body 1", () => {
    expect(SEARCH_WEIGHTS).toEqual({ title: 5, tags: 4, headings: 3, summary: 2, body: 1 });
  });

  const byField = [
    make({ slug: "in-body", body: "Plain text about the zebra herd.\n" }),
    make({ slug: "in-summary", summary: "All about a zebra." }),
    make({ slug: "in-headings", body: "## Zebra facts\n\nPlain text.\n" }),
    make({ slug: "in-tags", tags: ["zebra"] }),
    make({ slug: "in-title", title: "The zebra guide" }),
  ];

  test("a word in the title beats tags, which beat headings, summary and body", () => {
    expect(slugs(byField, "zebra")).toEqual([
      "in-title",
      "in-tags",
      "in-headings",
      "in-summary",
      "in-body",
    ]);
  });

  test("the score is the weight of the field it was found in", () => {
    const scores = Object.fromEntries(
      search(byField, "zebra").map((hit) => [hit.article.slug, hit.score]),
    );
    expect(scores).toEqual({
      "in-title": 5,
      "in-tags": 4,
      "in-headings": 3,
      "in-summary": 2,
      "in-body": 1,
    });
  });

  test("a word found in several fields scores for each of them", () => {
    const both = make({
      slug: "both",
      title: "Zebra guide",
      body: "Plain text about the zebra herd.\n",
    });
    const titleOnly = make({ slug: "title-only", title: "Zebra primer" });
    expect(search([both, titleOnly], "zebra").map((hit) => [hit.article.slug, hit.score])).toEqual([
      ["both", 6],
      ["title-only", 5],
    ]);
  });

  test("equal scores fall back to category order, then the author's order, then title", () => {
    const a = make({ slug: "a", title: "Zebra b", category: "Reference", order: 1 });
    const b = make({ slug: "b", title: "Zebra a", category: "Reference", order: 1 });
    const c = make({ slug: "c", title: "Zebra z", category: "Start here", order: 9 });
    const d = make({ slug: "d", title: "Zebra y", category: "Reference", order: 0 });
    expect(slugs([a, b, c, d], "zebra")).toEqual(["c", "d", "b", "a"]);
  });
});

describe("matching", () => {
  test("every word has to match, but they may match in different fields", () => {
    const both = make({ slug: "both", title: "Refund rules", body: "Resets daily.\n" });
    const one = make({ slug: "one", title: "Refund rules", body: "Resets weekly.\n" });
    const none = make({ slug: "none" });
    expect(slugs([both, one, none], "refund daily")).toEqual(["both"]);
  });

  test("ignores case and accents on both sides", () => {
    const article = make({ slug: "cafe", title: "Crédito del CAFÉ" });
    expect(slugs([article], "CREDITO")).toEqual(["cafe"]);
    expect(slugs([article], "crédito café")).toEqual(["cafe"]);
    expect(slugs([make({ slug: "plain", title: "credito cafe" })], "Crédito")).toEqual(["plain"]);
  });

  test("a typed word matches the start of a word, so refund finds refunds", () => {
    const article = make({ slug: "r", title: "Refunds" });
    expect(slugs([article], "refund")).toEqual(["r"]);
    expect(slugs([article], "refunds")).toEqual(["r"]);
  });

  test("but not the middle of a word", () => {
    expect(slugs([make({ slug: "r", title: "Refunds" })], "fund")).toEqual([]);
  });

  test("a hyphenated word can be found by either half", () => {
    const article = make({ slug: "s", title: "Sign-in help" });
    expect(slugs([article], "sign")).toEqual(["s"]);
    expect(slugs([article], "in")).toEqual(["s"]);
    expect(slugs([article], "sign-in")).toEqual(["s"]);
  });

  test("an empty or symbol-only query finds nothing, and so does a miss", () => {
    const articles = [make({ slug: "a", title: "Zebra" })];
    expect(search(articles, "")).toEqual([]);
    expect(search(articles, "  ?!  ")).toEqual([]);
    expect(search(articles, "giraffe")).toEqual([]);
  });

  test("an absurdly long query is cut down instead of choking", () => {
    const articles = [make({ slug: "a", title: "Zebra" })];
    expect(search(articles, "zebra ".repeat(5000))).toHaveLength(1);
  });

  test("no articles, no hits", () => {
    expect(search([], "anything")).toEqual([]);
  });
});

describe("snippets", () => {
  test("highlight the matched words and keep the original spelling", () => {
    const article = make({
      slug: "a",
      body: "Los CRÉDITOS gratis llegan cada día, y el crédito se renueva.\n",
    });
    const hit = search([article], "credito")[0];
    expect(hit).toBeDefined();
    expect(marked(hit?.snippet ?? [])).toEqual(["CRÉDITO", "crédito"]);
    expect(plain(hit?.snippet ?? [])).toBe(
      "Los CRÉDITOS gratis llegan cada día, y el crédito se renueva.",
    );
  });

  test("a short body is shown whole, with no ellipsis", () => {
    const hit = search([make({ slug: "a", body: "Short zebra text.\n" })], "zebra")[0];
    expect(plain(hit?.snippet ?? [])).toBe("Short zebra text.");
  });

  test("a long body is cut around the match, with ellipses where it was cut", () => {
    const filler = "Plain filler sentence number one. ".repeat(20);
    const body = `${filler}The zebra is here. ${filler}`;
    const hit = search([make({ slug: "a", body })], "zebra")[0];
    const text = plain(hit?.snippet ?? []);
    expect(text.startsWith("…")).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThan(220);
    expect(marked(hit?.snippet ?? [])).toEqual(["zebra"]);
  });

  test("picks the stretch of text that holds the most of the words searched for", () => {
    const filler = "Plain filler sentence number one. ".repeat(14);
    const body = `Early alpha mention. ${filler}Later alpha and beta together. ${filler}`;
    const hit = search([make({ slug: "a", body })], "alpha beta")[0];
    expect(marked(hit?.snippet ?? [])).toEqual(["alpha", "beta"]);
    expect(plain(hit?.snippet ?? [])).toContain("Later alpha and beta together.");
  });

  test("overlapping words are highlighted once", () => {
    const hit = search(
      [make({ slug: "a", body: "The credits arrive daily.\n" })],
      "cred credits",
    )[0];
    expect(marked(hit?.snippet ?? [])).toEqual(["credits"]);
  });

  test("a match that is only in the title or tags shows the summary instead", () => {
    const article = make({
      slug: "a",
      title: "Zebra guide",
      summary: "Everything about the herd.",
      body: "Plain text.\n",
    });
    const hit = search([article], "zebra")[0];
    expect(plain(hit?.snippet ?? [])).toBe("Everything about the herd.");
    expect(marked(hit?.snippet ?? [])).toEqual([]);
  });

  test("a match that is only in the summary highlights it there", () => {
    const article = make({ slug: "a", summary: "All about the zebra.", body: "Plain text.\n" });
    const hit = search([article], "zebra")[0];
    expect(plain(hit?.snippet ?? [])).toBe("All about the zebra.");
    expect(marked(hit?.snippet ?? [])).toEqual(["zebra"]);
  });

  test("the title is highlighted too", () => {
    const hit = search([make({ slug: "a", title: "Crédito and refunds" })], "credito refund")[0];
    expect(plain(hit?.titleParts ?? [])).toBe("Crédito and refunds");
    expect(marked(hit?.titleParts ?? [])).toEqual(["Crédito", "refund"]);
  });

  test("many matches in a long section do not make the search crawl", () => {
    // Choosing the snippet used to compare every match with every other one: with eight
    // words each matching thousands of times that is billions of comparisons.
    const words = ["aa", "bb", "cc", "dd", "ee", "ff", "gg", "hh"];
    const body = `${`${words.join(" ")} `.repeat(6000)}\n`;
    const index = createFaqIndex([make({ slug: "long", body })]);
    const started = performance.now();
    const hit = searchFaqs(index, words.join(" "))[0];
    const elapsed = performance.now() - started;
    const marks = marked(hit?.snippet ?? []);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((mark) => words.includes(mark))).toBe(true);
    expect(elapsed).toBeLessThan(1500);
  });

  test("an emoji before the match does not shift the highlight", () => {
    const hit = search([make({ slug: "a", body: "\u{1F642}\u{1F642} the zebra\n" })], "zebra")[0];
    expect(marked(hit?.snippet ?? [])).toEqual(["zebra"]);
  });

  test("a decomposed accent inside a match stays inside the highlight", () => {
    const decomposed = `cafe${COMBINING_ACUTE}`;
    const hit = search([make({ slug: "a", body: `El ${decomposed} abre.\n` })], "cafe")[0];
    expect(marked(hit?.snippet ?? [])).toEqual([decomposed]);
  });
});

describe("deep links to a heading", () => {
  const body = [
    "Intro text about nothing in particular.",
    "",
    "## Daily limit",
    "",
    "Free members get a few styling credits.",
    "",
    "## When refunds happen",
    "",
    "A failed generation is refunded automatically.",
    "",
    "### Manual refunds",
    "",
    "Staff can add credits back by hand.",
  ].join("\n");
  const article = make({ slug: "credits", body });

  test("goes to the section that holds the words", () => {
    const hit = search([article], "automatically")[0];
    expect(hit?.heading).toMatchObject({ id: "when-refunds-happen", text: "When refunds happen" });
    expect(plain(hit?.snippet ?? [])).toBe("A failed generation is refunded automatically.");
  });

  test("a word in a heading beats the same word once in a section body", () => {
    const hit = search([article], "refund")[0];
    // "refund" is in the headings of sections 2 and 3, and in the text of section 2
    // only, so section 2 scores 4 against 3.
    expect(hit?.heading?.id).toBe("when-refunds-happen");
  });

  test("goes to the section with the most of the searched words", () => {
    const hit = search([article], "staff credits")[0];
    expect(hit?.heading?.id).toBe("manual-refunds");
  });

  test("the heading text comes back highlighted", () => {
    const hit = search([article], "refunds")[0];
    expect(marked(hit?.heading?.parts ?? [])).toEqual(["refunds"]);
    expect(plain(hit?.heading?.parts ?? [])).toBe("When refunds happen");
  });

  test("text before the first heading has no heading to go to", () => {
    const hit = search([article], "nothing particular")[0];
    expect(hit?.heading).toBeNull();
    expect(plain(hit?.snippet ?? [])).toBe("Intro text about nothing in particular.");
  });

  test("a match only in the title or tags has no heading either", () => {
    const tagged = make({ slug: "t", tags: ["zebra"], body: "## A heading\n\nText.\n" });
    expect(search([tagged], "zebra")[0]?.heading).toBeNull();
  });

  test("a heading that matches but whose text does not still gets the link", () => {
    const only = make({ slug: "h", body: "## Zebra facts\n\nPlain text about stripes.\n" });
    const hit = search([only], "zebra")[0];
    expect(hit?.heading?.id).toBe("zebra-facts");
    expect(plain(hit?.snippet ?? [])).toBe("Plain text about stripes.");
  });

  test("an article with no headings never links to one", () => {
    expect(search([make({ slug: "p", body: "Just a zebra.\n" })], "zebra")[0]?.heading).toBeNull();
  });
});

describe("long queries and snippet edges", () => {
  test("every word up to the length of the search box counts, so AND holds past eight words", () => {
    const words = [
      "alpha",
      "bravo",
      "charlie",
      "delta",
      "echo",
      "foxtrot",
      "golf",
      "hotel",
      "india",
    ];
    expect(queryTerms(words.join(" "))).toEqual(words);
    const article = make({ slug: "a", body: words.slice(0, 8).join(" ") + "\n" });
    expect(slugs([article], words.slice(0, 8).join(" "))).toEqual(["a"]);
    // The ninth word is not in the article, so the article must not match.
    expect(slugs([article], words.join(" "))).toEqual([]);
  });

  test("a snippet keeps a searched word that starts inside its window, even in the last 20 characters", () => {
    // alpha at 120; the window runs 80 to 260; beta starts at 135 inside a long word
    // with no space after it, which used to pull the end back to the space before it.
    const body = [
      "x ".repeat(60),
      "alpha zzzzzzzz betaqqqqqqqqqqqqqqqqqq ",
      "tail ".repeat(60),
    ].join("");
    const hit = search([make({ slug: "a", body })], "alpha beta")[0];
    expect(marked(hit?.snippet ?? [])).toEqual(["alpha", "beta"]);
  });
});
