"use client";

import { useEffect, useRef, useState } from "react";

import {
  conversationChannel,
  userChannel,
} from "@/features/chat/utils/ably-capabilities";
import {
  pollIntervalFor,
  type RealtimeState,
  realtimeStateFor,
} from "@/features/chat/utils/chat-thread-rules";

const USER_TOKEN_URL = "/api/chat/ably-token";
const ADMIN_TOKEN_URL = "/api/chat/ably-token?as=admin";

interface UseChatTransportOptions {
  role: "user" | "admin";
  userId: number;
  conversationId: number | null;
  chatEnabled: boolean;
  // Asks the owner to fetch what is new. Called on every realtime event, on
  // every poll tick, on (re)connect and when the tab becomes visible.
  onSync: () => void;
}

// The ChatTransport seam: realtime via Ably when the server hands out a token,
// plain polling otherwise. Ably events carry no sender name, so any event just
// triggers a fetch (which also fills gaps). Turso stays the source of truth.
export const useChatTransport = ({
  role,
  userId,
  conversationId,
  chatEnabled,
  onSync,
}: UseChatTransportOptions) => {
  const [state, setState] = useState<RealtimeState>("connecting");
  const [isHidden, setIsHidden] = useState(false);
  const syncRef = useRef(onSync);

  useEffect(() => {
    syncRef.current = onSync;
  });

  // A locked trainee gets no token (403) and polls only. An admin is never
  // refused one: chat-status events tell them when the chat is unlocked.
  const canConnect =
    conversationId !== null && (role === "admin" || chatEnabled);

  useEffect(() => {
    if (!canConnect || conversationId === null) {
      return;
    }
    const tokenUrl = role === "admin" ? ADMIN_TOKEN_URL : USER_TOKEN_URL;
    let cancelled = false;
    let close: (() => void) | undefined;

    const connect = async () => {
      setState("connecting");
      try {
        const Ably = await import("ably");

        if (cancelled) {
          return;
        }
        const client = new Ably.Realtime({
          autoConnect: true,
          authCallback: (_params, callback) => {
            fetch(tokenUrl, { cache: "no-store" })
              .then(async (response) => {
                if (response.status === 200) {
                  callback(null, await response.json());
                  return;
                }
                // 204 = no key configured, 403 = locked: stay on polling.
                if (response.status === 204 || response.status === 403) {
                  if (!cancelled) {
                    setState("unavailable");
                  }
                  client.close();
                }
                callback(`token request failed (${response.status})`, null);
              })
              .catch(() => {
                callback("token request failed", null);
              });
          },
        });
        const trigger = () => syncRef.current();

        close = () => client.close();
        client.connection.on((change) => {
          if (cancelled || change.current === "closed") {
            return;
          }
          setState(realtimeStateFor(change.current));
          if (change.current === "connected") {
            // One gap-fill after every (re)connect.
            trigger();
          }
        });
        // subscribe() also attaches; if the client is closed meanwhile (no
        // key, locked) the attach rejects, and polling already covers that.
        const ignore = () => undefined;

        client.channels
          .get(conversationChannel(conversationId))
          .subscribe(trigger)
          .catch(ignore);
        if (role === "user") {
          client.channels
            .get(userChannel(userId))
            .subscribe(trigger)
            .catch(ignore);
        }
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
  }, [canConnect, conversationId, role, userId]);

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

  // Without a token scope (locked, no conversation) there is nothing to
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

  return { realtimeState: effectiveState };
};
