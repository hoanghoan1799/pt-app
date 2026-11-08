// Pure helpers for Ably channel names, token capabilities and event payloads.
// The API key is restricted to `chat:*`, so every name must start with it.

export const CHAT_CHANNEL_PREFIX = "chat";
export const INBOX_CHANNEL = `${CHAT_CHANNEL_PREFIX}:inbox`;
export const ABLY_TOKEN_TTL_MS = 15 * 60 * 1000;

export const CHAT_EVENTS = {
  MESSAGE: "message",
  MESSAGE_UPDATE: "message-update",
  PROFILE_UPDATE: "profile-update",
  READ: "read",
  CHAT_STATUS: "chat-status",
  INBOX: "inbox",
  TYPING: "typing",
} as const;

const assertId = (value: number, label: string) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return value;
};

export const conversationChannel = (conversationId: number) =>
  `${CHAT_CHANNEL_PREFIX}:conversation:${assertId(conversationId, "conversationId")}`;

export const userChannel = (userId: number) =>
  `${CHAT_CHANNEL_PREFIX}:user:${assertId(userId, "userId")}`;

export type AblyCapability = Record<string, string[]>;

// Subscribe only: nobody publishes from the browser (messages and typing go
// through the server, see POST /api/chat/typing), and there is no presence or
// history. A publish right on a channel would also allow forged "message"
// events, because Ably capabilities are per channel, not per event name.
export const traineeCapability = (
  userId: number,
  conversationId: number,
): AblyCapability => ({
  [conversationChannel(conversationId)]: ["subscribe"],
  [userChannel(userId)]: ["subscribe"],
});

// A super admin follows every conversation; a PT (conversationIds given) only
// those of their workspace. The inbox channel carries ids and the sender role
// only, never text.
export const adminCapability = (
  conversationIds?: number[],
): AblyCapability => ({
  ...(conversationIds
    ? Object.fromEntries(
        conversationIds.map((id) => [conversationChannel(id), ["subscribe"]]),
      )
    : { [`${CHAT_CHANNEL_PREFIX}:conversation:*`]: ["subscribe"] }),
  [INBOX_CHANNEL]: ["subscribe"],
});

export const traineeClientId = (userId: number) =>
  `user:${assertId(userId, "userId")}`;

export const adminClientId = (adminId: number) =>
  `admin:${assertId(adminId, "adminId")}`;

export interface ChatMessageEventSource {
  id: number;
  conversationId: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  body: string;
  clientId: string;
  createdAt: Date;
}

// Only public message fields; createdAt as ISO string (JSON-safe).
export const messageEvent = (message: ChatMessageEventSource) => ({
  id: assertId(message.id, "messageId"),
  conversationId: assertId(message.conversationId, "conversationId"),
  senderRole: message.senderRole,
  senderAdminId: message.senderAdminId,
  body: message.body,
  clientId: message.clientId,
  createdAt: message.createdAt.toISOString(),
});

// Ids only: an edit, unsend or reaction never puts text on the wire. Clients
// react by fetching /messages?changedSince=...
export const messageUpdateEvent = (
  conversationId: number,
  messageId: number,
) => ({
  conversationId: assertId(conversationId, "conversationId"),
  messageId: assertId(messageId, "messageId"),
});

// A nickname or colour changed: ids only, clients refetch the thread.
export const profileUpdateEvent = (conversationId: number) => ({
  conversationId: assertId(conversationId, "conversationId"),
});

export const readEvent = (readerKey: string, lastReadMessageId: number) => ({
  readerKey,
  lastReadMessageId,
});

export const chatStatusEvent = (enabled: boolean) => ({ enabled });

// The inbox never carries the message body.
export const inboxEvent = (
  conversationId: number,
  messageId: number,
  senderRole: "user" | "admin",
) => ({
  conversationId: assertId(conversationId, "conversationId"),
  messageId: assertId(messageId, "messageId"),
  senderRole,
});

// Who is typing: the role plus the sender's Ably client id, so a second tab of
// the same person can ignore its own echo. Never carries text.
export const typingEvent = (role: "user" | "admin", senderKey: string) => ({
  role,
  senderKey,
});
