import { describe, expect, test } from "bun:test";
import { FAQ_QUERY_MAX_LENGTH, parseFaqQuery } from "./query";

describe("parseFaqQuery", () => {
  test("a plain string is kept, trimmed", () => {
    expect(parseFaqQuery("refund")).toBe("refund");
    expect(parseFaqQuery("  sign in  ")).toBe("sign in");
  });

  test("blank means no query", () => {
    expect(parseFaqQuery("")).toBeUndefined();
    expect(parseFaqQuery("   ")).toBeUndefined();
  });

  test("the router reads ?q=2026 as a number and ?q=true as a boolean; both are still text", () => {
    expect(parseFaqQuery(2026)).toBe("2026");
    expect(parseFaqQuery(true)).toBe("true");
  });

  test("anything that is not text is ignored rather than trusted", () => {
    expect(parseFaqQuery(undefined)).toBeUndefined();
    expect(parseFaqQuery(null)).toBeUndefined();
    expect(parseFaqQuery(["a", "b"])).toBeUndefined();
    expect(parseFaqQuery({ a: 1 })).toBeUndefined();
  });

  test("an address with a huge query cannot make the page slow", () => {
    const parsed = parseFaqQuery("x".repeat(5000));
    expect(parsed).toHaveLength(FAQ_QUERY_MAX_LENGTH);
  });
});
