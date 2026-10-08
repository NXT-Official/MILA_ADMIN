/**
 * The members list, one page at a time. Staff must be able to reach every
 * member, not only the first 200 accounts the auth API returns by default.
 *
 * - No search: one call to the auth API per page, so the list loads as fast as
 *   it did, and `nextPage` says whether "Load more" has anything to load.
 * - Search: the auth API cannot filter, so this walks the accounts (up to
 *   MAX_SCAN_PAGES pages) and keeps the ones whose email matches or whose
 *   profile name or username matched, then pages those matches the same way.
 *
 * The next page is worked out here from `total`, never taken from the auth
 * library's own `nextPage`.
 * src: @supabase/auth-js 2.110.0, dist/main/GoTrueAdminApi.js listUsers reads the
 * page number out of the Link header with `.substring(0, 1)`, which keeps only its
 * first digit: nextPage is right up to page 8, then wraps back to 1 from page 9.
 */
export const MEMBERS_PAGE_SIZE = 200;
/** A safety stop of 10,000 accounts for one search. */
export const MAX_SCAN_PAGES = 50;
/** The most profile matches one search asks for. */
export const PROFILE_MATCH_LIMIT = 5000;

export interface AuthUserLite {
  id: string;
  email?: string | null;
}

export interface AuthPage<User extends AuthUserLite> {
  users: User[];
  total: number;
}

export interface MembersPage<User extends AuthUserLite> {
  users: User[];
  /** All accounts when browsing, all matches when searching. */
  total: number;
  nextPage: number | null;
  /** True when a cap cut a search short, so the matches shown are not all of them. */
  truncated: boolean;
}

export async function listMembersPage<User extends AuthUserLite>(input: {
  fetchPage: (page: number, perPage: number) => Promise<AuthPage<User>>;
  findProfileIds: (term: string) => Promise<ReadonlySet<string>>;
  page: number;
  search?: string;
}): Promise<MembersPage<User>> {
  const term = (input.search ?? "").trim().toLowerCase();
  if (term === "") {
    const result = await input.fetchPage(input.page, MEMBERS_PAGE_SIZE);
    return {
      users: result.users,
      total: result.total,
      nextPage: input.page * MEMBERS_PAGE_SIZE < result.total ? input.page + 1 : null,
      truncated: false,
    };
  }

  const profileIds = await input.findProfileIds(term);
  const matches: User[] = [];
  let truncated = profileIds.size >= PROFILE_MATCH_LIMIT;
  for (let page = 1; ; page++) {
    if (page > MAX_SCAN_PAGES) {
      truncated = true;
      break;
    }
    const result = await input.fetchPage(page, MEMBERS_PAGE_SIZE);
    for (const user of result.users) {
      if ((user.email ?? "").toLowerCase().includes(term) || profileIds.has(user.id)) {
        matches.push(user);
      }
    }
    if (result.users.length === 0 || page * MEMBERS_PAGE_SIZE >= result.total) break;
  }

  const from = (input.page - 1) * MEMBERS_PAGE_SIZE;
  return {
    users: matches.slice(from, from + MEMBERS_PAGE_SIZE),
    total: matches.length,
    nextPage: from + MEMBERS_PAGE_SIZE < matches.length ? input.page + 1 : null,
    truncated,
  };
}

/** Pages joined into one list, a member who shows up on two pages (a sign-up between clicks) once. */
export function mergeMemberPages<Row extends { id: string }>(
  pages: readonly { rows: readonly Row[] }[],
): Row[] {
  const seen = new Set<string>();
  const merged: Row[] = [];
  for (const page of pages) {
    for (const row of page.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}
