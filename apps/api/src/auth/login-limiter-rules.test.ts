import { describe, expect, it } from "vitest";

import {
  isRecordLocked,
  type LoginAttemptRecord,
  nextFailureState,
} from "./login-limiter-rules.js";

// Port of apps/web/utils/__tests__/login-limiter-rules.test.ts.
const MINUTE = 60 * 1000;
const t0 = new Date("2026-11-12T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * MINUTE);

const fail = (record: LoginAttemptRecord | null, when: Date) =>
  nextFailureState(record, when);

describe("nextFailureState", () => {
  it("starts a window on the first failure", () => {
    expect(fail(null, t0)).toEqual({
      failedCount: 1,
      windowStartedAt: t0,
      lockedUntil: null,
    });
  });

  it("locks for 15 minutes on the 5th failure inside the window", () => {
    let record: LoginAttemptRecord | null = null;

    for (let i = 0; i < 4; i++) {
      record = fail(record, at(i));
      expect(record.lockedUntil).toBeNull();
    }
    record = fail(record, at(4));
    expect(record.failedCount).toBe(5);
    expect(record.lockedUntil).toEqual(at(19));
    expect(isRecordLocked(record, at(18))).toBe(true);
    expect(isRecordLocked(record, at(19))).toBe(false);
  });

  it("starts over when the window is 15 minutes old", () => {
    const record = { failedCount: 4, windowStartedAt: t0, lockedUntil: null };

    expect(fail(record, at(15))).toEqual({
      failedCount: 1,
      windowStartedAt: at(15),
      lockedUntil: null,
    });
    expect(fail(record, at(14)).failedCount).toBe(5);
  });

  it("starts over after an expired lock", () => {
    const locked = {
      failedCount: 5,
      windowStartedAt: t0,
      lockedUntil: at(15),
    };

    expect(fail(locked, at(16))).toEqual({
      failedCount: 1,
      windowStartedAt: at(16),
      lockedUntil: null,
    });
  });
});

describe("isRecordLocked", () => {
  it("is false without a record or a lock", () => {
    expect(isRecordLocked(null, t0)).toBe(false);
    expect(
      isRecordLocked(
        { failedCount: 2, windowStartedAt: t0, lockedUntil: null },
        t0,
      ),
    ).toBe(false);
  });
});
