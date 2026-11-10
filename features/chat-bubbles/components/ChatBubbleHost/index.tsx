"use client";

import { useSyncExternalStore } from "react";

import { BubbleHostInner } from "@/features/chat-bubbles/components/BubbleHostInner";
import type { BubbleRole } from "@/features/chat-bubbles/types";
import { isEmbeddedNow } from "@/features/chat-bubbles/utils/embed";

const noopSubscribe = () => () => undefined;

// Floating chat bubbles for a signed-in role; mounted in the protected
// layouts so they survive in-app navigation. Nothing inside the panel's own
// iframe (no second host, no extra poll) and nothing during hydration.
export const ChatBubbleHost = ({ role }: { role: BubbleRole }) => {
  const isActive = useSyncExternalStore(
    noopSubscribe,
    () => !isEmbeddedNow(),
    () => false,
  );

  return isActive ? <BubbleHostInner role={role} /> : null;
};
