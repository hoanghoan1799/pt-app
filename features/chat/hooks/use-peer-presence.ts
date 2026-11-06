"use client";

import { useEffect, useState } from "react";

import { PRESENCE_HEARTBEAT_MS } from "@/features/chat/utils/presence";
import {
  clockSkewMs,
  mergeLastSeen,
  peerPresenceUrl,
  type PresenceView,
  presenceView,
  serverClockNow,
  shouldRunPresence,
} from "@/features/chat/utils/presence-status";

const LABEL_TICK_MS = 30_000;

interface Options {
  role: "user" | "admin";
  userId: number;
  // The snapshot's reading, then whatever the message polls bring.
  fromThread: string | null | undefined;
}

// The other side's status for the thread header. Seeded from the thread,
// kept fresh by the message polls (via `fromThread`) and a 60 s peer fetch
// while visible (the message poll's 204 carries no presence). The label is
// recomputed every 30 s so "N phút trước" ticks.
export const usePeerPresence = ({
  role,
  userId,
  fromThread,
}: Options): PresenceView | null => {
  const [fetched, setFetched] = useState<Date | null>(null);
  // Device clock minus server clock, measured from the peer endpoint. Null
  // until the first answer (or its failure): without it a device clock that
  // runs behind would show an idle peer as online.
  const [skewMs, setSkewMs] = useState<number | null>(null);
  // Null until mounted: the server render and first client render agree.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, LABEL_TICK_MS);

    tick();
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const url = peerPresenceUrl(role, userId);
    let cancelled = false;
    const refresh = async () => {
      if (!shouldRunPresence(document.visibilityState)) {
        return;
      }
      try {
        const response = await fetch(url, { cache: "no-store" });

        if (!response.ok || cancelled) {
          return;
        }
        const data: unknown = await response.json();
        const body = data as {
          peerLastSeenAt?: unknown;
          serverNow?: unknown;
        } | null;
        const value = body?.peerLastSeenAt;

        if (typeof body?.serverNow === "string") {
          setSkewMs(clockSkewMs(body.serverNow, Date.now()));
        }
        if (typeof value === "string") {
          setFetched((current) => mergeLastSeen(current, value));
          setNow(new Date());
        }
      } catch {
        // Next tick retries.
      } finally {
        // A failed measurement falls back to the device clock.
        setSkewMs((current) => current ?? 0);
      }
    };
    const onVisibility = () => void refresh();
    const timer = setInterval(() => void refresh(), PRESENCE_HEARTBEAT_MS);

    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [role, userId]);

  if (now === null || skewMs === null) {
    return null;
  }
  const lastSeenAt = mergeLastSeen(fetched, fromThread ?? undefined);

  return presenceView(lastSeenAt, serverClockNow(now.getTime(), skewMs));
};
