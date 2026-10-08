import { describe, expect, test } from "bun:test";
import {
  MEMBERS_PAGE_SIZE,
  PROFILE_MATCH_LIMIT,
  listMembersPage,
  mergeMemberPages,
  type AuthUserLite,
} from "./member-list";

const TOTAL = 450;
const USERS: AuthUserLite[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: `id-${i + 1}`,
  email: `member-${i + 1}@example.com`,
}));

/** A stand-in for the auth admin API: `perPage`-sized pages, 1-based, like listUsers. */
function source(users = USERS) {
  const calls: number[] = [];
  return {
    calls,
    fetchPage: async (page: number, perPage: number) => {
      calls.push(page);
      const slice = users.slice((page - 1) * perPage, page * perPage);
      return {
        users: slice,
        total: users.length,
        nextPage: page * perPage < users.length ? page + 1 : null,
      };
    },
  };
}
const noProfiles = async () => new Set<string>();

describe("listMembersPage without a search", () => {
  test("the first page is 200 members and says there is more", async () => {
    const result = await listMembersPage({ ...source(), findProfileIds: noProfiles, page: 1 });
    expect(result.users).toHaveLength(MEMBERS_PAGE_SIZE);
    expect(result.nextPage).toBe(2);
    expect(result.total).toBe(TOTAL);
  });

  test("the 350th member is reachable on page 2, and the last page ends the list", async () => {
    const two = await listMembersPage({ ...source(), findProfileIds: noProfiles, page: 2 });
    expect(two.users.map((user) => user.id)).toContain("id-350");
    const three = await listMembersPage({ ...source(), findProfileIds: noProfiles, page: 3 });
    expect(three.users).toHaveLength(50);
    expect(three.nextPage).toBeNull();
  });

  test("a page is one call to the auth API", async () => {
    const api = source();
    await listMembersPage({ ...api, findProfileIds: noProfiles, page: 2 });
    expect(api.calls).toEqual([2]);
  });
});

describe("listMembersPage with a search", () => {
  test("finds a member past the first 200 by email", async () => {
    const result = await listMembersPage({
      ...source(),
      findProfileIds: noProfiles,
      page: 1,
      search: "member-350@",
    });
    expect(result.users.map((user) => user.id)).toEqual(["id-350"]);
    expect(result.nextPage).toBeNull();
  });

  test("finds a member past the first 200 by a profile name or username", async () => {
    const result = await listMembersPage({
      ...source(),
      findProfileIds: async () => new Set(["id-401"]),
      page: 1,
      search: "zara",
    });
    expect(result.users.map((user) => user.id)).toEqual(["id-401"]);
  });

  test("matches are paged like the list, so a wide search is not cut at 200", async () => {
    const first = await listMembersPage({
      ...source(),
      findProfileIds: noProfiles,
      page: 1,
      search: "example",
    });
    expect(first.users).toHaveLength(MEMBERS_PAGE_SIZE);
    expect(first.nextPage).toBe(2);
    const third = await listMembersPage({
      ...source(),
      findProfileIds: noProfiles,
      page: 3,
      search: "example",
    });
    expect(third.users).toHaveLength(50);
    expect(third.nextPage).toBeNull();
  });

  test("email matching ignores case, and a blank search is no search", async () => {
    const loud = await listMembersPage({
      ...source(),
      findProfileIds: noProfiles,
      page: 1,
      search: "MEMBER-7@",
    });
    expect(loud.users.map((user) => user.id)).toEqual(["id-7"]);
    const api = source();
    await listMembersPage({ ...api, findProfileIds: noProfiles, page: 1, search: "   " });
    expect(api.calls).toEqual([1]);
  });

  test("an unreadable profile search is an error, not a silently smaller result", async () => {
    await expect(
      listMembersPage({
        ...source(),
        findProfileIds: async () => {
          throw new Error("boom");
        },
        page: 1,
        search: "x",
      }),
    ).rejects.toThrow();
  });
});

describe("past 1,800 members, where the auth library's own nextPage goes wrong", () => {
  const BIG = Array.from({ length: 2500 }, (_, i) => ({
    id: `big-${i + 1}`,
    email: `big-${i + 1}@example.com`,
  }));

  /** Like the installed auth-js: nextPage keeps only the first digit of the page number. */
  function buggySource() {
    const calls: number[] = [];
    return {
      calls,
      fetchPage: async (page: number, perPage: number) => {
        calls.push(page);
        const next = page * perPage < BIG.length ? Number(String(page + 1).substring(0, 1)) : null;
        return {
          users: BIG.slice((page - 1) * perPage, page * perPage),
          total: BIG.length,
          nextPage: next,
        };
      },
    };
  }

  test("page 10 is fetched, and the last member is on page 13", async () => {
    const api = buggySource();
    const ten = await listMembersPage({ ...api, findProfileIds: noProfiles, page: 10 });
    expect(api.calls).toEqual([10]);
    expect(ten.users[0]?.id).toBe("big-1801");
    expect(ten.nextPage).toBe(11);

    const last = await listMembersPage({ ...api, findProfileIds: noProfiles, page: 13 });
    expect(last.users.at(-1)?.id).toBe("big-2500");
    expect(last.nextPage).toBeNull();
  });

  test("walking Load more from page 1 reaches every member once, never looping", async () => {
    const api = buggySource();
    const seen: string[] = [];
    let page: number | null = 1;
    for (let guard = 0; page !== null && guard < 20; guard++) {
      const result = await listMembersPage({ ...api, findProfileIds: noProfiles, page });
      seen.push(...result.users.map((user) => user.id));
      page = result.nextPage;
    }
    expect(seen).toHaveLength(2500);
    expect(new Set(seen).size).toBe(2500);
  });

  test("a search finds a member past 1,800", async () => {
    const result = await listMembersPage({
      ...buggySource(),
      findProfileIds: noProfiles,
      page: 1,
      search: "big-2321@",
    });
    expect(result.users.map((user) => user.id)).toEqual(["big-2321"]);
    expect(result.truncated).toBe(false);
  });
});

describe("caps are reported, never silent", () => {
  test("a search cut short by the scan cap says so", async () => {
    const huge = {
      fetchPage: async (page: number) => ({
        users: [{ id: `h-${page}`, email: `h-${page}@example.com` }],
        total: 1_000_000,
      }),
    };
    const result = await listMembersPage({
      ...huge,
      findProfileIds: noProfiles,
      page: 1,
      search: "h-",
    });
    expect(result.truncated).toBe(true);
    expect(result.users.length).toBeGreaterThan(0);
  });

  test("a search that fills the profile-match limit says so", async () => {
    const many = new Set(Array.from({ length: PROFILE_MATCH_LIMIT }, (_, i) => `p-${i}`));
    const result = await listMembersPage({
      ...source(),
      findProfileIds: async () => many,
      page: 1,
      search: "x",
    });
    expect(result.truncated).toBe(true);
  });

  test("an ordinary search is not truncated", async () => {
    const result = await listMembersPage({
      ...source(),
      findProfileIds: noProfiles,
      page: 1,
      search: "member-5@",
    });
    expect(result.truncated).toBe(false);
  });
});

describe("mergeMemberPages", () => {
  test("a member on two pages (a sign-up between clicks) appears once, in first-seen order", () => {
    const merged = mergeMemberPages([
      { rows: [{ id: "a" }, { id: "b" }] },
      { rows: [{ id: "b" }, { id: "c" }] },
    ]);
    expect(merged.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });
});
