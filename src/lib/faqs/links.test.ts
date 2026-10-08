import { describe, expect, test } from "bun:test";
import { classifyHref } from "./links";

describe("classifyHref", () => {
  test("a link to an article carries its slug and heading", () => {
    expect(classifyHref("/faqs/credits-and-refunds", "x")).toEqual({
      kind: "article",
      slug: "credits-and-refunds",
      hash: undefined,
    });
    expect(classifyHref("/faqs/dupe-hunter#how-it-works", "x")).toEqual({
      kind: "article",
      slug: "dupe-hunter",
      hash: "how-it-works",
    });
  });

  test("a query string on an article link is ignored", () => {
    expect(classifyHref("/faqs/glossary?q=x#term", "x")).toEqual({
      kind: "article",
      slug: "glossary",
      hash: "term",
    });
  });

  test("a link to a heading of the page you are on is an anchor, however it is written", () => {
    expect(classifyHref("#rules", "credits")).toEqual({ kind: "anchor", hash: "rules" });
    expect(classifyHref("/faqs/credits#rules", "credits")).toEqual({
      kind: "anchor",
      hash: "rules",
    });
  });

  test("a link to the page you are on, with no heading, is still an article link", () => {
    expect(classifyHref("/faqs/credits", "credits")).toEqual({
      kind: "article",
      slug: "credits",
      hash: undefined,
    });
  });

  test("a bare # goes nowhere and is treated as another kind of link", () => {
    expect(classifyHref("#", "credits")).toEqual({ kind: "other" });
  });

  test("the index, with or without a search", () => {
    expect(classifyHref("/faqs", "x")).toEqual({ kind: "index", q: undefined });
    expect(classifyHref("/faqs/", "x")).toEqual({ kind: "index", q: undefined });
    expect(classifyHref("/faqs?q=refund%20rules", "x")).toEqual({
      kind: "index",
      q: "refund rules",
    });
  });

  test("other web addresses are outside links", () => {
    expect(classifyHref("https://example.com/a", "x")).toEqual({ kind: "external" });
    expect(classifyHref("http://example.com", "x")).toEqual({ kind: "external" });
  });

  test("mail and phone links are their own kind, not a new tab", () => {
    expect(classifyHref("mailto:a@b.co", "x")).toEqual({ kind: "other" });
    expect(classifyHref("tel:+63000", "x")).toEqual({ kind: "other" });
  });

  test("another screen of the admin is left to the browser", () => {
    expect(classifyHref("/members", "x")).toEqual({ kind: "other" });
    expect(classifyHref("/faqsx/y", "x")).toEqual({ kind: "other" });
  });

  test("an encoded heading is decoded", () => {
    expect(classifyHref("/faqs/a#caf%C3%A9", "x")).toEqual({
      kind: "article",
      slug: "a",
      hash: "café",
    });
  });
});
