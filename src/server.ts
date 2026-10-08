// Server entry. TanStack Start picks up src/server.ts automatically and falls
// back to its default entry when the file is absent; this one is the default
// entry plus Sentry.
// src: node_modules/@tanstack/react-start/src/default-entry/server.ts · 1.168.60
// src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/#without---import-flag · 10.75.2
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { initServerObservability } from "./lib/observability/instrument.server";
import { createObservedServerEntry } from "./lib/observability/server-entry.server";

// Before the first request is handled. A no-op without SENTRY_DSN.
initServerObservability();

export default createServerEntry(createObservedServerEntry(handler.fetch));
