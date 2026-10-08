import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqCalloutKind = "note" | "important";

/**
 * A `> **Note:**` or `> **Important:**` block from an article.
 *
 * A tinted panel with a hairline border on all four sides and the admin's panel
 * radius (the same shape the other inline alerts use, for example the failure
 * notices on Announcements and Subscriptions). The meaning is in the words: the
 * author's bold "Note:" or "Important:" is the label, and the two kinds also differ
 * in icon shape, so the tint never carries it alone. Text stays the ink colour on
 * the tint (about 13:1 on the note tint and 12:1 on the important tint in light
 * mode, 12:1 and 9.5:1 in dark).
 *
 * No admin alert component exists to reuse (`ui/` has Card, EmptyState and
 * ErrorState, which are full-width page states), so this one lives next to the
 * article renderer.
 */
const KINDS: Record<FaqCalloutKind, { icon: typeof Info; surface: string }> = {
  note: { icon: Info, surface: "border-line bg-accent-soft/60" },
  important: { icon: TriangleAlert, surface: "border-warning/50 bg-warning/10" },
};

export function FaqCallout({ kind, children }: { kind: FaqCalloutKind; children: ReactNode }) {
  const { icon: Icon, surface } = KINDS[kind];
  return (
    <div
      data-callout={kind}
      role="note"
      className={cn("my-6 flex gap-3 rounded-panel border p-4 text-ink", surface)}
    >
      <Icon className="mt-1 size-4.5 shrink-0 text-ink" strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0 space-y-2 [&>p]:my-0">{children}</div>
    </div>
  );
}
