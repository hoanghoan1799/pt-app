import {
  LOGIN_LOCK_MS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
} from "@/constants/login-limit";

export interface LoginAttemptRecord {
  failedCount: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
}

export const isRecordLocked = (
  record: LoginAttemptRecord | null | undefined,
  now: Date,
) =>
  Boolean(record?.lockedUntil && record.lockedUntil.getTime() > now.getTime());

// State after one more failed login: a failure outside the window (or after
// an expired lock) starts a new window; the 5th inside it locks the key.
export const nextFailureState = (
  record: LoginAttemptRecord | null | undefined,
  now: Date,
): LoginAttemptRecord => {
  const windowExpired =
    !record ||
    now.getTime() - record.windowStartedAt.getTime() >= LOGIN_WINDOW_MS;
  const lockExpired =
    Boolean(record?.lockedUntil) && !isRecordLocked(record, now);

  if (windowExpired || lockExpired) {
    return { failedCount: 1, windowStartedAt: now, lockedUntil: null };
  }

  const failedCount = record.failedCount + 1;

  return {
    failedCount,
    windowStartedAt: record.windowStartedAt,
    lockedUntil:
      failedCount >= LOGIN_MAX_FAILURES
        ? new Date(now.getTime() + LOGIN_LOCK_MS)
        : record.lockedUntil,
  };
};
