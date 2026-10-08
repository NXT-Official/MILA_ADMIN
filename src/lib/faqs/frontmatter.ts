/**
 * A frontmatter reader for the FAQ articles, with no dependency.
 *
 * It understands the small slice of YAML the content contract uses: `key: value`
 * lines whose value is a plain word or sentence, a quoted string, an integer, an
 * inline list (`[a, b]`) or a block list (`- a`), with `#` comments. Anything
 * else throws a `FrontmatterError` naming the line, so a typo in an article is
 * loud instead of quietly changing what the article says.
 */

export type FrontmatterValue = string | number | string[];

export interface ParsedFrontmatter {
  data: Record<string, FrontmatterValue>;
  /** Everything after the closing rule, with LF line endings. */
  body: string;
  /** Lines taken by the frontmatter, rules included. */
  bodyLineOffset: number;
}

export class FrontmatterError extends Error {
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(line === undefined ? message : `Line ${line}: ${message}`);
    this.name = "FrontmatterError";
    this.line = line;
  }
}

const RULE = "---";
/** Some editors save a byte order mark at the start of a file. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const KEY_LINE = /^([A-Za-z][A-Za-z0-9_-]*)[ \t]*:(?:[ \t]+(.*)|[ \t]*)$/;
const BLOCK_ITEM = /^[ \t]+-(?:[ \t]+(.*))?$/;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const unmarked = raw.startsWith(BYTE_ORDER_MARK) ? raw.slice(1) : raw;
  const lines = unmarked.replace(/\r\n?/g, "\n").split("\n");

  if (lines[0]?.trimEnd() !== RULE) {
    throw new FrontmatterError(
      "The file must start with a line of three dashes (---) that opens the frontmatter.",
      1,
    );
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === RULE);
  if (end === -1) {
    throw new FrontmatterError(
      "The frontmatter is never closed. Add a line of three dashes (---) after the last field.",
    );
  }

  return {
    data: parseFields(lines.slice(1, end)),
    body: lines.slice(end + 1).join("\n"),
    bodyLineOffset: end + 1,
  };
}

function isSkippable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

function parseFields(lines: string[]): Record<string, FrontmatterValue> {
  const data: Record<string, FrontmatterValue> = {};

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const lineNumber = index + 2; // the opening rule is line 1
    if (isSkippable(line)) continue;

    const match = KEY_LINE.exec(line);
    if (!match) {
      throw new FrontmatterError(
        `"${line.trim()}" is not a "key: value" pair. Keys are plain words with no spaces.`,
        lineNumber,
      );
    }
    const key = match[1] ?? "";
    if (Object.hasOwn(data, key)) {
      throw new FrontmatterError(`"${key}" appears twice.`, lineNumber);
    }

    const rest = (match[2] ?? "").trim();
    if (rest === "" && nextNonSkippable(lines, index + 1)?.match(BLOCK_ITEM)) {
      const items: string[] = [];
      let cursor = index + 1;
      for (; cursor < lines.length; cursor++) {
        const itemLine = lines[cursor] ?? "";
        if (isSkippable(itemLine)) continue;
        const item = BLOCK_ITEM.exec(itemLine);
        if (!item) break;
        items.push(readBlockItem(item[1] ?? "", cursor + 2));
      }
      data[key] = items;
      index = cursor - 1;
      continue;
    }

    data[key] = parseValue(rest, lineNumber);
  }

  return data;
}

function nextNonSkippable(lines: string[], from: number): string | undefined {
  for (let index = from; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (!isSkippable(line)) return line;
  }
  return undefined;
}

function parseValue(rest: string, line: number): FrontmatterValue {
  if (rest === "") return "";
  const first = rest[0];

  if (first === ">" || first === "|") {
    throw new FrontmatterError(
      "Multi-line values are not supported. Keep the value on one line.",
      line,
    );
  }
  if (first === "[") return parseInlineList(rest, line);
  if (first === '"' || first === "'") {
    const { value, next } = readQuoted(rest, 0, line);
    assertOnlyComment(rest.slice(next), "after the closing quote", line);
    return value;
  }

  const scalar = stripComment(rest);
  return /^-?\d+$/.test(scalar) ? Number(scalar) : scalar;
}

/** A `#` starts a comment only after whitespace, so `Issue#12` stays whole. */
function stripComment(text: string): string {
  const hash = text.search(/\s#/);
  return (hash === -1 ? text : text.slice(0, hash)).trim();
}

function assertOnlyComment(rest: string, where: string, line: number): void {
  const trimmed = rest.trim();
  if (trimmed !== "" && !trimmed.startsWith("#")) {
    throw new FrontmatterError(`Unexpected text ${where}: "${trimmed}".`, line);
  }
}

function readBlockItem(text: string, line: number): string {
  const trimmed = text.trim();
  if (trimmed === "") throw new FrontmatterError("A list item is empty.", line);
  if (trimmed[0] === '"' || trimmed[0] === "'") {
    const { value, next } = readQuoted(trimmed, 0, line);
    assertOnlyComment(trimmed.slice(next), "after the closing quote", line);
    return value;
  }
  return stripComment(trimmed);
}

function readQuoted(text: string, start: number, line: number): { value: string; next: number } {
  const quote = text[start];
  let value = "";
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];
    if (quote === '"' && char === "\\") {
      const escaped = text[index + 1];
      if (escaped === undefined) break;
      value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
      index++;
    } else if (char === quote) {
      if (quote === "'" && text[index + 1] === "'") {
        value += "'";
        index++;
      } else {
        return { value, next: index + 1 };
      }
    } else {
      value += char;
    }
  }
  throw new FrontmatterError(`The quote is not closed (missing ${quote}).`, line);
}

function parseInlineList(text: string, line: number): string[] {
  const items: string[] = [];
  let index = 1;

  for (;;) {
    while (text[index] === " " || text[index] === "\t") index++;
    if (index >= text.length) {
      throw new FrontmatterError("The list is not closed (missing ]).", line);
    }
    if (text[index] === "]") {
      // Only legal right after the opening bracket or a comma.
      break;
    }

    if (text[index] === '"' || text[index] === "'") {
      const { value, next } = readQuoted(text, index, line);
      items.push(value);
      index = next;
    } else {
      let stop = index;
      while (stop < text.length && text[stop] !== "," && text[stop] !== "]") stop++;
      const item = text.slice(index, stop).trim();
      if (item === "") throw new FrontmatterError("A list item is empty.", line);
      items.push(item);
      index = stop;
    }

    while (text[index] === " " || text[index] === "\t") index++;
    if (text[index] === ",") {
      index++;
      continue;
    }
    if (text[index] === "]") break;
    throw new FrontmatterError("The list is not closed (missing ]).", line);
  }

  assertOnlyComment(text.slice(index + 1), "after the list", line);
  return items;
}
