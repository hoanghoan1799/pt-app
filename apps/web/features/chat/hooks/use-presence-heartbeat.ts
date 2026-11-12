"use client";

import { useEffect } from "react";

import { PRESENCE_HEARTBEAT_MS } from "@/features/chat/utils/presence";
import {
  heartbeatUrl,
  shouldRunPresence,
} from "@/features/chat/utils/presence-status";
import { startVisibleInterval } from "@/utils/visible-interval";

// Tells the server this person has the app open (KAN-129): once on mount, then
// every minute, and again when the tab comes back. Nothing is sent while the
// page is hidden. Errors are ignored: the next beat retries.
export const usePresenceHeartbeat = (role: "user" | "admin") => {
  useEffect(() => {
    const url = heartbeatUrl(role);
    const beat = () => {
      if (!shouldRunPresence(document.visibilityState)) {
        return;
      }
      fetch(url, { method: "POST", cache: "no-store", keepalive: true }).catch(
        () => undefined,
      );
    };

    beat();
    // The timer stops while hidden and beats once when the tab returns.
    return startVisibleInterval(beat, PRESENCE_HEARTBEAT_MS);
  }, [role]);
};
