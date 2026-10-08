import { describe, expect, test } from "bun:test";
import { shouldFocusSearch } from "./use-slash-focus";

const press = (overrides: Partial<Parameters<typeof shouldFocusSearch>[0]> = {}) =>
  shouldFocusSearch({
    key: "/",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    target: { tagName: "BODY" },
    ...overrides,
  });

describe("shouldFocusSearch", () => {
  test("a slash with nothing focused moves to the search box", () => {
    expect(press()).toBe(true);
  });

  test("a slash on a button or link does too", () => {
    expect(press({ target: { tagName: "BUTTON" } })).toBe(true);
    expect(press({ target: { tagName: "A" } })).toBe(true);
  });

  test("a keyboard that needs Shift for a slash still works", () => {
    expect(press({ shiftKey: true })).toBe(true);
  });

  test("any other key does nothing", () => {
    expect(press({ key: "a" })).toBe(false);
    expect(press({ key: "?" })).toBe(false);
  });

  test("a slash typed into a field stays a slash", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(press({ target: { tagName } })).toBe(false);
    }
    expect(press({ target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
  });

  test("a browser or app shortcut using the slash is left alone", () => {
    expect(press({ ctrlKey: true })).toBe(false);
    expect(press({ metaKey: true })).toBe(false);
    expect(press({ altKey: true })).toBe(false);
  });

  test("a key press something else already handled is left alone", () => {
    expect(press({ defaultPrevented: true })).toBe(false);
  });

  test("a target that is not an element does not throw", () => {
    expect(press({ target: null })).toBe(true);
    expect(press({ target: {} })).toBe(true);
  });
});
