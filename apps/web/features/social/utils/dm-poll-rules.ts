import { DM_POLL_MS } from "@/features/social/constants/dm";

// The DM thread poll slows down while the chat is quiet: after a few polls
// with nothing new the delay grows one step at a time up to DM_POLL_MAX_MS,
// and goes back to DM_POLL_MS on any activity (new message, delete, read mark,
// send, socket event, tab back in front).
export const DM_POLL_MAX_MS = 20_000;
// Empty polls tolerated at the base interval before backing off.
export const DM_POLL_FREE_EMPTY = 3;

export const dmPollDelayMs = (emptyPolls: number) => {
  const extraSteps = Math.max(0, emptyPolls - DM_POLL_FREE_EMPTY);

  return Math.min(DM_POLL_MAX_MS, DM_POLL_MS * (1 + extraSteps));
};

// Did a poll bring anything the screen did not have?
export const dmPollHadActivity = (
  messageCount: number,
  deletedCount: number,
  otherReadChanged: boolean,
) => messageCount > 0 || deletedCount > 0 || otherReadChanged;

// Count of consecutive empty polls after one more poll.
export const nextEmptyPolls = (current: number, hadActivity: boolean) =>
  hadActivity ? 0 : current + 1;
