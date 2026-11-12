"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { subscribeChatSocket } from "@/features/chat/hooks/chat-socket";
import { setInboxRealtimeConnected } from "@/features/chat/hooks/inbox-realtime";
import { UNREAD_REFRESH_EVENT } from "@/features/chat/hooks/use-chat-unread";
import type { RealtimeState } from "@/features/chat/utils/chat-thread-rules";

// Without a live socket the inbox is refreshed on this slow tick.
export const INBOX_FALLBACK_REFRESH_MS = 30_000;
// Several events in a burst (a read plus a message) become one refresh.
const COALESCE_MS = 300;

// Renders nothing. Keeps the server-rendered inbox fresh: refreshes the route
// on every inbox event from the socket, and on a 30 s tick while it is not
// connected (no ticket, failed, or still connecting). A hidden tab pauses and
// refreshes once when it returns.
export const InboxLiveRefresh = () => {
  const router = useRouter();
  const [state, setState] = useState<RealtimeState>("connecting");
  const [isHidden, setIsHidden] = useState(false);
  const refreshRef = useRef(() => router.refresh());
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refreshRef.current = () => {
      if (pending.current === null) {
        pending.current = setTimeout(() => {
          pending.current = null;
          router.refresh();
          window.dispatchEvent(new Event(UNREAD_REFRESH_EVENT));
        }, COALESCE_MS);
      }
    };
  }, [router]);

  useEffect(
    () => () => {
      if (pending.current !== null) {
        clearTimeout(pending.current);
      }
    },
    [],
  );

  // One shared socket (see chat-socket.ts): inbox and read events refresh.
  useEffect(
    () =>
      subscribeChatSocket("admin", {
        onState: setState,
        // Catch up on what happened while disconnected.
        onConnect: () => refreshRef.current(),
        onEvent: (name) => {
          if (name === "inbox" || name === "read") {
            refreshRef.current();
          }
        },
      }),
    [],
  );

  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";

      setIsHidden(hidden);
      if (!hidden) {
        refreshRef.current();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Lets the unread badge slow its poll while this connection is live.
  useEffect(() => {
    setInboxRealtimeConnected(state === "connected");
    return () => setInboxRealtimeConnected(false);
  }, [state]);

  const shouldTick = !isHidden && state !== "connected";

  useEffect(() => {
    if (!shouldTick) {
      return;
    }
    const timer = setInterval(
      () => refreshRef.current(),
      INBOX_FALLBACK_REFRESH_MS,
    );

    return () => clearInterval(timer);
  }, [shouldTick]);

  return null;
};
