"use client";

import { useSyncExternalStore } from "react";

// Whether the admin inbox already has a live Ably connection in this tab.
// InboxLiveRefresh owns that connection and publishes its state here, so the
// unread badge can slow its poll without opening a second connection.
let connected = false;
const listeners = new Set<() => void>();

export const setInboxRealtimeConnected = (value: boolean) => {
  if (connected === value) {
    return;
  }
  connected = value;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useInboxRealtimeConnected = () =>
  useSyncExternalStore(
    subscribe,
    () => connected,
    () => false,
  );
