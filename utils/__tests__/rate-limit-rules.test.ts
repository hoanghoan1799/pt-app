import { describe, expect, it } from "vitest";

import {
  isOverLimit,
  nextWindowState,
  type RateLimitRecord,
} from "@/utils/rate-limit-rules";

const WINDOW = 60 * 1000;
const T0 = new Date("2026-01-01T00:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const consume = (times: number[]) => {
  let record: RateLimitRecord | null = null;

  for (const ms of times) {
    record = nextWindowState(record, at(ms), WINDOW);
  }
  return record as RateLimitRecord;
};

describe("rate limit rules", () => {
  it("starts a window at 1", () => {
    expect(nextWindowState(null, T0, WINDOW)).toEqual({
      count: 1,
      windowStartedAt: T0,
    });
  });

  it("allows 20 in a minute and rejects the 21st", () => {
    const twenty = consume(Array.from({ length: 20 }, (_, i) => i * 1000));
    const twentyFirst = nextWindowState(twenty, at(25_000), WINDOW);

    expect(twenty.count).toBe(20);
    expect(isOverLimit(twenty.count, 20)).toBe(false);
    expect(twentyFirst.count).toBe(21);
    expect(isOverLimit(twentyFirst.count, 20)).toBe(true);
  });

  it("resets to 1 in the next window", () => {
    const full = consume(Array.from({ length: 21 }, (_, i) => i * 1000));
    const next = nextWindowState(full, at(WINDOW + 5), WINDOW);

    expect(next).toEqual({ count: 1, windowStartedAt: at(WINDOW + 5) });
  });

  it("is still the same window 1 ms before windowMs", () => {
    const record = nextWindowState(consume([0]), at(WINDOW - 1), WINDOW);

    expect(record.count).toBe(2);
    expect(record.windowStartedAt).toEqual(T0);
  });

  it("starts a new window at exactly windowMs", () => {
    const record = nextWindowState(consume([0]), at(WINDOW), WINDOW);

    expect(record).toEqual({ count: 1, windowStartedAt: at(WINDOW) });
  });
});
