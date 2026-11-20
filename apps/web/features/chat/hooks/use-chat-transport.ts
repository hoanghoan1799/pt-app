"use client";

import { REALTIME_EVENTS } from "@pt/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  conversationIdOf,
  groupIdOf,
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
  // A group chat: its `group:*` events on the same socket, no typing. The API
  // puts the socket in the rooms of its groups at the handshake (and moves it
  // when members change), so nothing is subscribed here. The coach chat
  // leaves it out.
  groupId?: number | null;
  chatEnabled: boolean;
  // Asks the owner to fetch what is new. Called on every realtime event, on
  // every poll tick, on (re)connect and when the tab becomes visible.
  onSync: () => void;
}

// Group events (ids only): new message, change, read cursor, members/name.
const GROUP_SYNC_EVENTS: ReadonlySet<string> = new Set([
  REALTIME_EVENTS.groupMessage,
  REALTIME_EVENTS.groupMessageUpdate,
  REALTIME_EVENTS.groupRead,
  REALTIME_EVENTS.groupMembers,
]);

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
  groupId = null,
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
  // tell them when the chat is unlocked. A group member always connects (a
  // trainee whose chat is off still reads the group live).
  const canConnect =
    groupId !== null ||
    (conversationId !== null && (role === "admin" || chatEnabled));

  useEffect(() => {
    if (!canConnect || groupId === null) {
      return;
    }
    let cancelled = false;
    const unsubscribe = subscribeChatSocket(role, {
      onState: (next) => {
        if (!cancelled) {
          setState(next);
        }
      },
      onConnect: () => syncRef.current(),
      onEvent: (name, data) => {
        if (
          !cancelled &&
          GROUP_SYNC_EVENTS.has(name) &&
          groupIdOf(data) === groupId
        ) {
          syncRef.current();
        }
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [canConnect, groupId, role]);

  useEffect(() => {
    if (!canConnect || conversationId === null || groupId !== null) {
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
  }, [canConnect, conversationId, groupId, role, clearPeerTyping]);

  // Throttled, fire and forget, over the socket. Polling-only mode (no live
  // connection) sends nothing, so there is no request and no error to handle.
  const sendTyping = useCallback(() => {
    const now = Date.now();

    if (
      state !== "connected" ||
      groupId !== null ||
      conversationId === null ||
      !shouldSendTyping(lastTypingSentAt.current, now)
    ) {
      return;
    }
    lastTypingSentAt.current = now;
    sendSocketTyping(role, conversationId);
  }, [conversationId, groupId, role, state]);

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
