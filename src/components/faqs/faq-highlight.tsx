import type { SnippetPart } from "@/lib/faqs/search";

/** Search text with the words that matched marked. Plain React text, never HTML. */
export function FaqHighlight({ parts }: { parts: readonly SnippetPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          // No horizontal padding: it would pull "refund" and "s" of "refunds" apart.
          <mark key={index} className="rounded-sm bg-accent/35 text-ink">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
