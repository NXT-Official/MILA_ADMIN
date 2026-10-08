import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { captureClientException } from "../sentry-client";
import { captureServerException } from "../sentry.server";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const before = (text: string, first: string, second: string) => {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
};

describe("entry points start Sentry before anything runs", () => {
  test("server entry: init first, then a per-request isolated, Sentry-wrapped handler", () => {
    const server = source("../../server.ts");
    expect(server).toContain('from "@tanstack/react-start/server-entry"');
    // An explicit call, not a bare import: package.json has "sideEffects": false.
    expect(server).toMatch(/^initServerObservability\(\);$/m);
    expect(before(server, "initServerObservability();", "createServerEntry(")).toBe(true);
    expect(server).toContain("createServerEntry(createObservedServerEntry(");
  });

  test("client entry: init before hydration, and React's caught errors are reported", () => {
    const client = source("../../client.tsx");
    expect(client).toMatch(/^initClientObservability\(\);$/m);
    expect(before(client, "initClientObservability();", "hydrateRoot(")).toBe(true);
    expect(client).toContain("onCaughtError");
    expect(client).toContain("<StartClient />");
  });
});

describe("every server error path reports", () => {
  test("Sentry's global middlewares run first in start.ts", () => {
    const start = source("../../start.ts");
    expect(start).toMatch(/requestMiddleware:\s*\[\s*sentryGlobalRequestMiddleware,/);
    expect(start).toMatch(/functionMiddleware:\s*\[\s*sentryGlobalFunctionMiddleware,/);
    // The existing csrf/error/auth middlewares all stay.
    expect(start).toContain("csrfMiddleware, errorMiddleware]");
    expect(start).toContain("attachSupabaseAuth]");
  });

  test("the HTML error middleware reports what it swallows", () => {
    const start = source("../../start.ts");
    const catchBlock = start.slice(start.indexOf("} catch (error) {"));
    expect(before(catchBlock, "captureError(error", "renderErrorPage()")).toBe(true);
  });

  test("the auth middleware identifies the verified caller by id only", () => {
    const auth = source("../../integrations/supabase/auth-middleware.ts");
    expect(auth).toContain("identify(data.claims.sub)");
    expect(before(auth, "getClaims(token)", "identify(data.claims.sub)")).toBe(true);
    // After the account checks pass (review M7), not merely after the token verifies.
    expect(before(auth, "Forbidden: Account suspended", "identify(data.claims.sub)")).toBe(true);
    expect(auth).not.toMatch(/identify\([^)]*email/);
  });
});

describe("every client error path reports", () => {
  test("the router builds its QueryClient with the reporting caches", () => {
    const router = source("../../router.tsx");
    expect(router).toContain("createQueryClient()");
    expect(router).not.toContain("new QueryClient(");
  });

  test("the root error screen reports once per error, and the signed-in id is attached", () => {
    const root = source("../../routes/__root.tsx");
    // Logged and reported once per error, after render (review M6: it logged on every render).
    // logErrorOnce, because React's onCaughtError has usually logged the same error already
    // (review round 2: the caught render error was logged twice).
    expect(root).toMatch(
      /useEffect\(\(\) => \{\s*logErrorOnce\(error\);\s*captureClientException\(error\);\s*\}, \[error\]\)/,
    );
    expect(root).not.toMatch(/console\.error\(error\)/);
    expect(root).toContain("<ObservabilityIdentity />");
  });
});

describe("the old Sentry modules are thin delegates", () => {
  test("they no longer initialise an SDK of their own", () => {
    for (const path of ["../sentry.server.ts", "../sentry-client.ts"]) {
      const text = source(path);
      expect(text).not.toContain("Sentry.init(");
      expect(text).toContain('from "./observability/observability"');
    }
  });

  test("they are safe to call with no DSN configured", () => {
    expect(() => captureServerException(new Error("x"))).not.toThrow();
    expect(() => captureClientException(new Error("x"))).not.toThrow();
  });
});

describe("build config", () => {
  const vite = source("../../../vite.config.ts");

  test("CSP lets the browser reach Sentry", () => {
    expect(vite).toContain("...sentryConnectSources(");
  });

  test("source maps upload only with SENTRY_AUTH_TOKEN, and the Sentry plugin runs last", () => {
    expect(vite).toContain("sentryTanstackStart({");
    expect(vite).toContain('"disable-upload"');
    expect(vite).toContain("SENTRY_AUTH_TOKEN");
    expect(vite).toContain("autoInstrumentMiddleware: false");
    expect(before(vite, "mkcert()", "sentryTanstackStart({")).toBe(true);
  });

  test("environment and release are baked into the client from Vercel", () => {
    expect(vite).toContain('"import.meta.env.VITE_SENTRY_ENVIRONMENT"');
    expect(vite).toContain('"import.meta.env.VITE_SENTRY_RELEASE"');
    expect(vite).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(vite).toContain("VERCEL_ENV");
  });
});
