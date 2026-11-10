"use client";

import { useSyncExternalStore } from "react";

import { isEmbeddedNow } from "@/features/chat-bubbles/utils/embed";

const noopSubscribe = () => () => undefined;

// True inside the bubble panel's iframe. False on the server and while
// hydrating, so the markup matches; the real value follows right after.
export const useIsEmbedded = () =>
  useSyncExternalStore(noopSubscribe, isEmbeddedNow, () => false);
