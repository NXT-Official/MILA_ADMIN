import { describe, expect, mock, test } from "bun:test";
import { createObservability, logErrorOnce, type ObservabilitySdk } from "./observability";

function fakeSdk(enabled = true) {
  const sdk = {
    isEnabled: mock(() => enabled),
    captureException: mock((_error: unknown, _context?: unknown) => "event-id"),
    setUser: mock((_user: { id: string } | null) => {}),
    addBreadcrumb: mock((_breadcrumb: unknown) => {}),
    logger: {
      info: mock((_m: string, _a?: Record<string, unknown>) => {}),
      warn: mock((_m: string, _a?: Record<string, unknown>) => {}),
      error: mock((_m: string, _a?: Record<string, unknown>) => {}),
    },
  };
  return sdk satisfies ObservabilitySdk;
}

describe("observability facade", () => {
  test("forwards errors with tags and extra context", () => {
    const sdk = fakeSdk();
    const o = createObservability(sdk);
    const error = new Error("boom");
    o.captureError(error, { tags: { source: "react-query" }, extra: { queryKey: ["members"] } });
    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      tags: { source: "react-query" },
      extra: { queryKey: ["members"] },
    });
  });

  test("identify sends the user id only, and a missing id resets", () => {
    const sdk = fakeSdk();
    const o = createObservability(sdk);
    o.identify("staff-1");
    expect(sdk.setUser).toHaveBeenLastCalledWith({ id: "staff-1" });
    o.identify(null);
    expect(sdk.setUser).toHaveBeenLastCalledWith(null);
    o.identify("staff-2");
    o.reset();
    expect(sdk.setUser).toHaveBeenLastCalledWith(null);
  });

  test("track leaves a breadcrumb and log.* writes structured logs", () => {
    const sdk = fakeSdk();
    const o = createObservability(sdk);
    o.track("credit_grant_submitted", { amount: 5 });
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({
      category: "track",
      message: "credit_grant_submitted",
      data: { amount: 5 },
      level: "info",
    });
    o.log.info("loaded", { count: 2 });
    o.log.warn("slow");
    o.log.error("failed", { step: "grant" });
    expect(sdk.logger.info).toHaveBeenCalledWith("loaded", { count: 2 });
    expect(sdk.logger.warn).toHaveBeenCalledWith("slow", undefined);
    expect(sdk.logger.error).toHaveBeenCalledWith("failed", { step: "grant" });
  });

  test("no DSN means no-op: nothing reaches the SDK", () => {
    const sdk = fakeSdk(false);
    const o = createObservability(sdk);
    o.captureError(new Error("x"));
    o.identify("staff-1");
    o.reset();
    o.track("x");
    o.log.error("x");
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.setUser).not.toHaveBeenCalled();
    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();
    expect(sdk.logger.error).not.toHaveBeenCalled();
  });

  test("a failing SDK never throws into the app", () => {
    const explode = () => {
      throw new Error("sdk down");
    };
    const o = createObservability({
      isEnabled: () => true,
      captureException: explode,
      setUser: explode,
      addBreadcrumb: explode,
      logger: { info: explode, warn: explode, error: explode },
    });
    expect(() => o.captureError(new Error("x"))).not.toThrow();
    expect(() => o.identify("staff-1")).not.toThrow();
    expect(() => o.reset()).not.toThrow();
    expect(() => o.track("x")).not.toThrow();
    expect(() => o.log.error("x")).not.toThrow();

    const broken = createObservability({ ...fakeSdk(), isEnabled: explode });
    expect(() => broken.captureError(new Error("x"))).not.toThrow();
  });
});

describe("logErrorOnce", () => {
  test("logs an error object once, however many places report it", () => {
    const write = mock((..._args: unknown[]) => {});
    const error = new Error("render failed");
    logErrorOnce(error, write);
    logErrorOnce(error, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(error);
    logErrorOnce(new Error("another"), write);
    expect(write).toHaveBeenCalledTimes(2);
  });

  test("non-object errors are always logged", () => {
    const write = mock((..._args: unknown[]) => {});
    logErrorOnce("boom", write);
    logErrorOnce("boom", write);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
