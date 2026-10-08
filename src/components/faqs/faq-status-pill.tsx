import type { LucideIcon } from "lucide-react";
import { CircleCheck, CircleDashed, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAQ_STATUS_LABELS, type FaqStatus } from "@/lib/faqs/types";

const TONES: Record<FaqStatus, { icon: LucideIcon; pill: string; glyph: string }> = {
  live: { icon: CircleCheck, pill: "border-success/40 bg-success/10", glyph: "text-success" },
  "partly-live": {
    icon: CircleDashed,
    pill: "border-warning/50 bg-warning/15",
    glyph: "text-warning",
  },
  coming: { icon: Clock, pill: "border-line bg-accent-soft/60", glyph: "text-muted" },
};

/**
 * Whether what an article describes is live, partly live or still coming. The
 * words carry the meaning; the colour and glyph only back them up.
 */
export function FaqStatusPill({ status }: { status: FaqStatus | undefined }) {
  if (!status) return null;
  const { icon: Icon, pill, glyph } = TONES[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-semibold text-ink",
        pill,
      )}
    >
      <Icon className={cn("size-3.5", glyph)} strokeWidth={2} aria-hidden="true" />
      {FAQ_STATUS_LABELS[status]}
    </span>
  );
}
