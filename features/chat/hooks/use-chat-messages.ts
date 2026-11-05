"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { sendMessageAction } from "@/features/chat/services/chat-actions";
import {
  firstStoredId,
  lastStoredId,
  mergeMessages,
  newestPeerMessageId,
  type SerializedChatMessage,
  shouldMarkRead,
  type ThreadMessage,
  type ThreadViewer,
} from "@/features/chat/utils/chat-thread-rules";

const MARK_READ_DEBOUNCE_MS = 600;
const SEND_FAILED_TEXT = "Không gửi được tin nhắn. Thử lại nhé.";

export interface ThreadSnapshot {
  messages: SerializedChatMessage[];
  hasMore: boolean;
  chatEnabled: boolean;
  peerReadUpTo: number;
  // The other side's last heartbeat (ISO) for the status line, KAN-128.
  peerLastSeenAt?: string | null;
}

type ThreadResponse = ThreadSnapshot;

const isThreadResponse = (value: unknown): value is ThreadResponse =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as ThreadResponse).messages) &&
  typeof (value as ThreadResponse).chatEnabled === "boolean";

// What differs between the trainee and the admin view of the same thread.
export interface ChatAdapter {
  messagesUrl: string;
  viewer: ThreadViewer;
  sendMessage: (
    body: string,
    clientId: string,
  ) => Promise<Awaited<ReturnType<typeof sendMessageAction>>>;
  markRead: (lastReadMessageId: number) => Promise<{ status: string }>;
}

interface Options {
  adapter: ChatAdapter;
  initial: ThreadSnapshot;
  // True while the thread is on screen and the tab visible: new PT messages
  // then count as seen.
  isViewing: boolean;
}

export const useChatMessages = ({ adapter, initial, isViewing }: Options) => {
  const [messages, setMessages] = useState<ThreadMessage[]>(() =>
    mergeMessages([], initial.messages),
  );
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [chatEnabled, setChatEnabled] = useState(initial.chatEnabled);
  const [peerReadUpTo, setPeerReadUpTo] = useState(initial.peerReadUpTo);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Latest values for callbacks that must stay stable.
  const messagesRef = useRef(messages);
  const peerReadRef = useRef(peerReadUpTo);
  const enabledRef = useRef(chatEnabled);
  const syncing = useRef(false);
  const resync = useRef(false);
  const lastMarked = useRef(0);
  const adapterRef = useRef(adapter);

  useEffect(() => {
    adapterRef.current = adapter;
    messagesRef.current = messages;
    peerReadRef.current = peerReadUpTo;
    enabledRef.current = chatEnabled;
  });

  const apply = useCallback((data: ThreadResponse, isForward: boolean) => {
    setMessages((current) => mergeMessages(current, data.messages));
    setChatEnabled(data.chatEnabled);
    setPeerReadUpTo((current) => Math.max(current, data.peerReadUpTo));
    if (!isForward) {
      setHasMore(data.hasMore);
    }
  }, []);

  // Fetch what is new after the newest stored message. Never overlaps itself:
  // a call during a fetch queues one more run afterwards.
  const sync = useCallback(async () => {
    if (syncing.current) {
      resync.current = true;
      return;
    }
    syncing.current = true;
    try {
      let again = true;

      while (again) {
        again = false;
        const after = lastStoredId(messagesRef.current);
        const params = new URLSearchParams({
          readUpTo: String(peerReadRef.current),
          enabled: enabledRef.current ? "1" : "0",
        });

        if (after > 0) {
          params.set("after", String(after));
        }
        const response = await fetch(
          `${adapterRef.current.messagesUrl}?${params}`,
          {
            cache: "no-store",
          },
        );

        if (response.status === 401) {
          // Session ended: reload so the guard sends the user to login.
          window.location.reload();
          return;
        }
        if (response.status === 204 || !response.ok) {
          break;
        }
        const data: unknown = await response.json();

        if (!isThreadResponse(data)) {
          break;
        }
        apply(data, after > 0);
        messagesRef.current = mergeMessages(messagesRef.current, data.messages);
        // More than one page of news: keep going until caught up.
        again = after > 0 && data.hasMore;
        if (resync.current) {
          resync.current = false;
          again = true;
        }
      }
    } catch {
      // Network blip: the next tick or event retries.
    } finally {
      syncing.current = false;
    }
  }, [apply]);

  const loadOlder = useCallback(async () => {
    const before = firstStoredId(messagesRef.current);

    if (before === null || isLoadingOlder) {
      return;
    }
    setIsLoadingOlder(true);
    try {
      const response = await fetch(
        `${adapterRef.current.messagesUrl}?before=${before}`,
        {
          cache: "no-store",
        },
      );
      const data: unknown = response.ok ? await response.json() : null;

      if (isThreadResponse(data)) {
        setMessages((current) => mergeMessages(current, data.messages));
        setHasMore(data.hasMore);
      }
    } catch {
      // Button stays; the user can tap again.
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder]);

  const deliver = useCallback(
    async (body: string, clientId: string) => {
      try {
        const { viewer, sendMessage } = adapterRef.current;
        const result = await sendMessage(body, clientId);

        if (result.status === "success" && "message" in result) {
          const stored: SerializedChatMessage = {
            ...result.message,
            createdAt: new Date(result.message.createdAt).toISOString(),
            senderAdminName:
              viewer.role === "admin"
                ? (result.message.senderAdminName ?? viewer.adminName)
                : null,
          };

          setMessages((current) => mergeMessages(current, [stored]));
          setSendError(null);
          return;
        }
        throw new Error(result.status === "error" ? result.message : "send");
      } catch (error) {
        setSendError(
          error instanceof Error && error.message !== "send"
            ? error.message
            : SEND_FAILED_TEXT,
        );
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId && message.id === null
              ? { ...message, delivery: "failed" }
              : message,
          ),
        );
        // A lock may be why it failed: refresh the state.
        void sync();
      }
    },
    [sync],
  );

  const send = useCallback(
    (rawBody: string) => {
      const body = rawBody.trim();

      if (!body) {
        return;
      }
      const clientId = crypto.randomUUID();
      const { viewer } = adapterRef.current;
      const optimistic: ThreadMessage = {
        id: null,
        senderRole: viewer.role,
        senderAdminId: viewer.role === "admin" ? viewer.adminId : null,
        senderAdminName: viewer.role === "admin" ? viewer.adminName : null,
        body,
        clientId,
        createdAt: new Date().toISOString(),
        delivery: "sending",
      };

      setSendError(null);
      setMessages((current) => [...current, optimistic]);
      void deliver(body, clientId);
    },
    [deliver],
  );

  const retry = useCallback(
    (clientId: string) => {
      const target = messagesRef.current.find(
        (message) => message.clientId === clientId && message.id === null,
      );

      if (!target) {
        return;
      }
      setSendError(null);
      setMessages((current) =>
        current.map((message) =>
          message.clientId === clientId
            ? { ...message, delivery: "sending" }
            : message,
        ),
      );
      void deliver(target.body, clientId);
    },
    [deliver],
  );

  // Report "read" for the newest PT message once it is on screen; debounced
  // and only when the number grows.
  const newestPeerId = newestPeerMessageId(messages, adapter.viewer.role);

  useEffect(() => {
    if (!isViewing || !shouldMarkRead(newestPeerId, lastMarked.current)) {
      return;
    }
    const timer = setTimeout(() => {
      if (!shouldMarkRead(newestPeerId, lastMarked.current)) {
        return;
      }
      lastMarked.current = newestPeerId;
      void adapterRef.current.markRead(newestPeerId).then(
        (result) => {
          if (result.status === "error") {
            // Allow another attempt on the next change.
            lastMarked.current = 0;
          }
        },
        () => {
          lastMarked.current = 0;
        },
      );
    }, MARK_READ_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isViewing, newestPeerId]);

  return {
    messages,
    hasMore,
    chatEnabled,
    peerReadUpTo,
    isLoadingOlder,
    sendError,
    sync,
    loadOlder,
    send,
    retry,
  };
};
