import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("signing in replaces the sign-in screen, so Back does not return to it", () => {
  const hook = readFileSync(new URL("./use-login-redirect.ts", import.meta.url), "utf8");
  expect(hook).toMatch(/navigate\(\{\s*to: destination,\s*replace: true\s*\}\)/);
});
