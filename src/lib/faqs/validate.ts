/** Checks a parsed frontmatter block against the content contract. */
import type { FrontmatterValue } from "./frontmatter";
import {
  FAQ_CATEGORIES,
  FAQ_FRONTMATTER_KEYS,
  FAQ_STATUSES,
  FAQ_SUMMARY_MAX_LENGTH,
  FAQ_TAGS_MAX,
  type FaqCategory,
  type FaqMeta,
  type FaqStatus,
} from "./types";

export interface ValidationResult {
  /** The typed block, or null when anything is wrong. */
  meta: FaqMeta | null;
  /** Every problem found, so an author can fix them in one pass. */
  issues: string[];
}

const TAG_PATTERN = /^[\p{Ll}\p{N}]+(?:[ -][\p{Ll}\p{N}]+)*$/u;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function requiredText(data: Record<string, FrontmatterValue>, key: string, issues: string[]) {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`"${key}" is required and must be some text.`);
    return null;
  }
  return value.trim();
}

export function validateFrontmatter(data: Record<string, FrontmatterValue>): ValidationResult {
  const issues: string[] = [];

  for (const key of Object.keys(data)) {
    if (!(FAQ_FRONTMATTER_KEYS as readonly string[]).includes(key)) {
      issues.push(
        `"${key}" is not a field the contract has (allowed: ${FAQ_FRONTMATTER_KEYS.join(", ")}). Is it a typo?`,
      );
    }
  }

  const title = requiredText(data, "title", issues);

  const category = requiredText(data, "category", issues);
  if (category !== null && !(FAQ_CATEGORIES as readonly string[]).includes(category)) {
    issues.push(`"category" is "${category}", which is not one of: ${FAQ_CATEGORIES.join(", ")}.`);
  }

  const summary = requiredText(data, "summary", issues);
  if (summary !== null && summary.length > FAQ_SUMMARY_MAX_LENGTH) {
    issues.push(
      `"summary" is ${summary.length} characters; the limit is ${FAQ_SUMMARY_MAX_LENGTH}.`,
    );
  }

  const tags = data.tags;
  if (!Array.isArray(tags)) {
    issues.push('"tags" is required and must be a list, like [credits, refunds].');
  } else {
    if (tags.length < 1 || tags.length > FAQ_TAGS_MAX) {
      issues.push(`"tags" needs 1 to ${FAQ_TAGS_MAX} entries, and has ${tags.length}.`);
    }
    for (const tag of tags) {
      if (!TAG_PATTERN.test(tag)) {
        issues.push(`The tag "${tag}" must be lowercase words, with single spaces or hyphens.`);
      }
    }
  }

  const order = data.order;
  if (typeof order !== "number" || !Number.isInteger(order)) {
    issues.push('"order" is required and must be a whole number, like 10 (no quotes).');
  }

  const updated = data.updated;
  if (typeof updated !== "string" || !isRealDate(updated)) {
    issues.push('"updated" is required and must be a real date written YYYY-MM-DD.');
  }

  const status = data.status;
  if (status !== undefined && !(FAQ_STATUSES as readonly string[]).includes(String(status))) {
    issues.push(`"status" is "${status}", which is not one of: ${FAQ_STATUSES.join(", ")}.`);
  }

  if (issues.length > 0) return { meta: null, issues };

  return {
    meta: {
      title: title as string,
      category: category as FaqCategory,
      summary: summary as string,
      tags: tags as string[],
      order: order as number,
      updated: updated as string,
      ...(status === undefined ? {} : { status: status as FaqStatus }),
    },
    issues,
  };
}
