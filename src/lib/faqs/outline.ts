/**
 * What search, the "On this page" list and the heading anchors all need from an
 * article's Markdown: its headings (with stable ids), its sections, and a plain
 * text version of each. It reads the source line by line instead of pulling in a
 * Markdown parser, because the contract only allows `##` and `###` headings and
 * the renderer looks headings up by the line they sit on.
 */
import type { FaqHeading, FaqSection } from "./types";

/**
 * GitHub's heading id rule: lower-case, drop everything except letters, marks,
 * numbers, underscores, spaces and hyphens, then spaces become hyphens. Matching
 * it means a link written the way GitHub would write it still lands.
 * src: https://github.com/Flet/github-slugger (algorithm, re-implemented here)
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/**
 * Hands out ids for one article. A repeat gets `-1`, `-2`, and never collides.
 * `reserved` ids are already in use, so a second slugger can add ids around them.
 */
export function createSlugger(reserved: Iterable<string> = []): (text: string) => string {
  const taken = new Set<string>(reserved);
  const counts = new Map<string, number>();
  return (text) => {
    const base = slugifyHeading(text) || "section";
    let candidate = base;
    let count = counts.get(base) ?? 0;
    while (taken.has(candidate)) {
      count += 1;
      candidate = `${base}-${count}`;
    }
    counts.set(base, count);
    taken.add(candidate);
    return candidate;
  };
}

export function inlineMarkdownToText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    .trim();
}

export interface Fence {
  char: string;
  length: number;
}

export function openFence(line: string): Fence | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  const marks = match[1] ?? "";
  // An info string after a backtick fence cannot hold a backtick; that is inline code.
  if (marks[0] === "`" && (match[2] ?? "").includes("`")) return null;
  return { char: marks[0] ?? "`", length: marks.length };
}

export function closesFence(line: string, fence: Fence): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  const marks = match?.[1];
  return marks !== undefined && marks[0] === fence.char && marks.length >= fence.length;
}

const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/;
const HORIZONTAL_RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_RULE = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => inlineMarkdownToText(cell));
}

/** The words of a piece of Markdown on one line, for search to read. */
export function markdownToPlainText(markdown: string): string {
  const pieces: string[] = [];
  let fence: Fence | null = null;

  for (const line of markdown.split("\n")) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      else pieces.push(line.trim());
      continue;
    }
    const opening = openFence(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (HORIZONTAL_RULE.test(line) || (line.includes("-") && TABLE_RULE.test(line))) continue;

    const unquoted = line.replace(/^\s*(>\s?)+/, "");
    if (unquoted.trimStart().startsWith("|")) {
      pieces.push(...tableCells(unquoted));
      continue;
    }
    const content = unquoted
      .replace(/^ {0,3}#{1,6}[ \t]+/, "")
      .replace(/[ \t]+#+[ \t]*$/, "")
      .replace(/^\s*([-*+]|\d{1,9}[.)])[ \t]+/, "")
      .replace(/^\[[ xX]\][ \t]+/, "");
    pieces.push(inlineMarkdownToText(content));
  }

  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

export interface Outline {
  headings: FaqHeading[];
  sections: FaqSection[];
}

/** Reads the `##` and `###` headings of an article body, skipping fenced code. */
export function extractOutline(body: string): Outline {
  const slug = createSlugger();
  const headings: FaqHeading[] = [];
  const grouped: { headingId: string | null; headingText: string; lines: string[] }[] = [
    { headingId: null, headingText: "", lines: [] },
  ];
  let fence: Fence | null = null;

  body.split("\n").forEach((line, index) => {
    const current = grouped[grouped.length - 1];
    if (!current) return;

    if (fence) {
      if (closesFence(line, fence)) fence = null;
      current.lines.push(line);
      return;
    }
    const opening = openFence(line);
    if (opening) {
      fence = opening;
      current.lines.push(line);
      return;
    }

    const match = ATX_HEADING.exec(line);
    const depth = match?.[1]?.length;
    if (match && (depth === 2 || depth === 3)) {
      const text = inlineMarkdownToText((match[2] ?? "").replace(/[ \t]+#+$/, ""));
      const id = slug(text);
      headings.push({ id, text, depth, line: index + 1 });
      grouped.push({ headingId: id, headingText: text, lines: [] });
      return;
    }
    current.lines.push(line);
  });

  return {
    headings,
    sections: grouped.map(({ headingId, headingText, lines }) => ({
      headingId,
      headingText,
      text: markdownToPlainText(lines.join("\n")),
    })),
  };
}
