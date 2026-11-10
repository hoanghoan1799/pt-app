"use client";

import { useCallback, useSyncExternalStore } from "react";

import { STORAGE_PREFIX } from "@/features/chat-bubbles/constants";
import type { BubbleRole, BubbleState } from "@/features/chat-bubbles/types";
import {
  type BubbleAction,
  bubbleReducer,
  EMPTY_BUBBLE_STATE,
  fromPersisted,
  parseBubbles,
  serializeBubbles,
} from "@/features/chat-bubbles/utils/bubble-store";

// One external store per role, shared by the host, the inbox rows and the
// header button. State lives in localStorage (keys, anchor, muted); the open
// panel is per tab and not remembered.
interface Store {
  state: BubbleState;
  written: string;
  listeners: Set<() => void>;
}

const stores = new Map<BubbleRole, Store>();

const storageKey = (role: BubbleRole) => `${STORAGE_PREFIX}${role}`;

const readStorage = (role: BubbleRole) => {
  try {
    return window.localStorage.getItem(storageKey(role));
  } catch {
    return null;
  }
};

const writeStorage = (role: BubbleRole, value: string) => {
  try {
    window.localStorage.setItem(storageKey(role), value);
  } catch {
    // Storage blocked or full: bubbles just do not survive a reload.
  }
};

const getStore = (role: BubbleRole): Store => {
  const existing = stores.get(role);

  if (existing) {
    return existing;
  }
  const state = fromPersisted(parseBubbles(role, readStorage(role)));
  const store: Store = {
    state,
    written: serializeBubbles(state),
    listeners: new Set(),
  };

  stores.set(role, store);
  // Another tab changed the bubbles: take over keys, anchor and muted.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== storageKey(role)) {
      return;
    }
    const persisted = parseBubbles(role, readStorage(role));

    store.written = JSON.stringify(persisted);
    store.state = bubbleReducer(store.state, { type: "sync", persisted });
    store.listeners.forEach((listener) => listener());
  });
  return store;
};

export const dispatchBubble = (role: BubbleRole, action: BubbleAction) => {
  const store = getStore(role);
  const next = bubbleReducer(store.state, action);

  if (next === store.state) {
    return;
  }
  store.state = next;
  const serialized = serializeBubbles(next);

  if (serialized !== store.written) {
    store.written = serialized;
    writeStorage(role, serialized);
  }
  store.listeners.forEach((listener) => listener());
};

export const useBubbleStore = (role: BubbleRole) => {
  const subscribe = useCallback(
    (listener: () => void) => {
      const store = getStore(role);

      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [role],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => getStore(role).state,
    () => EMPTY_BUBBLE_STATE,
  );
  const dispatch = useCallback(
    (action: BubbleAction) => dispatchBubble(role, action),
    [role],
  );

  return [state, dispatch] as const;
};
