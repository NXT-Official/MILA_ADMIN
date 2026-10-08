export type SuspendRequest<Row> =
  { kind: "reinstate" } | { kind: "confirm"; member: Row } | { kind: "self" } | { kind: "missing" };

/**
 * What a click on Suspend or Reinstate should do. Reinstating needs no row and
 * no question. Suspending asks first, but only for a row still in the list (a
 * refresh can drop it) and never for the signed-in steward's own account. The
 * two refusals are their own answers so the page can tell staff, not stay silent.
 */
export function resolveSuspendRequest<Row extends { id: string }>(input: {
  rows: readonly Row[];
  id: string;
  suspended: boolean;
  currentUserId: string | undefined;
}): SuspendRequest<Row> {
  if (!input.suspended) return { kind: "reinstate" };
  if (input.currentUserId && input.id === input.currentUserId) return { kind: "self" };
  const member = input.rows.find((row) => row.id === input.id);
  return member ? { kind: "confirm", member } : { kind: "missing" };
}
