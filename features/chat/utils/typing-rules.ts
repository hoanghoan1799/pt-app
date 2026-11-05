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

export type TypingRole = "user" | "admin";

export interface TypingEventData {
  role: TypingRole;
  senderKey: string;
}

// Ably payloads are untrusted input: anything that is not the exact shape of
// `typingEvent` is dropped.
export const parseTypingEvent = (data: unknown): TypingEventData | null => {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { role, senderKey } = data as Record<string, unknown>;

  if ((role !== "user" && role !== "admin") || typeof senderKey !== "string") {
    return null;
  }
  return { role, senderKey };
};

// Only the other side's typing shows. Our own echo (same Ably client id, e.g.
// a second tab of the same person) and events from our own role are ignored.
export const isPeerTyping = (
  event: TypingEventData,
  ownRole: TypingRole,
  ownClientId: string | null,
) =>
  event.role !== ownRole &&
  (ownClientId === null || event.senderKey !== ownClientId);
