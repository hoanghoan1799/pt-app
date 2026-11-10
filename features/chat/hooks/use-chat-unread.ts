"use client";

import { useMemo } from "react";

import { useInboxRealtimeConnected } from "@/features/chat/hooks/inbox-realtime";
import {
  UNREAD_REFRESH_EVENT,
  useUnreadPayload,
} from "@/features/chat/hooks/unread-store";
import { unreadPollMs } from "@/features/chat/utils/polling-rules";

export const USER_UNREAD_URL = "/api/chat/unread";
export const ADMIN_UNREAD_URL = "/api/chat/unread?as=admin";
export { UNREAD_REFRESH_EVENT };

// Badge: reads the shared unread poller (15 s, or a 60 s safety net while the
// admin inbox has a live Ably connection; never while the tab is hidden, with
// one fetch when it comes back), refreshed on focus and on
// UNREAD_REFRESH_EVENT. Trainee: the tab-bar badge; `paused` (on /messages
// itself) stops this subscriber, the thread is live there. Admin: the total
// from `?as=admin`; `initialCount` is the server-rendered value shown until
// the first poll lands.
export const useChatUnread = (
  paused: boolean,
  role: "user" | "admin" = "user",
  initialCount = 0,
) => {
  const realtimeConnected = useInboxRealtimeConnected();
  const pollMs = unreadPollMs(role === "admin" && realtimeConnected);
  const payload = useUnreadPayload(
    role === "admin" ? ADMIN_UNREAD_URL : USER_UNREAD_URL,
    !paused,
    pollMs,
  );
  const count = useMemo(() => {
    const value = (payload as { count?: unknown } | null)?.count;

    return typeof value === "number" ? value : initialCount;
  }, [payload, initialCount]);

  return paused ? 0 : count;
};
