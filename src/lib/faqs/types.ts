/**
 * The FAQs (Training) content contract. Articles are Markdown files in
 * `src/content/faqs/<slug>.md`; this file is the single place that says what
 * a valid one looks like. The authoring side of the contract is in the plan
 * `MILA-ADMIN-FAQS-PLAN-2026-10-07.md`.
 */

/** In display order. An article's category must be one of these exactly. */
export const FAQ_CATEGORIES = [
  "Start here",
  "Credits & billing",
  "Members & accounts",
  "Sign-in & sessions",
  "AI features",
  "Shop & catalogue",
  "Community & moderation",
  "Support",
  "Platform & releases",
  "Reference",
] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export const FAQ_STATUSES = ["live", "partly-live", "coming"] as const;
export type FaqStatus = (typeof FAQ_STATUSES)[number];

export const FAQ_STATUS_LABELS: Record<FaqStatus, string> = {
  live: "Live",
  "partly-live": "Partly live",
  coming: "Coming",
};

export const FAQ_SUMMARY_MAX_LENGTH = 160;
export const FAQ_TAGS_MAX = 10;

/** The keys a frontmatter block may carry. Anything else is a typo. */
export const FAQ_FRONTMATTER_KEYS = [
  "title",
  "category",
  "summary",
  "tags",
  "order",
  "updated",
  "status",
] as const;

export interface FaqMeta {
  title: string;
  category: FaqCategory;
  summary: string;
  tags: string[];
  /** Sort position inside the category, lowest first. */
  order: number;
  /** ISO date, YYYY-MM-DD. */
  updated: string;
  status?: FaqStatus;
}

export interface FaqHeading {
  /** The anchor id, unique inside the article. */
  id: string;
  /** Plain text of the heading, with inline Markdown removed. */
  text: string;
  depth: 2 | 3;
  /** 1-based line inside the article BODY, which is how the renderer finds it. */
  line: number;
}

/** A run of the article under one heading. The first section has no heading. */
export interface FaqSection {
  headingId: string | null;
  headingText: string;
  /** Plain text, one line. */
  text: string;
}

export interface FaqArticle extends FaqMeta {
  slug: string;
  /** The file the article came from, for error messages. */
  path: string;
  /** Markdown after the frontmatter, with LF line endings. */
  body: string;
  /** Lines the frontmatter took, so a body line maps back to its file line. */
  bodyLineOffset: number;
  headings: FaqHeading[];
  sections: FaqSection[];
}

/** Something wrong with a file that kept it out of the library. Never silent. */
export interface FaqProblem {
  file: string;
  message: string;
}
