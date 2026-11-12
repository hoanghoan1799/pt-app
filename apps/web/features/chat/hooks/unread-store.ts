"use client";

import { useCallback, useSyncExternalStore } from "react";

import { startVisibleInterval } from "@/utils/visible-interval";

// Dispatched on window by live inbox events so badges refetch right away.
export const UNREAD_REFRESH_EVENT = "chat:unread-refresh";

// One poller per URL for the whole tab, shared by the tab-bar badge, the admin
// inbox badge and the chat bubbles. Ref-counted: it starts with the first
// subscriber and stops with the last. Cadence rules as before: a timer that
// only ticks while the tab is visible (one fetch when it comes back), plus a
// refetch on focus and on UNREAD_REFRESH_EVENT.
interface Entry {
  data: unknown;
  subscribers: Map<object, { listener: () => void; pollMs: number }>;
  inFlight: boolean;
  stopTimer: (() => void) | null;
  timerMs: number;
  detach: () => void;
}

const entries = new Map<string, Entry>();

const emit = (entry: Entry) => {
  entry.subscribers.forEach(({ listener }) => listener());
};

const refresh = async (url: string, entry: Entry) => {
  if (entry.inFlight || document.visibilityState === "hidden") {
    return;
  }
  entry.inFlight = true;
  try {
    const response = await fetch(url, { cache: "no-store" });

    if (response.ok && entries.get(url) === entry) {
      entry.data = await response.json();
      emit(entry);
    }
  } catch {
    // Offline or server hiccup: keep the last payload.
  } finally {
    entry.inFlight = false;
  }
};

// The fastest cadence any subscriber asks for.
const restartTimer = (url: string, entry: Entry) => {
  const wanted = Math.min(
    ...Array.from(entry.subscribers.values(), (item) => item.pollMs),
  );

  if (entry.stopTimer && entry.timerMs === wanted) {
    return;
  }
  entry.stopTimer?.();
  entry.timerMs = wanted;
  entry.stopTimer = startVisibleInterval(
    () => void refresh(url, entry),
    wanted,
  );
};

const createEntry = (url: string): Entry => {
  const onNudge = () => {
    const entry = entries.get(url);

    if (entry) {
      void refresh(url, entry);
    }
  };
  const entry: Entry = {
    data: null,
    subscribers: new Map(),
    inFlight: false,
    stopTimer: null,
    timerMs: 0,
    detach: () => {
      window.removeEventListener("focus", onNudge);
      window.removeEventListener(UNREAD_REFRESH_EVENT, onNudge);
    },
  };

  window.addEventListener("focus", onNudge);
  window.addEventListener(UNREAD_REFRESH_EVENT, onNudge);
  return entry;
};

export const subscribeUnread = (
  url: string,
  pollMs: number,
  listener: () => void,
) => {
  const token = {};
  let entry = entries.get(url);
  const isFirst = !entry;

  if (!entry) {
    entry = createEntry(url);
    entries.set(url, entry);
  }
  entry.subscribers.set(token, { listener, pollMs });
  restartTimer(url, entry);
  if (isFirst) {
    void refresh(url, entry);
  }
  const current = entry;

  return () => {
    current.subscribers.delete(token);
    if (current.subscribers.size === 0) {
      current.stopTimer?.();
      current.detach();
      entries.delete(url);
      return;
    }
    restartTimer(url, current);
  };
};

export const getUnreadSnapshot = (url: string) =>
  entries.get(url)?.data ?? null;

// Latest raw payload of `url` (null until the first poll lands), or null and
// no polling at all while `enabled` is false.
export const useUnreadPayload = (
  url: string,
  enabled: boolean,
  pollMs: number,
): unknown => {
  const subscribe = useCallback(
    (listener: () => void) =>
      enabled ? subscribeUnread(url, pollMs, listener) : () => undefined,
    [url, enabled, pollMs],
  );

  return useSyncExternalStore(
    subscribe,
    () => (enabled ? getUnreadSnapshot(url) : null),
    () => null,
  );
};
