const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Chat sends (KAN-98): fixed windows per sender.
export const CHAT_RATE_LIMITS = {
  userPerMinute: { max: 20, windowMs: MINUTE_MS },
  userPerDay: { max: 300, windowMs: DAY_MS },
  adminPerMinute: { max: 60, windowMs: MINUTE_MS },
} as const;
