import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// Review N1, verified against the real SDK: @sentry/browser builds every click
// breadcrumb from the element, attribute values included. The probe runs in a
// child process because it installs fake `window` / `document` globals.
test("real @sentry/browser click breadcrumbs keep the element path and lose the member text", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const run = Bun.spawnSync({
    cmd: [process.execPath, "tests/observability/click-breadcrumbs.probe.ts"],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(run.stderr.toString()).toBe("");
  const { registered, crumbs } = JSON.parse(run.stdout.toString()) as {
    registered: string[];
    crumbs: Array<{ category: string; raw: string; sent: string }>;
  };

  expect(registered).toContain("click");
  expect(crumbs.map((crumb) => crumb.category)).toEqual([
    "ui.click",
    "ui.click",
    "ui.click",
    "ui.click",
  ]);
  // The SDK really does put the member's name into the message...
  for (const crumb of crumbs.slice(0, 3)) expect(crumb.raw).toContain("Jane Doe");
  // ...and what we send is rebuilt from the clicked element (the hint): tag, id,
  // classes, type and name only. No attribute value is read, so none can leak.
  expect(crumbs.map((crumb) => crumb.sent)).toEqual([
    "tr.row > td.px-5.truncate",
    "div.flex > button.switch",
    "button.h-8.px-3",
    'input.h-9[type="text"][name="search"]',
  ]);
});
