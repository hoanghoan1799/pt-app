"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { setInboxRealtimeConnected } from "@/features/chat/hooks/inbox-realtime";
import { UNREAD_REFRESH_EVENT } from "@/features/chat/hooks/use-chat-unread";
import { INBOX_CHANNEL } from "@/features/chat/utils/ably-capabilities";
import {
  type RealtimeState,
  realtimeStateFor,
} from "@/features/chat/utils/chat-thread-rules";

const TOKEN_URL = "/api/chat/ably-token?as=admin";
// Without a live channel the inbox is refreshed on this slow tick.
export const INBOX_FALLBACK_REFRESH_MS = 30_000;
// Several events in a burst (a read plus a message) become one refresh.
const COALESCE_MS = 300;

// Renders nothing. Keeps the server-rendered inbox fresh: refreshes the route
// on every inbox event from Ably, and on a 30 s tick while Ably is not
// connected (no key, failed, or still connecting). A hidden tab pauses and
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

  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | undefined;

    const connect = async () => {
      try {
        const Ably = await import("ably");

        if (cancelled) {
          return;
        }
        const client = new Ably.Realtime({
          autoConnect: true,
          authCallback: (_params, callback) => {
            fetch(TOKEN_URL, { cache: "no-store" })
              .then(async (response) => {
                if (response.status === 200) {
                  callback(null, await response.json());
                  return;
                }
                // 204 = no key configured: the slow tick covers it.
                if (response.status === 204 && !cancelled) {
                  setState("unavailable");
                  client.close();
                }
                callback(`token request failed (${response.status})`, null);
              })
              .catch(() => callback("token request failed", null));
          },
        });

        close = () => client.close();
        client.connection.on((change) => {
          if (cancelled || change.current === "closed") {
            return;
          }
          setState(realtimeStateFor(change.current));
          if (change.current === "connected") {
            // Catch up on what happened while disconnected.
            refreshRef.current();
          }
        });
        client.channels
          .get(INBOX_CHANNEL)
          .subscribe(() => refreshRef.current())
          .catch(() => undefined);
      } catch {
        if (!cancelled) {
          setState("unavailable");
        }
      }
    };

    void connect();
    return () => {
      cancelled = true;
      close?.();
    };
  }, []);

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
