import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

/**
 * Renders a component inside a real TanStack router (memory history, the two FAQ
 * paths declared), so `Link` builds the same hrefs it does in the app, and
 * returns the HTML. No DOM is needed.
 *
 * `basepath` mounts the router under a prefix: a router `Link` then writes the
 * prefix into its href and a hand-written `<a href="/faqs/x">` does not, which is
 * how a test can tell the two apart.
 */
export async function renderWithRouter(
  ui: ReactNode,
  path = "/faqs",
  options: { basepath?: string } = {},
): Promise<string> {
  const root = createRootRoute({ component: () => <>{ui}</> });
  const list = createRoute({ getParentRoute: () => root, path: "/faqs", component: () => null });
  const article = createRoute({
    getParentRoute: () => root,
    path: "/faqs/$slug",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([list, article]),
    history: createMemoryHistory({ initialEntries: [`${options.basepath ?? ""}${path}`] }),
    basepath: options.basepath,
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}
