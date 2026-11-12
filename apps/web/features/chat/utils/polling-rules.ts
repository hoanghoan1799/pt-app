// Poll schedule for the unread badge. Pure, so the rules are testable.

// Nothing live tells the badge about new messages: poll fairly often.
export const UNREAD_POLL_MS = 15_000;
// An socket inbox connection already pushes every change (and fires the
// refresh event), so the poll is only a safety net for a missed event.
export const UNREAD_SAFETY_POLL_MS = 60_000;

export const unreadPollMs = (realtimeConnected: boolean) =>
  realtimeConnected ? UNREAD_SAFETY_POLL_MS : UNREAD_POLL_MS;
