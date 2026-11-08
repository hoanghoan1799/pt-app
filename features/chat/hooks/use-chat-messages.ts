"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { sendMessageAction } from "@/features/chat/services/chat-actions";
import { parseChatCommand } from "@/features/chat/utils/chat-commands";
import { CHANGES_PAGE_SIZE } from "@/features/chat/utils/chat-rules";
import {
  type ChatProfileView,
  EMPTY_PROFILE_VIEW,
} from "@/features/chat/utils/chat-settings";
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
import type { PreparedPhoto } from "@/features/chat/utils/encode-photo";
import { PHOTO_ALT } from "@/features/chat/utils/photo-rules";
import type {
  ChatSticker,
  StickerInput,
} from "@/features/chat/utils/sticker-rules";
import type { DmReplyPostView } from "@/features/social/types/dm";

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
  // Nicknames and bubble colours (KAN-141); sent on every full payload.
  profile?: ChatProfileView;
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

// What a send carries: text, or a sticker (KAN-145). `display` is what the
// optimistic bubble shows until the server answers; the server re-derives the
// stored sticker from `input` alone.
export type SendContent =
  | { body: string }
  | { sticker: { input: StickerInput; display: ChatSticker } }
  // KAN-160: the resized image is uploaded first; `photoId` is kept once it
  // is, so "Gửi lại" never uploads it twice. `body` is the optional caption.
  | { photo: PreparedPhoto & { photoId?: number }; body?: string };

// What differs between the trainee and the admin view of the same thread.
export interface ChatAdapter {
  messagesUrl: string;
  // Previous bodies of an edited message.
  editsUrl: (messageId: number) => string;
  viewer: ThreadViewer;
  // Uploads a resized photo and returns its id (throws with a message).
  uploadPhoto: (blob: Blob) => Promise<number>;
  sendMessage: (
    content: SendContent,
    clientId: string,
    replyToMessageId?: number,
    postId?: number,
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
  const [profile, setProfile] = useState<ChatProfileView>(
    initial.profile ?? EMPTY_PROFILE_VIEW,
  );
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
  // What each unconfirmed bubble sends, for "Gửi lại" (a sticker's input is
  // not recoverable from the bubble).
  const pendingContent = useRef(new Map<string, SendContent>());

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
    if (data.profile) {
      setProfile(data.profile);
    }
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
    async (
      content: SendContent,
      clientId: string,
      replyToMessageId?: number,
      postId?: number,
    ) => {
      try {
        const { viewer, sendMessage, uploadPhoto } = adapterRef.current;
        let toSend = content;

        if ("photo" in content && content.photo.photoId === undefined) {
          const photoId = await uploadPhoto(content.photo.blob);

          toSend = { ...content, photo: { ...content.photo, photoId } };
          pendingContent.current.set(clientId, toSend);
        }
        const result = await sendMessage(
          toSend,
          clientId,
          replyToMessageId,
          postId,
        );

        if (result.status === "success" && "message" in result) {
          const stored: SerializedChatMessage = {
            ...serializeMessage(result.message),
            senderAdminName:
              viewer.role === "admin"
                ? (result.message.senderAdminName ?? viewer.adminName)
                : null,
          };

          pendingContent.current.delete(clientId);
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

  // Shows the bubble at once (no id yet), then delivers it.
  const sendContent = useCallback(
    (
      content: SendContent,
      replyTo: ThreadMessage | null | undefined,
      fields: Pick<ThreadMessage, "body" | "sticker" | "photo">,
      post: DmReplyPostView | null = null,
    ) => {
      const clientId = crypto.randomUUID();
      const { viewer } = adapterRef.current;
      const now = new Date().toISOString();
      const quote = replyTo ? toReplyTo(replyTo) : null;
      const optimistic: ThreadMessage = {
        id: null,
        senderRole: viewer.role,
        senderAdminId: viewer.role === "admin" ? viewer.adminId : null,
        senderAdminName: viewer.role === "admin" ? viewer.adminName : null,
        ...fields,
        clientId,
        createdAt: now,
        replyTo: quote,
        post,
        editedAt: null,
        deleted: false,
        updatedAt: now,
        reactions: [],
        delivery: "sending",
      };

      pendingContent.current.set(clientId, content);
      setSendError(null);
      setMessages((current) => [...current, optimistic]);
      void deliver(content, clientId, quote?.id, post?.id);
    },
    [deliver],
  );

  const send = useCallback(
    (
      rawBody: string,
      replyTo?: ThreadMessage | null,
      post?: DmReplyPostView | null,
    ) => {
      const body = rawBody.trim();
      // The server parses again; this only shows the stripped text in the
      // optimistic bubble.
      const shown = parseChatCommand(body).body;

      if (!shown) {
        return;
      }
      sendContent({ body }, replyTo, { body: shown }, post);
    },
    [sendContent],
  );

  const sendSticker = useCallback(
    (
      sticker: { input: StickerInput; display: ChatSticker },
      replyTo?: ThreadMessage | null,
    ) =>
      sendContent({ sticker }, replyTo, {
        body: "",
        sticker: sticker.display,
      }),
    [sendContent],
  );

  // The bubble shows the local image at once; the stored message (same
  // clientId) replaces it with the served one.
  const sendPhoto = useCallback(
    (
      photo: PreparedPhoto,
      rawBody: string,
      replyTo?: ThreadMessage | null,
      post?: DmReplyPostView | null,
    ) => {
      const body = rawBody.trim();
      // The server parses the caption again; the bubble shows it stripped.
      const shown = parseChatCommand(body).body;

      sendContent(
        { photo, ...(body ? { body } : {}) },
        replyTo,
        {
          body: shown,
          photo: {
            url: URL.createObjectURL(photo.blob),
            width: photo.width,
            height: photo.height,
            alt: PHOTO_ALT,
          },
        },
        post,
      );
    },
    [sendContent],
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
      void deliver(
        pendingContent.current.get(clientId) ?? { body: target.body },
        clientId,
        target.replyTo?.id,
        target.post?.id,
      );
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
          post: null,
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
    profile,
    setProfile,
    isLoadingOlder,
    sendError,
    sync,
    loadOlder,
    send,
    sendSticker,
    sendPhoto,
    retry,
    react,
    edit,
    unsend,
  };
};
