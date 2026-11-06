"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { sendMessageAction } from "@/features/chat/services/chat-actions";
import { CHANGES_PAGE_SIZE } from "@/features/chat/utils/chat-rules";
import {
  firstStoredId,
  lastStoredId,
  mergeChanges,
  mergeMessages,
  newestPeerMessageId,
  type SerializedChatMessage,
  serializeMessage,
  type ServerChatMessage,
  shouldMarkRead,
  type ThreadMessage,
  type ThreadViewer,
  toReplyTo,
  withMyReaction,
} from "@/features/chat/utils/chat-thread-rules";

const MARK_READ_DEBOUNCE_MS = 600;
const SEND_FAILED_TEXT = "Không gửi được tin nhắn. Thử lại nhé.";
const ACTION_FAILED_TEXT = "Không thực hiện được. Thử lại nhé.";

export interface ThreadSnapshot {
  messages: SerializedChatMessage[];
  hasMore: boolean;
  chatEnabled: boolean;
  peerReadUpTo: number;
  // The other side's last heartbeat (ISO) for the status line, KAN-128.
  peerLastSeenAt?: string | null;
  // Messages changed since the last `changedSince` (edit, unsend, reaction)
  // and the cursor to send next. The first page load has no changes.
  changes?: SerializedChatMessage[];
  lastChangeAt?: number;
}

type ThreadResponse = ThreadSnapshot;

const isThreadResponse = (value: unknown): value is ThreadResponse =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as ThreadResponse).messages) &&
  typeof (value as ThreadResponse).chatEnabled === "boolean";

// The success shape of the react / edit / unsend actions.
export type MessageActionResult =
  | { status: "success"; message: ServerChatMessage }
  | { status: "error"; message: string };

// What differs between the trainee and the admin view of the same thread.
export interface ChatAdapter {
  messagesUrl: string;
  // Previous bodies of an edited message.
  editsUrl: (messageId: number) => string;
  viewer: ThreadViewer;
  sendMessage: (
    body: string,
    clientId: string,
    replyToMessageId?: number,
  ) => Promise<Awaited<ReturnType<typeof sendMessageAction>>>;
  reactMessage: (
    messageId: number,
    emoji: string | null,
  ) => Promise<MessageActionResult>;
  editMessage: (
    messageId: number,
    body: string,
  ) => Promise<MessageActionResult>;
  unsendMessage: (messageId: number) => Promise<MessageActionResult>;
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
  const [peerLastSeenAt, setPeerLastSeenAt] = useState(initial.peerLastSeenAt);
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
  // Newest change cursor held; sent as `changedSince` on every fetch.
  const changeCursor = useRef(initial.lastChangeAt ?? 0);

  useEffect(() => {
    adapterRef.current = adapter;
    messagesRef.current = messages;
    peerReadRef.current = peerReadUpTo;
    enabledRef.current = chatEnabled;
  });

  const apply = useCallback((data: ThreadResponse, isForward: boolean) => {
    if (data.peerLastSeenAt !== undefined) {
      setPeerLastSeenAt(data.peerLastSeenAt);
    }
    setMessages((current) =>
      mergeChanges(mergeMessages(current, data.messages), data.changes ?? []),
    );
    if (typeof data.lastChangeAt === "number") {
      changeCursor.current = Math.max(changeCursor.current, data.lastChangeAt);
    }
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
          changedSince: String(changeCursor.current),
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
        messagesRef.current = mergeChanges(
          mergeMessages(messagesRef.current, data.messages),
          data.changes ?? [],
        );
        // More than one page of news (new messages or changes): keep going
        // until caught up.
        again =
          (after > 0 && data.hasMore) ||
          (data.changes?.length ?? 0) >= CHANGES_PAGE_SIZE;
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
    async (body: string, clientId: string, replyToMessageId?: number) => {
      try {
        const { viewer, sendMessage } = adapterRef.current;
        const result = await sendMessage(body, clientId, replyToMessageId);

        if (result.status === "success" && "message" in result) {
          const stored: SerializedChatMessage = {
            ...serializeMessage(result.message),
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
    (rawBody: string, replyTo?: ThreadMessage | null) => {
      const body = rawBody.trim();

      if (!body) {
        return;
      }
      const clientId = crypto.randomUUID();
      const { viewer } = adapterRef.current;
      const now = new Date().toISOString();
      const quote = replyTo ? toReplyTo(replyTo) : null;
      const optimistic: ThreadMessage = {
        id: null,
        senderRole: viewer.role,
        senderAdminId: viewer.role === "admin" ? viewer.adminId : null,
        senderAdminName: viewer.role === "admin" ? viewer.adminName : null,
        body,
        clientId,
        createdAt: now,
        replyTo: quote,
        editedAt: null,
        deleted: false,
        updatedAt: now,
        reactions: [],
        delivery: "sending",
      };

      setSendError(null);
      setMessages((current) => [...current, optimistic]);
      void deliver(body, clientId, quote?.id);
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
      void deliver(target.body, clientId, target.replyTo?.id);
    },
    [deliver],
  );

  // Optimistic change of one stored message. The server's answer replaces it;
  // on any failure the previous message comes back and a toast says so.
  const mutate = useCallback(
    async (
      messageId: number,
      optimistic: (message: ThreadMessage) => ThreadMessage,
      call: (adapter: ChatAdapter) => Promise<MessageActionResult>,
    ) => {
      const before = messagesRef.current.find(
        (message) => message.id === messageId,
      );

      if (!before) {
        return;
      }
      const replace = (next: ThreadMessage) =>
        setMessages((current) =>
          current.map((message) => (message.id === messageId ? next : message)),
        );

      replace(optimistic(before));
      try {
        const result = await call(adapterRef.current);

        if (result.status !== "success") {
          throw new Error(result.message);
        }
        setMessages((current) =>
          mergeChanges(current, [serializeMessage(result.message)]),
        );
      } catch (error) {
        replace(before);
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : ACTION_FAILED_TEXT,
        );
        void sync();
      }
    },
    [sync],
  );

  // emoji null removes my reaction.
  const react = useCallback(
    (messageId: number, emoji: string | null) =>
      mutate(
        messageId,
        (message) => ({
          ...message,
          reactions: withMyReaction(
            message.reactions,
            adapterRef.current.viewer,
            emoji,
          ),
        }),
        (current) => current.reactMessage(messageId, emoji),
      ),
    [mutate],
  );

  const edit = useCallback(
    (messageId: number, rawBody: string) => {
      const body = rawBody.trim();
      const target = messagesRef.current.find(
        (message) => message.id === messageId,
      );

      // Same text is a no-op on the server too: no marker, no history row.
      if (!body || !target || target.body === body) {
        return Promise.resolve();
      }
      return mutate(
        messageId,
        (message) => ({
          ...message,
          body,
          editedAt: new Date().toISOString(),
        }),
        (current) => current.editMessage(messageId, body),
      );
    },
    [mutate],
  );

  const unsend = useCallback(
    (messageId: number) =>
      mutate(
        messageId,
        (message) => ({
          ...message,
          body: "",
          deleted: true,
          replyTo: null,
          reactions: [],
        }),
        (current) => current.unsendMessage(messageId),
      ),
    [mutate],
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
    peerLastSeenAt,
    isLoadingOlder,
    sendError,
    sync,
    loadOlder,
    send,
    retry,
    react,
    edit,
    unsend,
  };
};
