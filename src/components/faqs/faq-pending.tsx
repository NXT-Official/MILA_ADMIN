import { Skeleton } from "@/components/ui/skeleton";

/** What shows while the FAQ screens load: the shape of the list, not a spinner. */
export function FaqPending() {
  return (
    // `relative`: the sr-only text below is absolutely positioned and must stay inside the
    // staff shell's scrolling area, not be placed against the whole document.
    <div role="status" aria-live="polite" aria-busy="true" className="relative space-y-8">
      <span className="sr-only">Loading the training articles</span>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-3 w-48 rounded-sm" />
        <Skeleton className="h-12 w-full rounded-control" />
      </div>
      {[0, 1, 2].map((group) => (
        <div
          key={group}
          aria-hidden="true"
          className="grid gap-4 border-t border-line py-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-10"
        >
          <Skeleton className="h-6 w-36 rounded-sm" />
          <div className="space-y-5">
            {[0, 1].map((row) => (
              <div key={row} className="space-y-2">
                <Skeleton className="h-5 w-2/5 rounded-sm" />
                <Skeleton className="h-4 w-4/5 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
