"use client";

import { useEffect, useState } from "react";

import { useInboxRealtimeConnected } from "@/features/chat/hooks/inbox-realtime";
import { unreadPollMs } from "@/features/chat/utils/polling-rules";
import { startVisibleInterval } from "@/utils/visible-interval";

const USER_UNREAD_URL = "/api/chat/unread";
const ADMIN_UNREAD_URL = "/api/chat/unread?as=admin";
// Dispatched on window by live inbox events so badges refetch right away.
export const UNREAD_REFRESH_EVENT = "chat:unread-refresh";

// Badge: polls the cheap unread endpoint (15 s, or a 60 s safety net while the
// admin inbox has a live Ably connection; never while the tab is hidden, with
// one fetch when it comes back), refreshes on focus and on
// UNREAD_REFRESH_EVENT. Trainee: the tab-bar badge; `paused` (on /messages
// itself) stops all requests, the thread is live there. Admin: the total from
// `?as=admin`; `initialCount` is the server-rendered value shown until the
// first poll lands.
export const useChatUnread = (
  paused: boolean,
  role: "user" | "admin" = "user",
  initialCount = 0,
) => {
  const [count, setCount] = useState(initialCount);
  const url = role === "admin" ? ADMIN_UNREAD_URL : USER_UNREAD_URL;
  const realtimeConnected = useInboxRealtimeConnected();
  const pollMs = unreadPollMs(role === "admin" && realtimeConnected);

  useEffect(() => {
    if (paused) {
      return;
    }
    let cancelled = false;
    // Per effect run: a StrictMode remount must not inherit a stale flag.
    let inFlight = false;

    const refresh = async () => {
      if (inFlight || document.visibilityState === "hidden") {
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(url, { cache: "no-store" });

        if (response.ok && !cancelled) {
          const data: { count?: unknown } = await response.json();

          setCount(typeof data.count === "number" ? data.count : 0);
        }
      } catch {
        // Offline or server hiccup: keep the last count.
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    // Ticks only while visible; coming back to the front refreshes at once.
    const stopTimer = startVisibleInterval(() => void refresh(), pollMs);
    const onVisible = () => void refresh();

    window.addEventListener("focus", onVisible);
    window.addEventListener(UNREAD_REFRESH_EVENT, onVisible);
    return () => {
      cancelled = true;
      stopTimer();
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(UNREAD_REFRESH_EVENT, onVisible);
    };
  }, [paused, url, pollMs]);

  return paused ? 0 : count;
};
