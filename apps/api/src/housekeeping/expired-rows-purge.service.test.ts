import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Clock } from "../common/clock.js";
import { ExpiredRowsPurge } from "./expired-rows-purge.service.js";

const build = (
  nodeEnv: "development" | "test" | "production",
  minutes: number,
) => {
  const query = vi.fn().mockResolvedValue([{ n: 0 }]);
  const service = new ExpiredRowsPurge(
    { query } as never,
    { now: () => new Date("2030-01-01T00:00:00Z") } as Clock,
    { NODE_ENV: nodeEnv, PURGE_INTERVAL_MINUTES: minutes },
  );

  return { service, query };
};

describe("ExpiredRowsPurge timer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not start in the test environment or when the interval is 0", () => {
    vi.useFakeTimers();
    for (const [env, minutes] of [
      ["test", 60],
      ["production", 0],
    ] as const) {
      const { service } = build(env, minutes);

      service.onModuleInit();
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("purges on the interval and stops on destroy", async () => {
    vi.useFakeTimers();
    const { service, query } = build("production", 30);

    service.onModuleInit();
    expect(vi.getTimerCount()).toBe(2); // startup delay + interval
    await vi.advanceTimersByTimeAsync(59_000);
    expect(query).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(query).toHaveBeenCalledTimes(3); // first purge after 60 s: two login_attempts statements, one rate_limits
    await vi.advanceTimersByTimeAsync(28 * 60_000);
    expect(query).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(query).toHaveBeenCalledTimes(6); // then on the 30 min interval
    service.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the pending startup purge on destroy", async () => {
    vi.useFakeTimers();
    const { service, query } = build("production", 30);

    service.onModuleInit();
    service.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(query).not.toHaveBeenCalled();
  });

  it("survives a failing purge and runs again later", async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { service, query } = build("production", 1);

    query.mockRejectedValueOnce(new Error("db down"));
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(query.mock.calls.length).toBeGreaterThan(1);
    service.onModuleDestroy();
  });
});
