"use client";

import { useEffect, useState } from "react";

const UNREAD_URL = "/api/chat/unread";
const UNREAD_POLL_MS = 15_000;

// Tab-bar badge: polls the cheap unread endpoint and refreshes on focus.
// `paused` (on /messages itself) stops all requests; the thread is live there.
export const useChatUnread = (paused: boolean) => {
  const [count, setCount] = useState(0);

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
        const response = await fetch(UNREAD_URL, { cache: "no-store" });

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
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [paused]);

  return paused ? 0 : count;
};
