import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TableBrowser } from "@/components/admin/table-browser";
import { BROWSABLE_TABLES, isBrowsableTable, type BrowsableTable } from "@/lib/database.functions";
import { requireStaffRoutePermission } from "@/lib/staff-route";

export const Route = createFileRoute("/_authed/database")({
  // The table lives in the URL, so analytics cards can deep-link into it and
  // the view can be shared or bookmarked.
  validateSearch: (search: Record<string, unknown>): { table?: BrowsableTable } => ({
    table: isBrowsableTable(search.table) ? search.table : undefined,
  }),
  beforeLoad: ({ context }) => requireStaffRoutePermission(context.queryClient, "database.view"),
  component: DatabasePage,
});

function DatabasePage() {
  const { table } = Route.useSearch();
  const navigate = useNavigate();
  const active = table ?? BROWSABLE_TABLES[0];

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-stone">
        Read-only view of the live database. Pick a table, search inside it, and export the rows you
        are looking at.
      </p>
      <TableBrowser
        table={active}
        onTableChange={(next) =>
          navigate({ to: "/database", search: { table: next }, replace: true })
        }
      />
    </div>
  );
}
