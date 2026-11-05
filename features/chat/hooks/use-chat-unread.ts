"use client";

import { useEffect, useState } from "react";

const USER_UNREAD_URL = "/api/chat/unread";
const ADMIN_UNREAD_URL = "/api/chat/unread?as=admin";
const UNREAD_POLL_MS = 15_000;
// Dispatched on window by live inbox events so badges refetch right away.
export const UNREAD_REFRESH_EVENT = "chat:unread-refresh";

// Badge: polls the cheap unread endpoint, refreshes on focus and on
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
    const timer = setInterval(() => void refresh(), UNREAD_POLL_MS);
    const onVisible = () => void refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(UNREAD_REFRESH_EVENT, onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(UNREAD_REFRESH_EVENT, onVisible);
    };
  }, [paused, url]);

  return paused ? 0 : count;
};
