// Client entry. TanStack Start picks up src/client.tsx automatically and falls
// back to its default entry when the file is absent; this one is the default
// entry plus Sentry, started before hydration.
// src: node_modules/@tanstack/react-start/src/default-entry/client.tsx · 1.168.60
// src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/#configure-client-side-sentry · 10.75.2
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { initClientObservability, onCaughtError } from "./lib/observability/instrument.client";

// A no-op without VITE_SENTRY_DSN.
initClientObservability();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    { onCaughtError },
  );
});
