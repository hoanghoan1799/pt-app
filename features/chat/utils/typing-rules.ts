// Pure rules for the "đang nhập" indicator. Typing is best effort: nothing is
// stored, so a lost event only means the indicator does not show.

// A sender publishes at most one typing event per interval.
export const TYPING_THROTTLE_MS = 2500;
// The indicator disappears this long after the last typing event arrived. It
// must be longer than the throttle so continuous typing never flickers.
export const TYPING_EXPIRY_MS = 5000;

export const shouldSendTyping = (lastSentAt: number | null, now: number) =>
  lastSentAt === null ||
  now < lastSentAt || // clock moved back: do not stay silent forever
  now - lastSentAt >= TYPING_THROTTLE_MS;

export const isTypingActive = (lastReceivedAt: number | null, now: number) =>
  lastReceivedAt !== null &&
  now >= lastReceivedAt &&
  now - lastReceivedAt < TYPING_EXPIRY_MS;
