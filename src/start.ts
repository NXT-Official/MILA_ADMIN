import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";

import { renderErrorPage } from "./lib/error-page";
import { captureError } from "./lib/observability/observability";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // This catch turns the error into an HTML page, so Sentry's request
    // middleware never sees it: report it here.
    captureError(error, { tags: { source: "request-error-page" } });
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Sentry's global middlewares go first so they see everything thrown after
// them: request handlers and every server function (all staff actions).
// src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/#capture-server-side-errors · 10.75.2
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware, csrfMiddleware, errorMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware, attachSupabaseAuth],
}));
