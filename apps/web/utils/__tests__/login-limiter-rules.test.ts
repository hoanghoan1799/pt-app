import { describe, expect, it } from "vitest";

import {
  isRecordLocked,
  type LoginAttemptRecord,
  nextFailureState,
} from "@/utils/login-limiter-rules";

const MIN = 60 * 1000;
const T0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

const failTimes = (times: number[]) => {
  let record: LoginAttemptRecord | null = null;

  for (const minute of times) {
    record = nextFailureState(record, at(minute));
  }
  return record as LoginAttemptRecord;
};

describe("login limiter rules", () => {
  it("does not lock after 4 failures", () => {
    const record = failTimes([0, 1, 2, 3]);

    expect(record.failedCount).toBe(4);
    expect(isRecordLocked(record, at(3))).toBe(false);
  });

  it("locks for 15 minutes on the 5th failure", () => {
    const record = failTimes([0, 1, 2, 3, 4]);

    expect(record.lockedUntil).toEqual(at(19));
    expect(isRecordLocked(record, at(5))).toBe(true);
    expect(isRecordLocked(record, at(18))).toBe(true);
    expect(isRecordLocked(record, at(19))).toBe(false);
  });

  it("restarts the window when failures are spread over 15+ minutes", () => {
    const record = failTimes([0, 5, 10, 14, 16]);

    expect(record.failedCount).toBe(1);
    expect(record.windowStartedAt).toEqual(at(16));
    expect(isRecordLocked(record, at(16))).toBe(false);
  });

  it("starts a new window after the lock expired", () => {
    const locked = failTimes([0, 1, 2, 3, 4]);
    const record = nextFailureState(locked, at(20));

    expect(record).toEqual({
      failedCount: 1,
      windowStartedAt: at(20),
      lockedUntil: null,
    });
  });

  it("treats a missing record as not locked", () => {
    expect(isRecordLocked(null, T0)).toBe(false);
  });
});
