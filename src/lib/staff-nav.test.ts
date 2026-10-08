import { describe, expect, test } from "bun:test";
import { staffSectionOf } from "./staff-nav";

describe("staffSectionOf", () => {
  test("a top-level path is its own section", () => {
    expect(staffSectionOf("/members")).toBe("/members");
    expect(staffSectionOf("/subscription-plans")).toBe("/subscription-plans");
  });

  test("a page inside a section belongs to it, so the sidebar and header keep their place", () => {
    expect(staffSectionOf("/faqs/credits-and-refunds")).toBe("/faqs");
    expect(staffSectionOf("/faqs/credits-and-refunds/")).toBe("/faqs");
  });

  test("a trailing slash does not matter", () => {
    expect(staffSectionOf("/faqs/")).toBe("/faqs");
  });

  test("the root path has no section", () => {
    expect(staffSectionOf("/")).toBe("/");
    expect(staffSectionOf("")).toBe("/");
  });

  test("a section is matched whole, never as a prefix of another name", () => {
    expect(staffSectionOf("/shop-extras")).toBe("/shop-extras");
    expect(staffSectionOf("/shop-extras")).not.toBe("/shop");
  });
});
