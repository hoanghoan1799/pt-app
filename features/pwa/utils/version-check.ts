export const VERSION_CHECK_INTERVAL_MS = 60_000;

const DEV_BUILD = "dev";

// True only for a real, different build id; "dev" on either side never counts.
export const isNewerBuild = (current: string, latest: unknown): boolean =>
  typeof latest === "string" &&
  latest !== "" &&
  latest !== current &&
  latest !== DEV_BUILD &&
  current !== DEV_BUILD;

// Throttle: check when never checked, or at least `minIntervalMs` has passed.
export const shouldCheck = (
  lastCheckedAt: number | null,
  now: number,
  minIntervalMs: number,
): boolean => lastCheckedAt === null || now - lastCheckedAt >= minIntervalMs;
