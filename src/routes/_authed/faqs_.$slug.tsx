import { createFileRoute, useLocation } from "@tanstack/react-router";
import { FaqArticleMissing, FaqArticleView } from "@/components/faqs/faq-article-view";
import { FaqPending } from "@/components/faqs/faq-pending";
import { LoadErrorPanel } from "@/components/ui/error-state";
import { faqArticles, findFaqArticle } from "@/lib/faqs/library";
import { parseFaqQuery } from "@/lib/faqs/query";
import { requireStaffRoutePermission } from "@/lib/staff-route";

// The trailing underscore in the file name (`faqs_`) makes this a sibling of the
// list route instead of a child, so it needs no <Outlet/> in the list page.
// src: https://tanstack.com/router/latest/docs/framework/react/routing/file-naming-conventions#non-nested-routes · @tanstack/react-router 1.170.41 · 2026-10-07
export const Route = createFileRoute("/_authed/faqs_/$slug")({
  // The search the reader came from, so the article can link back to its results.
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: parseFaqQuery(search.q),
  }),
  beforeLoad: ({ context }) => requireStaffRoutePermission(context.queryClient, "faqs.view"),
  pendingComponent: FaqPending,
  errorComponent: ({ reset }) => (
    <LoadErrorPanel title="Couldn't open this article" onRetry={reset} />
  ),
  component: FaqArticlePage,
});

function FaqArticlePage() {
  const { slug } = Route.useParams();
  const { q } = Route.useSearch();
  const hash = useLocation({ select: (location) => location.hash });
  const article = findFaqArticle(slug);

  if (!article) return <FaqArticleMissing q={q} />;
  return (
    <FaqArticleView
      article={article}
      articles={faqArticles}
      q={q}
      hash={hash.replace(/^#/, "") || undefined}
    />
  );
}
