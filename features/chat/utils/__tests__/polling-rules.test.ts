import { describe, expect, it } from "vitest";

import {
  UNREAD_POLL_MS,
  UNREAD_SAFETY_POLL_MS,
  unreadPollMs,
} from "@/features/chat/utils/polling-rules";

describe("unreadPollMs", () => {
  it("polls every 15 s without a live connection", () => {
    expect(unreadPollMs(false)).toBe(15_000);
    expect(unreadPollMs(false)).toBe(UNREAD_POLL_MS);
  });

  it("falls back to a 60 s safety net while realtime is connected", () => {
    expect(unreadPollMs(true)).toBe(60_000);
    expect(unreadPollMs(true)).toBe(UNREAD_SAFETY_POLL_MS);
  });
});
