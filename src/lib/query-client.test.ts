import { describe, expect, mock, test } from "bun:test";
import { MutationObserver } from "@tanstack/react-query";
import { createQueryClient } from "./query-client";

describe("createQueryClient reports every failed query and mutation", () => {
  test("a failed query is reported once, with its key's namespace and numbers only", async () => {
    const report = mock((_error: unknown, _context: unknown) => {});
    const client = createQueryClient(report);
    const error = new Error("members failed to load");
    await client
      .fetchQuery({
        queryKey: ["members", "page", 2],
        queryFn: () => Promise.reject(error),
        retry: false,
      })
      .catch(() => {});
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error, {
      tags: { source: "react-query", kind: "query" },
      extra: { queryKey: ["members", 2] },
    });
  });

  test("search text typed into the Database browser never leaves in the query key", async () => {
    const report = mock((_error: unknown, _context: unknown) => {});
    const client = createQueryClient(report);
    await client
      .fetchQuery({
        queryKey: ["admin:database-table", "profiles", 0, "Jane Doe"],
        queryFn: () => Promise.reject(new Error("db down")),
        retry: false,
      })
      .catch(() => {});
    expect(report.mock.calls[0]?.[1]).toEqual({
      tags: { source: "react-query", kind: "query" },
      extra: { queryKey: ["admin:database-table", 0] },
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain("Jane");
  });

  test("a failed mutation is reported with its key, never its variables", async () => {
    const report = mock((_error: unknown, _context: unknown) => {});
    const client = createQueryClient(report);
    const error = new Error("grant failed");
    const observer = new MutationObserver(client, {
      mutationKey: ["grant-credits", "jane@example.com"],
      mutationFn: (_vars: { email: string }) => Promise.reject(error),
    });
    await observer.mutate({ email: "jane@example.com" }).catch(() => {});
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error, {
      tags: { source: "react-query", kind: "mutation" },
      extra: { mutationKey: ["grant-credits"] },
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain("jane@example.com");
  });

  test("successful work reports nothing, and the default reporter is safe without a DSN", async () => {
    const report = mock((_error: unknown, _context: unknown) => {});
    const client = createQueryClient(report);
    await client.fetchQuery({ queryKey: ["ok"], queryFn: () => Promise.resolve(1) });
    expect(report).not.toHaveBeenCalled();

    const quiet = createQueryClient();
    await expect(
      quiet.fetchQuery({
        queryKey: ["x"],
        queryFn: () => Promise.reject(new Error("x")),
        retry: false,
      }),
    ).rejects.toThrow("x");
  });
});
