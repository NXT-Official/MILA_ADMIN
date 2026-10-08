/**
 * Search over the FAQ articles, with no dependency. The whole library is a few
 * dozen short documents, so a plain scan beats an index library on size and on
 * being easy to reason about.
 *
 * - Case and diacritics are ignored on both sides.
 * - Every word typed has to match (AND). A word matches the START of a word, so
 *   "refund" finds "refunds" but "fund" does not.
 * - Each word scores the weight of every field it is found in: title 5, tags 4,
 *   headings 3, summary 2, body 1. An article's score is the sum over the words.
 * - A hit carries a snippet with the matched words marked, and the heading of
 *   the best-matching section so the result can link straight to it.
 */
import { compareArticles } from "./articles";
import { FAQ_QUERY_MAX_LENGTH } from "./query";
import type { FaqArticle } from "./types";

export const SEARCH_WEIGHTS = { title: 5, tags: 4, headings: 3, summary: 2, body: 1 } as const;

/** The search box and the `?q=` address both stop here, so nothing typed is ever cut. */
const MAX_QUERY_LENGTH = FAQ_QUERY_MAX_LENGTH;
/** Every word the box can hold: a query is at most MAX_QUERY_LENGTH characters, so at most half that many one-letter words. */
const MAX_TERMS = Math.ceil(MAX_QUERY_LENGTH / 2);
const SNIPPET_LENGTH = 180;
/** How much text to show before the first match in a snippet. */
const SNIPPET_LEAD = 40;
const SNAP_REACH = 20;
const ELLIPSIS = "…";
const WORD_CHAR = /[\p{L}\p{N}]/u;

export interface SnippetPart {
  text: string;
  match: boolean;
}

export interface FaqSearchHit {
  article: FaqArticle;
  score: number;
  titleParts: SnippetPart[];
  snippet: SnippetPart[];
  /** The best-matching section's heading, or null to link to the top of the article. */
  heading: { id: string; text: string; parts: SnippetPart[] } | null;
}

/** A string folded for matching, with each folded unit mapped back to the original text. */
interface Folded {
  text: string;
  starts: number[];
  ends: number[];
}

/**
 * Lower-cases and strips diacritics one code point at a time, so every folded
 * unit knows where it came from and a highlight can be drawn on the original.
 */
function foldWithMap(original: string): Folded {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;

  for (const char of original) {
    const folded = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const end = index + char.length;
    if (folded === "") {
      // A combining mark belongs to the letter before it, so a highlight keeps it.
      if (ends.length > 0) ends[ends.length - 1] = end;
    } else {
      for (let unit = 0; unit < folded.length; unit++) {
        starts.push(index);
        ends.push(end);
      }
    }
    text += folded;
    index = end;
  }
  return { text, starts, ends };
}

export function foldText(text: string): string {
  return foldWithMap(text).text;
}

/** The words of a query, folded and unique. Empty when there is nothing to search for. */
export function queryTerms(query: string): string[] {
  const words = foldText(query.slice(0, MAX_QUERY_LENGTH)).split(/[^\p{L}\p{N}]+/u);
  return [...new Set(words.filter((word) => word !== ""))].slice(0, MAX_TERMS);
}

/** The first folded position at or after `from` where `term` starts a word, or -1. */
function nextWordStart(text: string, term: string, from: number): number {
  let at = text.indexOf(term, from);
  while (at !== -1) {
    if (at === 0 || !WORD_CHAR.test(text[at - 1] ?? "")) return at;
    at = text.indexOf(term, at + 1);
  }
  return -1;
}

/** Every folded position where `term` starts a word. */
function wordStarts(text: string, term: string): number[] {
  const found: number[] = [];
  for (let at = nextWordStart(text, term, 0); at !== -1; at = nextWordStart(text, term, at + 1)) {
    found.push(at);
  }
  return found;
}

const hasWord = (folded: Folded, term: string) => nextWordStart(folded.text, term, 0) !== -1;

interface IndexedSection {
  headingId: string | null;
  headingText: string;
  heading: Folded;
  plain: string;
  text: Folded;
}

interface IndexedArticle {
  article: FaqArticle;
  title: Folded;
  tags: Folded;
  headings: Folded;
  summary: Folded;
  body: Folded;
  sections: IndexedSection[];
}

export interface FaqIndex {
  entries: IndexedArticle[];
}

export function createFaqIndex(articles: readonly FaqArticle[]): FaqIndex {
  return {
    entries: articles.map((article) => ({
      article,
      title: foldWithMap(article.title),
      tags: foldWithMap(article.tags.join(" ")),
      headings: foldWithMap(article.headings.map((heading) => heading.text).join(" ")),
      summary: foldWithMap(article.summary),
      body: foldWithMap(article.sections.map((section) => section.text).join(" ")),
      sections: article.sections.map((section) => ({
        headingId: section.headingId,
        headingText: section.headingText,
        heading: foldWithMap(section.headingText),
        plain: section.text,
        text: foldWithMap(section.text),
      })),
    })),
  };
}

interface Range {
  term: number;
  start: number;
  end: number;
}

/** Where each word matches, as ranges in the ORIGINAL text. */
function matchRanges(folded: Folded, terms: string[]): Range[] {
  const ranges: Range[] = [];
  terms.forEach((term, termIndex) => {
    for (const at of wordStarts(folded.text, term)) {
      const start = folded.starts[at];
      const end = folded.ends[at + term.length - 1];
      if (start !== undefined && end !== undefined) ranges.push({ term: termIndex, start, end });
    }
  });
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Overlapping ranges become one, so "cred" and "credits" mark "credits" once. */
function mergeRanges(ranges: Range[]): { start: number; end: number }[] {
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

/** Cuts `original[from, to)` into marked and unmarked parts. */
function toParts(original: string, ranges: Range[], from: number, to: number): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let cursor = from;
  for (const { start, end } of mergeRanges(ranges)) {
    const markStart = Math.max(start, from);
    const markEnd = Math.min(end, to);
    if (markEnd <= markStart) continue;
    if (markStart > cursor) parts.push({ text: original.slice(cursor, markStart), match: false });
    parts.push({ text: original.slice(markStart, markEnd), match: true });
    cursor = markEnd;
  }
  if (cursor < to) parts.push({ text: original.slice(cursor, to), match: false });
  return parts;
}

function withEllipses(parts: SnippetPart[], before: boolean, after: boolean): SnippetPart[] {
  return [
    ...(before ? [{ text: ELLIPSIS, match: false }] : []),
    ...parts,
    ...(after ? [{ text: ELLIPSIS, match: false }] : []),
  ];
}

function snapStart(text: string, start: number): number {
  if (start <= 0) return 0;
  const space = text.indexOf(" ", start);
  return space !== -1 && space - start < SNAP_REACH ? space + 1 : start;
}

function snapEnd(text: string, end: number, floor: number): number {
  if (end >= text.length) return text.length;
  const space = text.lastIndexOf(" ", end);
  return space > end - SNAP_REACH && space > floor ? space : end;
}

/**
 * A stretch of `original` about SNIPPET_LENGTH long, placed where the most of the
 * searched words sit close together, with the matches marked.
 */
function snippetOf(original: string, folded: Folded, terms: string[]): SnippetPart[] {
  const ranges = matchRanges(folded, terms);

  if (original.length <= SNIPPET_LENGTH + SNAP_REACH) {
    return toParts(original, ranges, 0, original.length);
  }

  // Try a window that opens SNIPPET_LEAD before each match and keep the one holding the
  // most different words. The window start only ever moves forward as the matches do, so
  // two pointers slide over the matches instead of re-scanning them for each window.
  const inWindow = new Array<number>(terms.length).fill(0);
  let distinct = 0;
  let first = 0;
  let after = 0;
  let start = 0;
  let bestDistinct = 0;
  for (const range of ranges) {
    const candidate = Math.max(
      0,
      Math.min(range.start - SNIPPET_LEAD, original.length - SNIPPET_LENGTH),
    );
    while (
      after < ranges.length &&
      (ranges[after]?.start ?? Infinity) < candidate + SNIPPET_LENGTH
    ) {
      if (inWindow[ranges[after]?.term ?? 0]++ === 0) distinct++;
      after++;
    }
    while (first < after && (ranges[first]?.start ?? Infinity) < candidate) {
      if (--inWindow[ranges[first]?.term ?? 0] === 0) distinct--;
      first++;
    }
    if (distinct > bestDistinct) {
      bestDistinct = distinct;
      start = candidate;
    }
  }

  const from = snapStart(original, start);
  // Snapping the end back to a space must not drop a match the window counted.
  let counted = 0;
  for (const range of ranges) {
    if (range.start >= start + SNIPPET_LENGTH) break;
    if (range.start >= from) counted = Math.max(counted, range.end);
  }
  const to = Math.min(
    original.length,
    Math.max(snapEnd(original, start + SNIPPET_LENGTH, from), counted),
  );
  return withEllipses(toParts(original, ranges, from, to), from > 0, to < original.length);
}

function scoreArticle(entry: IndexedArticle, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    let termScore = 0;
    if (hasWord(entry.title, term)) termScore += SEARCH_WEIGHTS.title;
    if (hasWord(entry.tags, term)) termScore += SEARCH_WEIGHTS.tags;
    if (hasWord(entry.headings, term)) termScore += SEARCH_WEIGHTS.headings;
    if (hasWord(entry.summary, term)) termScore += SEARCH_WEIGHTS.summary;
    if (hasWord(entry.body, term)) termScore += SEARCH_WEIGHTS.body;
    // Every word typed has to be somewhere in the article.
    if (termScore === 0) return 0;
    total += termScore;
  }
  return total;
}

/** The section with the most searched words, a heading hit counting more than a body hit. */
function bestSection(entry: IndexedArticle, terms: string[]): IndexedSection | null {
  let best: IndexedSection | null = null;
  let bestScore = 0;
  for (const section of entry.sections) {
    let score = 0;
    for (const term of terms) {
      if (hasWord(section.heading, term)) score += SEARCH_WEIGHTS.headings;
      if (hasWord(section.text, term)) score += SEARCH_WEIGHTS.body;
    }
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  return best;
}

function buildHit(entry: IndexedArticle, terms: string[], score: number): FaqSearchHit {
  const { article } = entry;
  const titleParts = toParts(
    article.title,
    matchRanges(entry.title, terms),
    0,
    article.title.length,
  );
  const summarySnippet = () => snippetOf(article.summary, entry.summary, terms);

  const section = bestSection(entry, terms);
  if (!section) return { article, score, titleParts, snippet: summarySnippet(), heading: null };

  const heading = section.headingId
    ? {
        id: section.headingId,
        text: section.headingText,
        parts: toParts(
          section.headingText,
          matchRanges(section.heading, terms),
          0,
          section.headingText.length,
        ),
      }
    : null;

  // When only the heading matched, the section's text has no match and the
  // snippet is simply where the section starts.
  const snippet =
    section.plain === "" ? summarySnippet() : snippetOf(section.plain, section.text, terms);
  return { article, score, titleParts, snippet, heading };
}

/** Articles matching every word of `query`, best first. A query with no words matches nothing. */
export function searchFaqs(index: FaqIndex, query: string): FaqSearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const hits: FaqSearchHit[] = [];
  for (const entry of index.entries) {
    const score = scoreArticle(entry, terms);
    if (score > 0) hits.push(buildHit(entry, terms, score));
  }
  return hits.sort((a, b) => b.score - a.score || compareArticles(a.article, b.article));
}
