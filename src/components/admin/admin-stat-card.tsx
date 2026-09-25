import { Link } from "@tanstack/react-router";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StaffRoute } from "@/lib/authorization";
import type { BrowsableTable } from "@/lib/database.functions";

/**
 * A card is either a database drill-down (with the table it opens) or a link
 * to a staff screen. The discriminated union keeps `table` mandatory exactly
 * where it is used.
 */
export type AdminStatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
} & ({ to: "/database"; table: BrowsableTable } | { to: Exclude<StaffRoute, "/database"> });

export function AdminStatCard(props: AdminStatCardProps) {
  const { icon: Icon, label, value, sublabel } = props;

  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-nano uppercase tracking-label-wide text-stone">{label}</span>
        <span className="flex items-center gap-1">
          <Icon className="size-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
          <ArrowUpRight
            className="size-3.5 text-accent opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>
      </div>
      <div className="font-serif text-3xl text-ink">{value}</div>
      {sublabel && <div className="text-micro uppercase tracking-label text-stone">{sublabel}</div>}
    </>
  );

  const className = cn(
    "atelier-focus-ring group rounded-panel border border-porcelain/60 bg-atelier-panel/40 p-5 flex flex-col gap-3 transition-colors hover:border-accent/50 hover:bg-atelier-panel/60",
  );

  if (props.to === "/database") {
    return (
      <Link to="/database" search={{ table: props.table }} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <Link to={props.to} className={className}>
      {body}
    </Link>
  );
}
