export interface RateLimitRecord {
  count: number;
  windowStartedAt: Date;
}

// Fixed window: a call outside the current window (or the first ever) starts
// a new one at 1; otherwise it counts one more. A window that started exactly
// windowMs ago is already over.
export const nextWindowState = (
  record: RateLimitRecord | null | undefined,
  now: Date,
  windowMs: number,
): RateLimitRecord => {
  if (!record || now.getTime() - record.windowStartedAt.getTime() >= windowMs) {
    return { count: 1, windowStartedAt: now };
  }
  return { count: record.count + 1, windowStartedAt: record.windowStartedAt };
};

export const isOverLimit = (count: number, max: number) => count > max;
