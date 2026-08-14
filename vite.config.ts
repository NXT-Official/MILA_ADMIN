import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import mkcert from "vite-plugin-mkcert";

function buildCsp(supabaseUrl: string | undefined): string {
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
    "Content-Security-Policy": buildCsp(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
    "X-Robots-Tag": "noindex, nofollow",
    ...(isProd
      ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
      : {}),
  };

  return {
    // 8080 is the member app; both have to run side by side in dev.
    server: { host: "::", port: 8081 },
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
    ],
  };
});
