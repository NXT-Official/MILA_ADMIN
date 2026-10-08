import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { STAFF_ROUTES } from "./authorization";
import { postLoginDestination, safeRedirectPath, signInRedirectSearch } from "./safe-redirect";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("safeRedirectPath", () => {
  test("accepts the path of every staff screen", () => {
    for (const route of STAFF_ROUTES) {
      expect(safeRedirectPath(route)).toBe(route);
    }
  });

  test("keeps only the path: query, hash and a trailing slash are dropped", () => {
    expect(safeRedirectPath("/members?page=2")).toBe("/members");
    expect(safeRedirectPath("/members#top")).toBe("/members");
    expect(safeRedirectPath("/members/")).toBe("/members");
    expect(safeRedirectPath("/database?table=profiles")).toBe("/database");
  });

  test("resolves dot segments inside this origin only", () => {
    expect(safeRedirectPath("/shop/../members")).toBe("/members");
    expect(safeRedirectPath("/members/../../evil.example")).toBeUndefined();
  });

  test("rejects anything that is not a string", () => {
    for (const value of [undefined, null, 0, 1, true, {}, [], ["/members"]]) {
      expect(safeRedirectPath(value)).toBeUndefined();
    }
  });

  test("rejects absolute and protocol-relative URLs", () => {
    const hostile = [
      "https://evil.example/members",
      "http://evil.example",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "\\/evil.example",
      "http:/evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "mailto:someone@evil.example",
      "evil.example/members",
      "members",
    ];
    for (const value of hostile) {
      expect(safeRedirectPath(value)).toBeUndefined();
    }
  });

  test("rejects whitespace and control characters a URL parser would strip", () => {
    // `/\t/evil.example` parses as `//evil.example` once the tab is removed.
    const smuggled = [
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      " /members",
      "/members ",
      "/mem\u0000bers",
      "/members\u007f",
    ];
    for (const value of smuggled) {
      expect(safeRedirectPath(value)).toBeUndefined();
    }
  });

  test("rejects same-origin paths that are not a staff screen", () => {
    for (const value of [
      "",
      "/",
      "/forgot-password",
      "/reset-password",
      "/nope",
      "/members/extra",
      "/Members",
      "/%2Fevil.example",
      "/_authed/members",
    ]) {
      expect(safeRedirectPath(value)).toBeUndefined();
    }
  });

  test("rejects an oversized value before parsing it", () => {
    expect(safeRedirectPath(`/members?${"a".repeat(5000)}`)).toBeUndefined();
  });
});

describe("signInRedirectSearch", () => {
  test("carries the staff screen that was asked for", () => {
    expect(signInRedirectSearch("/members")).toEqual({ redirect: "/members" });
    expect(signInRedirectSearch("/subscription-plans")).toEqual({
      redirect: "/subscription-plans",
    });
  });

  test("carries nothing for a path that is not a staff screen", () => {
    expect(signInRedirectSearch("/")).toEqual({});
    expect(signInRedirectSearch("//evil.example")).toEqual({});
    expect(signInRedirectSearch("https://evil.example")).toEqual({});
  });
});

describe("postLoginDestination", () => {
  test("opens the screen that was asked for when the viewer may open it", () => {
    expect(postLoginDestination("/members", ["admin"])).toBe("/members");
    expect(postLoginDestination("/support", ["moderator"])).toBe("/support");
    expect(postLoginDestination("/settings", ["moderator"])).toBe("/settings");
  });

  test("falls back to the viewer's own home when they may not open it", () => {
    expect(postLoginDestination("/members", ["moderator"])).toBe("/moderation");
    expect(postLoginDestination("/analytics", ["moderator"])).toBe("/moderation");
  });

  test("goes home when no screen was asked for", () => {
    expect(postLoginDestination(undefined, ["admin"])).toBe("/dashboard");
    expect(postLoginDestination(undefined, ["moderator"])).toBe("/moderation");
  });
});

describe("the sign-in redirect is wired through the guard, the form route and the hook", () => {
  test("the guard leaves the document instead of committing a redirect mid-hydration", () => {
    const authed = source("../routes/_authed.tsx");
    // With `ssr: false` the guard runs while React is still hydrating. A
    // router-state redirect that lands between hydration slices leaves the
    // pending match without a store, and Match reads `.routeId` of undefined.
    expect(authed).toContain("reloadDocument: true");
    expect(authed).toContain("search: signInRedirectSearch(pathname)");
    // Both exits of the guard (no session, no staff role) share one redirect.
    expect(authed.match(/throw toSignIn\(location\.pathname\)/g)?.length).toBe(2);
  });

  test("the sign-in route validates the redirect param through the helper", () => {
    const index = source("../routes/index.tsx");
    expect(index).toContain("validateSearch");
    expect(index).toContain("safeRedirectPath(search.redirect)");
    expect(index).toContain("useLoginRedirect(redirect)");
  });

  test("the hook sends a signed-in member of staff to the validated destination", () => {
    const hook = source("../hooks/use-login-redirect.ts");
    expect(hook).toContain("postLoginDestination(redirectTo, viewer.roles)");
  });
});
