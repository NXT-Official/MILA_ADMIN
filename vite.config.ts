import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import mkcert from "vite-plugin-mkcert";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import { sentryConnectSources } from "./src/lib/observability/csp";

/** A set, non-blank environment variable, or undefined. */
function envValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function buildCsp(supabaseUrl: string | undefined, sentryDsn: string | undefined): string {
  let supabaseOrigin = "";
  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    supabaseOrigin = "";
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://hcaptcha.com", "https://*.hcaptcha.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": [
      "'self'",
      ...(supabaseOrigin ? [supabaseOrigin] : []),
      "https://hcaptcha.com",
      "https://*.hcaptcha.com",
      // Browser error reports (src/lib/observability). Harmless when no DSN is set.
      ...sentryConnectSources(sentryDsn),
      // Sentry — error monitoring. The client SDK posts event envelopes to
      // the ingest host; without these the CSP silently drops them. Update
      // if the org ever moves regions.
      "https://*.ingest.sentry.io",
      "https://*.sentry.io",
    ],
    "frame-src": ["https://hcaptcha.com", "https://*.hcaptcha.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

export default defineConfig(({ command, mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  const isProd = mode === "production";
  const securityHeaders: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // The staff suite has no camera, mic, geolocation or payment surface.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": buildCsp(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.VITE_SENTRY_DSN,
    ),
    "X-Robots-Tag": "noindex, nofollow",
    ...(isProd
      ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
      : {}),
  };

  // Error reporting (src/lib/observability). The browser bundle can only read
  // values fixed at build time, so the deployment's environment and git SHA are
  // baked in here; an explicit VITE_/SENTRY_ value wins over Vercel's.
  const sentryEnvironment =
    envValue("VITE_SENTRY_ENVIRONMENT") ??
    envValue("SENTRY_ENVIRONMENT") ??
    envValue("VERCEL_ENV") ??
    mode;
  const sentryRelease =
    envValue("VITE_SENTRY_RELEASE") ??
    envValue("SENTRY_RELEASE") ??
    envValue("VERCEL_GIT_COMMIT_SHA");
  // Source maps upload only when a token is present; otherwise the build runs
  // exactly as before, with no network calls to Sentry.
  const sentryAuthToken = envValue("SENTRY_AUTH_TOKEN");

  return {
    // src: node_modules/vite/dist/node/chunks/config.js (userDefineEnv: define keys under import.meta.env.) · 7.3.6
    define: {
      "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(sentryEnvironment),
      "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease ?? ""),
    },
    // 8080 is the member app; both have to run side by side in dev.
    server: { host: "::", port: 8081 },
    // The entry chunk crossed vite's 500 kB warning by carrying every vendor
    // library (react-dom, framer-motion, …). Routes are already split by the
    // router plugin — split the vendors out of the entry so the app shell and
    // the vendor bundles cache independently. Scoped to the client build;
    // SSR/nitro keep their default chunking.
    environments: {
      client: {
        build: {
          rollupOptions: {
            output: {
              // Match whole packages (react-dom/client, scheduler, motion-dom…),
              // not just their entry modules — the object form only moved the
              // main specifiers (a 3.66 kB vendor chunk) and left the rest in
              // the entry.
              manualChunks(id: string) {
                if (!id.includes("node_modules")) return;
                if (
                  id.includes("node_modules/react-dom") ||
                  id.includes("node_modules/scheduler") ||
                  /node_modules\/react\//.test(id)
                ) {
                  return "vendor-react";
                }
                if (
                  id.includes("framer-motion") ||
                  id.includes("node_modules/motion-dom") ||
                  id.includes("node_modules/motion-utils")
                ) {
                  return "vendor-motion";
                }
                if (id.includes("node_modules/@tanstack")) return "vendor-tanstack";
                if (id.includes("node_modules/@supabase")) return "vendor-supabase";
              },
            },
          },
        },
      },
    },
    css: { transformer: "lightningcss" as const },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart(),
      ...(command === "build"
        ? [
            nitro({
              noExternals: true,
              routeRules: {
                "/**": { headers: { ...securityHeaders, "Cache-Control": "no-store" } },
                "/assets/**": {
                  headers: { "Cache-Control": "public, max-age=31536000, immutable" },
                },
              },
            }),
          ]
        : []),
      viteReact(),
      mkcert(),
      // Must be the last plugin.
      // src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/#add-the-sentrytanstackstart-vite-plugin · 10.75.2
      // src: node_modules/@sentry/tanstackstart-react/build/esm/vite/sentryTanstackStart.js · 10.75.2
      sentryTanstackStart({
        org: envValue("SENTRY_ORG"),
        project: envValue("SENTRY_PROJECT"),
        authToken: sentryAuthToken,
        telemetry: false,
        // Server-function spans come from the global middlewares in src/start.ts;
        // the auto-instrumenter would rewrite every *.functions.ts file to add more.
        autoInstrumentMiddleware: false,
        sourcemaps: {
          disable: sentryAuthToken ? false : "disable-upload",
          // Hidden maps are generated only for the upload, then removed so they
          // are never served next to the bundle.
          filesToDeleteAfterUpload: [
            "./.output/**/*.map",
            "./.vercel/output/**/*.map",
            "./dist/**/*.map",
          ],
        },
        release: {
          name: sentryRelease,
          create: Boolean(sentryAuthToken),
          finalize: Boolean(sentryAuthToken),
        },
        // A Sentry outage or a bad token must never fail a deploy.
        errorHandler: (error) => {
          console.warn(`[sentry] ${error.message}. The build continues without source maps.`);
        },
      }),
    ],
  };
});
