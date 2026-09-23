import { describe, expect, test } from "bun:test";
import { authenticateWithPassword, type AuthDependencies } from "./auth-handler.server";
import { RateLimitExceededError } from "./rate-limit.server";
import { MemoryRateLimitStore } from "../../tests/helpers/memory-rate-limit-store";

function fakeDeps(overrides: Partial<AuthDependencies> = {}): AuthDependencies {
  return {
    client: () =>
      ({
        auth: {
          signInWithPassword: async () => ({
            data: { session: { access_token: "t" } as never },
            error: null,
          }),
        },
      }) as never,
    origin: () => "https://admin.example.com",
    ip: () => "198.51.100.7",
    ...overrides,
  };
}

const credentials = { email: "steward@example.com", password: "hunter22", captchaToken: "tok" };

describe("authenticateWithPassword rate limiting", () => {
  test("allows sign-in through the limit", async () => {
    const store = new MemoryRateLimitStore(() => 0);
    const result = await authenticateWithPassword(
      credentials,
      fakeDeps({ rateLimitStore: store.consume }),
    );
    expect(result.session).not.toBeNull();
  });

  test("blocks after the limit is exceeded for the same ip+email pair", async () => {
    const store = new MemoryRateLimitStore(() => 0);
    const deps = fakeDeps({ rateLimitStore: store.consume });
    for (let i = 0; i < 10; i++) {
      await authenticateWithPassword(credentials, deps);
    }
    await expect(authenticateWithPassword(credentials, deps)).rejects.toThrow(
      "Too many sign-in attempts",
    );
  });

  test("keeps different emails from the same ip isolated", async () => {
    const store = new MemoryRateLimitStore(() => 0);
    const deps = fakeDeps({ rateLimitStore: store.consume });
    for (let i = 0; i < 10; i++) {
      await authenticateWithPassword(credentials, deps);
    }
    await expect(
      authenticateWithPassword({ ...credentials, email: "other@example.com" }, deps),
    ).resolves.toBeTruthy();
  });

  test("propagates a store failure as a generic error, not RateLimitExceededError", async () => {
    const failing = async () => {
      throw new Error("db down");
    };
    await expect(
      authenticateWithPassword(credentials, fakeDeps({ rateLimitStore: failing })),
    ).rejects.toThrow("temporarily unavailable");
    await expect(
      authenticateWithPassword(credentials, fakeDeps({ rateLimitStore: failing })),
    ).rejects.not.toBeInstanceOf(RateLimitExceededError);
  });
});
