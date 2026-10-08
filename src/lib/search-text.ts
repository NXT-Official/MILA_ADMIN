/** Commas, parens and quotes would break PostgREST's `or` filter grammar. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[,()\\*"]/g, " ").trim();
}
