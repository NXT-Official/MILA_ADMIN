export const FAQ_QUERY_MAX_LENGTH = 120;

/**
 * Reads `?q=` from the address. The router parses search values as JSON, so
 * `?q=2026` arrives as a number and `?q=true` as a boolean; both are still the
 * words someone typed. Anything else is ignored rather than trusted.
 */
export function parseFaqQuery(value: unknown): string | undefined {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";
  const trimmed = text.trim().slice(0, FAQ_QUERY_MAX_LENGTH).trim();
  return trimmed === "" ? undefined : trimmed;
}
