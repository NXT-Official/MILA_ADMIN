import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { captureError, type ErrorContext } from "@/lib/observability/observability";
import { structuralKey } from "@/lib/observability/scrub";

type Report = (error: unknown, context: ErrorContext) => void;

/**
 * The app's QueryClient. Same defaults as before; the caches add one thing:
 * every query or mutation that finally fails (after retries) is reported, even
 * when the screen shows its own error state.
 *
 * Context sent: the key's namespace, numbers and ids only (`structuralKey`).
 * Keys can carry what staff typed (the Database browser's key ends in the
 * search text), and mutation variables can hold member data, so neither goes.
 * src: node_modules/@tanstack/query-core/build/modern/_tsup-dts-rollup.d.ts (QueryCacheConfig, MutationCacheConfig) · 5.101.2
 */
export function createQueryClient(report: Report = captureError): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        report(error, {
          tags: { source: "react-query", kind: "query" },
          extra: { queryKey: structuralKey(query.queryKey) },
        });
      },
    }),
    mutationCache: new MutationCache({
      onError(error, _variables, _onMutateResult, mutation) {
        report(error, {
          tags: { source: "react-query", kind: "mutation" },
          extra: { mutationKey: structuralKey(mutation.options.mutationKey) },
        });
      },
    }),
  });
}
