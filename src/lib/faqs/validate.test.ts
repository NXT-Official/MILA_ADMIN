import { describe, expect, test } from "bun:test";
import { validateFrontmatter } from "./validate";

const VALID = {
  title: "Credits and refunds",
  category: "Credits & billing",
  summary: "One plain sentence.",
  tags: ["credits", "refunds"],
  order: 10,
  updated: "2026-10-07",
};

describe("validateFrontmatter", () => {
  test("accepts a complete block and returns it typed", () => {
    expect(validateFrontmatter(VALID)).toEqual({ meta: VALID, issues: [] });
  });

  test("accepts each status, and a block without one", () => {
    for (const status of ["live", "partly-live", "coming"]) {
      expect(validateFrontmatter({ ...VALID, status }).meta?.status).toBe(status);
    }
    expect(validateFrontmatter(VALID).meta).not.toHaveProperty("status");
  });

  test("lists every missing required field at once", () => {
    const { meta, issues } = validateFrontmatter({});
    expect(meta).toBeNull();
    for (const field of ["title", "category", "summary", "tags", "order", "updated"]) {
      expect(issues.some((issue) => issue.includes(`"${field}"`))).toBe(true);
    }
    expect(issues).toHaveLength(6);
  });

  test("an empty title or summary counts as missing", () => {
    const { issues } = validateFrontmatter({ ...VALID, title: "  ", summary: "" });
    expect(issues).toHaveLength(2);
  });

  test("rejects a category that is not on the list and names the real ones", () => {
    const { meta, issues } = validateFrontmatter({ ...VALID, category: "Billing" });
    expect(meta).toBeNull();
    expect(issues[0]).toContain('"Billing"');
    expect(issues[0]).toContain("Credits & billing");
  });

  test("a summary may be 160 characters and no more", () => {
    expect(validateFrontmatter({ ...VALID, summary: "x".repeat(160) }).issues).toEqual([]);
    const { issues } = validateFrontmatter({ ...VALID, summary: "x".repeat(161) });
    expect(issues[0]).toContain("160");
  });

  test("tags: one to ten, lowercase, each a word or hyphenated words", () => {
    expect(validateFrontmatter({ ...VALID, tags: [] }).issues).toHaveLength(1);
    const eleven = Array.from({ length: 11 }, (_, index) => `t${index}`);
    expect(validateFrontmatter({ ...VALID, tags: eleven }).issues).toHaveLength(1);
    expect(
      validateFrontmatter({ ...VALID, tags: Array.from({ length: 10 }, (_, i) => `t${i}`) }).issues,
    ).toEqual([]);
    expect(validateFrontmatter({ ...VALID, tags: ["Credits"] }).issues[0]).toContain('"Credits"');
    expect(
      validateFrontmatter({ ...VALID, tags: ["sign-in", "free tier", "café"] }).issues,
    ).toEqual([]);
    expect(validateFrontmatter({ ...VALID, tags: ["a  b"] }).issues).toHaveLength(1);
    expect(validateFrontmatter({ ...VALID, tags: "credits" }).issues).toHaveLength(1);
  });

  test("order must be a whole number, not text", () => {
    expect(validateFrontmatter({ ...VALID, order: "10" }).issues).toHaveLength(1);
    expect(validateFrontmatter({ ...VALID, order: 0 }).issues).toEqual([]);
  });

  test("updated must be a real ISO date", () => {
    for (const bad of ["10/07/2026", "2026-13-01", "2026-02-30", "2026-1-5", "yesterday"]) {
      expect(validateFrontmatter({ ...VALID, updated: bad }).issues).toHaveLength(1);
    }
    expect(validateFrontmatter({ ...VALID, updated: "2028-02-29" }).issues).toEqual([]);
  });

  test("status, when present, must be one of the three", () => {
    const { issues } = validateFrontmatter({ ...VALID, status: "done" });
    expect(issues[0]).toContain("live, partly-live, coming");
  });

  test("a field the contract does not have is flagged, because it is probably a typo", () => {
    const { issues } = validateFrontmatter({ ...VALID, tag: ["x"] });
    expect(issues[0]).toContain('"tag"');
  });
});
