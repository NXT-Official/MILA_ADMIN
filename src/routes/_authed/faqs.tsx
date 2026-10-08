import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FaqBrowser } from "@/components/faqs/faq-browser";
import { FaqPending } from "@/components/faqs/faq-pending";
import { LoadErrorPanel } from "@/components/ui/error-state";
import { useSlashToFocus } from "@/components/faqs/use-slash-focus";
import { faqArticles, faqIndex, faqProblems } from "@/lib/faqs/library";
import { parseFaqQuery } from "@/lib/faqs/query";
import { requireStaffRoutePermission } from "@/lib/staff-route";

/** How long typing has to pause before the search is written into the address. */
const URL_DEBOUNCE_MS = 250;

export const Route = createFileRoute("/_authed/faqs")({
  // The search lives in the address, so a result list can be shared and the back
  // button returns to it.
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: parseFaqQuery(search.q),
  }),
  beforeLoad: ({ context }) => requireStaffRoutePermission(context.queryClient, "faqs.view"),
  pendingComponent: FaqPending,
  errorComponent: ({ reset }) => (
    <LoadErrorPanel title="Couldn't open the training articles" onRetry={reset} />
  ),
  component: FaqsPage,
});

function FaqsPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState(q ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  // What the address holds, as far as this page knows, so it can tell its own
  // updates from the back button or a link arriving with a different ?q=.
  const inAddress = useRef(q ?? "");

  useSlashToFocus(inputRef);

  useEffect(() => {
    if ((q ?? "") === inAddress.current) return;
    inAddress.current = q ?? "";
    setQuery(q ?? "");
  }, [q]);

  useEffect(() => {
    const wanted = query.trim();
    if (wanted === inAddress.current) return;
    const timer = setTimeout(() => {
      inAddress.current = wanted;
      void navigate({
        to: "/faqs",
        search: { q: wanted === "" ? undefined : wanted },
        replace: true,
      });
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, navigate]);

  return (
    <FaqBrowser
      articles={faqArticles}
      problems={faqProblems}
      index={faqIndex}
      query={query}
      onQueryChange={setQuery}
      inputRef={inputRef}
    />
  );
}
