"use client";

import { REALTIME_EVENTS } from "@pt/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  type ChatRole,
  isGroupEvent,
  subscribeChatSocket,
} from "@/features/chat/hooks/chat-socket";
import { setInboxRealtimeConnected } from "@/features/chat/hooks/inbox-realtime";
import { UNREAD_REFRESH_EVENT } from "@/features/chat/hooks/use-chat-unread";
import type { RealtimeState } from "@/features/chat/utils/chat-thread-rules";

// Without a live socket the inbox is refreshed on this slow tick.
export const INBOX_FALLBACK_REFRESH_MS = 30_000;
// Several events in a burst (a read plus a message) become one refresh.
const COALESCE_MS = 300;

interface InboxLiveRefreshProps {
  // The admin inbox (trainee chats and groups) or the trainee Messages tab
  // (groups only; its other rows have their own refresh).
  role?: ChatRole;
  // "admin:<id>" | "user:<id>" of the viewer: another member's group read
  // changes nothing here, only my own (read in another tab) does.
  groupReaderKey?: string;
}

// Whether a group event changes what this inbox shows: new or changed
// messages and member changes always, a read only when it is my own.
const groupEventRefreshes = (
  name: string,
  data: unknown,
  readerKey: string | undefined,
) =>
  name !== REALTIME_EVENTS.groupRead ||
  (readerKey !== undefined &&
    (data as { readerKey?: unknown } | null)?.readerKey === readerKey);

// Renders nothing. Keeps the server-rendered inbox fresh: refreshes the route
// on every inbox and group event from the socket, and (admin) on a 30 s tick
// while it is not connected (no ticket, failed, or still connecting). A
// hidden tab pauses and refreshes once when it returns.
export const InboxLiveRefresh = ({
  role = "admin",
  groupReaderKey,
}: InboxLiveRefreshProps) => {
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

  // One shared socket (see chat-socket.ts): inbox, read and group events
  // refresh.
  useEffect(
    () =>
      subscribeChatSocket(role, {
        onState: setState,
        // Catch up on what happened while disconnected.
        onConnect: () => refreshRef.current(),
        onEvent: (name, data) => {
          if (
            isGroupEvent(name)
              ? groupEventRefreshes(name, data, groupReaderKey)
              : role === "admin" && (name === "inbox" || name === "read")
          ) {
            refreshRef.current();
          }
        },
      }),
    [role, groupReaderKey],
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

  // The trainee inbox has its own slow refresh (DmInboxRefresh).
  const shouldTick = role === "admin" && !isHidden && state !== "connected";

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
