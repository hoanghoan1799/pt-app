"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  conversationIdOf,
  sendSocketTyping,
  subscribeChatSocket,
} from "@/features/chat/hooks/chat-socket";
import {
  pollIntervalFor,
  type RealtimeState,
} from "@/features/chat/utils/chat-thread-rules";
import {
  isPeerTyping,
  parseTypingEvent,
  shouldSendTyping,
  TYPING_EXPIRY_MS,
} from "@/features/chat/utils/typing-rules";

interface UseChatTransportOptions {
  role: "user" | "admin";
  userId: number;
  conversationId: number | null;
  chatEnabled: boolean;
  // Asks the owner to fetch what is new. Called on every realtime event, on
  // every poll tick, on (re)connect and when the tab becomes visible.
  onSync: () => void;
}

// Events that mean "something in this conversation changed": fetch.
const SYNC_EVENTS = new Set([
  "message",
  "message-update",
  "read",
  "profile-update",
  "chat-status",
]);

// The ChatTransport seam: realtime over Socket.IO when the API hands out a
// ticket, plain polling otherwise. Socket events carry ids only (never text), so
// any of them just triggers a fetch (which also fills gaps). The database stays
// the source of truth.
export const useChatTransport = ({
  role,
  conversationId,
  chatEnabled,
  onSync,
}: UseChatTransportOptions) => {
  const [state, setState] = useState<RealtimeState>("connecting");
  const [isHidden, setIsHidden] = useState(false);
  const [isPeerTypingNow, setIsPeerTypingNow] = useState(false);
  const syncRef = useRef(onSync);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAt = useRef<number | null>(null);

  const clearPeerTyping = useCallback(() => {
    if (typingTimer.current !== null) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    setIsPeerTypingNow(false);
  }, []);

  useEffect(() => {
    syncRef.current = onSync;
  });

  // A locked trainee polls only. An admin always connects: chat-status events
  // tell them when the chat is unlocked.
  const canConnect =
    conversationId !== null && (role === "admin" || chatEnabled);

  useEffect(() => {
    if (!canConnect || conversationId === null) {
      return;
    }
    let cancelled = false;
    // Typing events are not a reason to fetch; they only drive the indicator,
    // which expires on its own if the peer goes quiet.
    const showTyping = (data: unknown) => {
      const event = parseTypingEvent(data);

      if (!event || !isPeerTyping(event, role, null)) {
        return;
      }
      if (typingTimer.current !== null) {
        clearTimeout(typingTimer.current);
      }
      setIsPeerTypingNow(true);
      typingTimer.current = setTimeout(() => {
        typingTimer.current = null;
        setIsPeerTypingNow(false);
      }, TYPING_EXPIRY_MS);
    };
    const unsubscribe = subscribeChatSocket(role, {
      conversationId,
      onState: (next) => {
        if (!cancelled) {
          setState(next);
        }
      },
      // One gap-fill after every (re)connect.
      onConnect: () => syncRef.current(),
      onEvent: (name, data) => {
        const target = conversationIdOf(data);

        if (cancelled || (target !== null && target !== conversationId)) {
          return;
        }
        if (name === "typing") {
          showTyping(data);
        } else if (SYNC_EVENTS.has(name)) {
          syncRef.current();
        }
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
      clearPeerTyping();
    };
  }, [canConnect, conversationId, role, clearPeerTyping]);

  // Throttled, fire and forget, over the socket. Polling-only mode (no live
  // connection) sends nothing, so there is no request and no error to handle.
  const sendTyping = useCallback(() => {
    const now = Date.now();

    if (
      state !== "connected" ||
      conversationId === null ||
      !shouldSendTyping(lastTypingSentAt.current, now)
    ) {
      return;
    }
    lastTypingSentAt.current = now;
    sendSocketTyping(role, conversationId);
  }, [conversationId, role, state]);

  // Pause while the tab is hidden; fetch once on return.
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";

      setIsHidden(hidden);
      if (!hidden) {
        syncRef.current();
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Without a connection scope (locked, no conversation) there is nothing to
  // connect to, whatever the last connection state was.
  const effectiveState = canConnect ? state : "unavailable";
  const interval = pollIntervalFor(effectiveState, isHidden);

  useEffect(() => {
    if (interval === null) {
      return;
    }
    const timer = setInterval(() => syncRef.current(), interval);

    return () => clearInterval(timer);
  }, [interval]);

  return {
    realtimeState: effectiveState,
    isPeerTyping: canConnect && isPeerTypingNow,
    clearPeerTyping,
    sendTyping,
  };
};
