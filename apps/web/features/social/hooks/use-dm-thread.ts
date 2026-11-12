"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { UNREAD_REFRESH_EVENT } from "@/features/chat/hooks/use-chat-unread";
import {
  DM_EVENTS,
  dmConversationChannel,
} from "@/features/chat/utils/ably-capabilities";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import {
  markDmReadAction,
  sendDmAction,
  unsendDmAction,
} from "@/features/social/services/dm-actions";
import type {
  DmMessageView,
  DmReplyPostView,
  DmThreadPage,
} from "@/features/social/types/dm";
import {
  dmPollDelayMs,
  dmPollHadActivity,
  nextEmptyPolls,
} from "@/features/social/utils/dm-poll-rules";
import {
  type DmThreadItem,
  lastServerId,
  mergeThread,
  prependOlder,
} from "@/features/social/utils/dm-thread-rules";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

interface PollPayload extends DmThreadPage {
  isReadOnly: boolean;
  readOnlyReason: string | null;
}

interface Options {
  conversationId: number;
  meId: number;
  initial: DmThreadPage & {
    readOnlyReason: string | null;
    isReadOnly: boolean;
  };
}

const messagesUrl = (conversationId: number, query: string) =>
  `/api/dm/${conversationId}/messages${query}`;

// The thread of one trainee chat: polls every DM_POLL_MS (backing off to 20 s
// while quiet, paused while the tab is hidden, and on tab focus),
// subscribes to the Ably channel when the server hands out a token (an event
// only triggers a fetch), sends optimistically and retries by clientId.
export const useDmThread = ({ conversationId, meId, initial }: Options) => {
  const localize = useLocalizeMessage();
  const [items, setItems] = useState<DmThreadItem[]>(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [otherReadUpTo, setOtherReadUpTo] = useState(initial.otherReadUpTo);
  const [readOnlyReason, setReadOnlyReason] = useState(initial.readOnlyReason);
  const itemsRef = useRef(items);
  const inFlight = useRef(false);
  // Consecutive polls that brought nothing; drives the poll back-off.
  const emptyPolls = useRef(0);
  const otherReadRef = useRef(initial.otherReadUpTo);
  // Set by the poll loop below: wake() resets the back-off and syncs now;
  // speedUp() only resets the back-off (next poll comes at the fast rate).
  const wakeRef = useRef<() => void>(() => undefined);
  const speedUpRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const markRead = useCallback(() => {
    void markDmReadAction(conversationId).then(() =>
      window.dispatchEvent(new Event(UNREAD_REFRESH_EVENT)),
    );
  }, [conversationId]);

  const sync = useCallback(async () => {
    if (inFlight.current || document.visibilityState === "hidden") {
      return;
    }
    inFlight.current = true;
    try {
      const after = lastServerId(itemsRef.current);
      const response = await fetch(
        messagesUrl(conversationId, after > 0 ? `?after=${after}` : ""),
        { cache: "no-store" },
      );

      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as PollPayload;

      setItems((current) =>
        mergeThread(current, data.messages, data.deletedIds),
      );
      emptyPolls.current = nextEmptyPolls(
        emptyPolls.current,
        dmPollHadActivity(
          data.messages.length,
          data.deletedIds.length,
          data.otherReadUpTo !== otherReadRef.current,
        ),
      );
      otherReadRef.current = data.otherReadUpTo;
      setOtherReadUpTo(data.otherReadUpTo);
      setReadOnlyReason(data.isReadOnly ? (data.readOnlyReason ?? "") : null);
      if (data.messages.some((message) => message.senderId !== meId)) {
        markRead();
      }
    } catch {
      // Offline: the next tick tries again.
    } finally {
      inFlight.current = false;
    }
  }, [conversationId, markRead, meId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    // One timeout at a time; none while hidden (the next wake restarts it).
    const schedule = () => {
      clear();
      if (stopped || document.visibilityState === "hidden") {
        return;
      }
      timer = setTimeout(
        () => void sync().then(schedule),
        dmPollDelayMs(emptyPolls.current),
      );
    };
    const wake = () => {
      emptyPolls.current = 0;
      clear();
      if (document.visibilityState === "hidden") {
        return;
      }
      void sync().then(schedule);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clear();
        return;
      }
      wake();
    };

    wakeRef.current = wake;
    speedUpRef.current = () => {
      emptyPolls.current = 0;
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", wake);
    return () => {
      stopped = true;
      clear();
      wakeRef.current = () => undefined;
      speedUpRef.current = () => undefined;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", wake);
    };
  }, [sync]);

  // Optional realtime: no key (204) or a locked coach chat (403) keeps polling.
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
            fetch("/api/chat/ably-token", { cache: "no-store" })
              .then(async (response) => {
                if (response.status === 200) {
                  callback(null, await response.json());
                  return;
                }
                if (response.status === 204 || response.status === 403) {
                  client.close();
                }
                callback(`token request failed (${response.status})`, null);
              })
              .catch(() => callback("token request failed", null));
          },
        });

        close = () => client.close();
        client.channels
          .get(dmConversationChannel(conversationId))
          .subscribe((message) => {
            if (
              message.name === DM_EVENTS.MESSAGE ||
              message.name === DM_EVENTS.UPDATE
            ) {
              wakeRef.current();
            }
          })
          .catch(() => undefined);
      } catch {
        // Polling covers it.
      }
    };

    void connect();
    return () => {
      cancelled = true;
      close?.();
    };
  }, [conversationId, sync]);

  const loadOlder = useCallback(async () => {
    const first = itemsRef.current.find((item) => !item.pending);

    if (!first) {
      return;
    }
    const response = await fetch(
      messagesUrl(conversationId, `?before=${first.id}`),
      { cache: "no-store" },
    );

    if (response.ok) {
      const data = (await response.json()) as PollPayload;

      setItems((current) => prependOlder(current, data.messages));
      setHasMore(data.hasMore);
    }
  }, [conversationId]);

  const deliver = useCallback(
    async (item: DmThreadItem, photoId: number | null) => {
      const postId = item.post?.id ?? null;

      const result = await sendDmAction({
        conversationId,
        clientId: item.clientId,
        body: item.body ?? "",
        photoId,
        postId,
      });

      if (result.status === "error") {
        toast.error(result.message);
        setItems((current) =>
          current.map((entry) =>
            entry.clientId === item.clientId
              ? { ...entry, pending: "failed" }
              : entry,
          ),
        );
        return;
      }
      setItems((current) =>
        mergeThread(current, [result.message as DmMessageView], []),
      );
    },
    [conversationId],
  );

  const send = useCallback(
    (
      body: string,
      photo: { id: number; url: string; width: number; height: number } | null,
      post: DmReplyPostView | null = null,
    ) => {
      const item: DmThreadItem = {
        id: -Date.now(),
        senderId: meId,
        body: body.trim() === "" ? null : body.trim(),
        photo,
        post,
        clientId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        pending: "sending",
      };

      setItems((current) => [...current, item]);
      // A reply is likely soon: poll at the fast rate again.
      speedUpRef.current();
      void deliver(item, photo?.id ?? null);
    },
    [deliver, meId],
  );

  const retry = useCallback(
    (clientId: string) => {
      const item = itemsRef.current.find(
        (entry) => entry.clientId === clientId,
      );

      if (!item) {
        return;
      }
      setItems((current) =>
        current.map((entry) =>
          entry.clientId === clientId
            ? { ...entry, pending: "sending" }
            : entry,
        ),
      );
      void deliver(item, item.photo ? photoIdOf(item.photo.url) : null);
    },
    [deliver],
  );

  const unsend = useCallback(
    async (messageId: number) => {
      const result = await unsendDmAction(conversationId, messageId);

      if (result.status === "error") {
        toast.error(localize(result.message ?? DM_MESSAGES.SEND_FAILED));
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== messageId));
    },
    [conversationId, localize],
  );

  return {
    items,
    hasMore,
    otherReadUpTo,
    readOnlyReason,
    send,
    retry,
    unsend,
    loadOlder,
  };
};

const photoIdOf = (url: string) => Number(url.split("/").pop());
