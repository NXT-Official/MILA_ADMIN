// Real-SDK probe for click breadcrumbs (review N1). Runs the actual @sentry/browser
// breadcrumbs integration against a minimal fake DOM, with the app's real
// `beforeBreadcrumb` hook, and prints what the SDK built and what we would send.
//
// Run in its own process by src/lib/observability/click-breadcrumbs.test.ts:
// it installs `window` / `document` globals that must not leak into other tests.

type Listener = (event: unknown) => void;
const listeners: Record<string, Listener> = {};
const globals = globalThis as Record<string, unknown>;
globals.document = {
  addEventListener: (type: string, listener: Listener) => {
    listeners[type] = listener;
  },
  readyState: "complete",
};
globals.window = globalThis;

const Sentry = await import("@sentry/browser");
const { buildSentryOptions } = await import("../../src/lib/observability/sentry-options");

const options = buildSentryOptions("client", { dsn: "http://public@127.0.0.1:9/1" });
if (!options) throw new Error("no options");

const crumbs: Array<{ category?: string; raw?: string; sent?: string }> = [];
const client = new Sentry.BrowserClient({
  dsn: options.dsn,
  stackParser: Sentry.defaultStackParser,
  transport: () => ({ send: async () => ({}), flush: async () => true }),
  integrations: [
    Sentry.breadcrumbsIntegration({
      console: false,
      fetch: false,
      xhr: false,
      history: false,
      sentry: false,
      dom: true,
    }),
  ],
  beforeBreadcrumb(breadcrumb, hint) {
    const raw = breadcrumb.message;
    const sent = options.beforeBreadcrumb(breadcrumb, hint);
    crumbs.push({ category: breadcrumb.category, raw, sent: sent?.message });
    return sent;
  },
});
Sentry.getCurrentScope().setClient(client);
client.init();

const element = (
  tag: string,
  attributes: Record<string, string>,
  parentNode: unknown = null,
): Record<string, unknown> => ({
  tagName: tag.toUpperCase(),
  id: attributes.id ?? "",
  className: attributes.class ?? "",
  getAttribute: (name: string) => attributes[name] ?? null,
  parentNode,
});

// The three pages the review named, plus a control that carries no member text.
const targets = [
  element("td", { class: "px-5 truncate", title: "Jane Doe" }, element("tr", { class: "row" })),
  element(
    "button",
    { class: "switch", "aria-label": "Steward role for Jane Doe" },
    element("div", { class: "flex" }),
  ),
  element("button", {
    class: "h-8 px-3",
    "aria-label": "Delete post by Jane Doe",
    title: "Delete",
  }),
  element("input", { class: "h-9", type: "text", name: "search" }),
];
for (const target of targets) listeners.click?.({ type: "click", target });

process.stdout.write(JSON.stringify({ registered: Object.keys(listeners), crumbs }));
