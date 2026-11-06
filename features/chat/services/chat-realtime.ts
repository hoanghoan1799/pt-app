import "server-only";

import * as Ably from "ably";

import {
  ABLY_TOKEN_TTL_MS,
  type AblyCapability,
  CHAT_EVENTS,
  chatStatusEvent,
  conversationChannel,
  INBOX_CHANNEL,
  inboxEvent,
  messageEvent,
  messageUpdateEvent,
  profileUpdateEvent,
  readEvent,
  typingEvent,
  userChannel,
} from "@/features/chat/utils/ably-capabilities";
import { getAblyApiKey } from "@/services/env";
import { logServerError } from "@/services/logger";

type ChatMessageInput = Parameters<typeof messageEvent>[0];

let rest: Ably.Rest | null = null;
let warned = false;

// Test seam: forget the cached client and the one-time warning.
export const resetChatRealtimeForTests = () => {
  rest = null;
  warned = false;
};

const getRest = () => {
  if (rest) {
    return rest;
  }
  const key = getAblyApiKey();

  if (!key) {
    if (!warned) {
      warned = true;
      console.warn("[pt-app] ABLY_API_KEY missing: chat uses polling only");
    }
    return null;
  }
  rest = new Ably.Rest({ key });
  return rest;
};

export const isRealtimeConfigured = () => getRest() !== null;

// Never throws and never logs payloads (message bodies stay out of logs):
// Turso is the source of truth, a lost publish only means a client polls.
export const publishChatEvent = async (
  channel: string,
  name: string,
  data: unknown,
) => {
  try {
    const client = getRest();

    if (!client) {
      return;
    }
    await client.channels.get(channel).publish(name, data);
  } catch (error) {
    logServerError("publishChatEvent", error, { channel, name });
  }
};

export const publishNewMessage = async (
  conversationId: number,
  message: Omit<ChatMessageInput, "conversationId">,
) => {
  try {
    const payload = messageEvent({ ...message, conversationId });

    await Promise.all([
      publishChatEvent(
        conversationChannel(conversationId),
        CHAT_EVENTS.MESSAGE,
        payload,
      ),
      publishChatEvent(
        INBOX_CHANNEL,
        CHAT_EVENTS.INBOX,
        inboxEvent(conversationId, message.id, message.senderRole),
      ),
    ]);
  } catch (error) {
    logServerError("publishNewMessage", error, { conversationId });
  }
};

// Edit, unsend or reaction. Ids only; never throws.
export const publishMessageUpdate = async (
  conversationId: number,
  messageId: number,
) => {
  try {
    await publishChatEvent(
      conversationChannel(conversationId),
      CHAT_EVENTS.MESSAGE_UPDATE,
      messageUpdateEvent(conversationId, messageId),
    );
  } catch (error) {
    logServerError("publishMessageUpdate", error, { conversationId });
  }
};

// Nickname or colour change. Ids only; never throws.
export const publishProfileUpdate = async (conversationId: number) => {
  try {
    await publishChatEvent(
      conversationChannel(conversationId),
      CHAT_EVENTS.PROFILE_UPDATE,
      profileUpdateEvent(conversationId),
    );
  } catch (error) {
    logServerError("publishProfileUpdate", error, { conversationId });
  }
};

export const publishRead = async (
  conversationId: number,
  readerKey: string,
  lastReadMessageId: number,
) => {
  try {
    await publishChatEvent(
      conversationChannel(conversationId),
      CHAT_EVENTS.READ,
      readEvent(readerKey, lastReadMessageId),
    );
  } catch (error) {
    logServerError("publishRead", error, { conversationId });
  }
};

// Typing is a no-op without Ably (polling mode has no indicator). The caller
// has already checked the session, ownership and the chat lock.
export const publishTyping = async (
  conversationId: number,
  role: "user" | "admin",
  senderKey: string,
) => {
  try {
    await publishChatEvent(
      conversationChannel(conversationId),
      CHAT_EVENTS.TYPING,
      typingEvent(role, senderKey),
    );
  } catch (error) {
    logServerError("publishTyping", error, { conversationId });
  }
};

export const publishChatStatus = async (
  userId: number,
  conversationId: number | null,
  enabled: boolean,
) => {
  try {
    const payload = chatStatusEvent(enabled);
    const targets = [userChannel(userId)];

    if (conversationId !== null) {
      targets.push(conversationChannel(conversationId));
    }
    await Promise.all(
      targets.map((channel) =>
        publishChatEvent(channel, CHAT_EVENTS.CHAT_STATUS, payload),
      ),
    );
  } catch (error) {
    logServerError("publishChatStatus", error, { userId });
  }
};

// Signed locally with the API key (no network call). Null = not configured.
export const createChatTokenRequest = async ({
  clientId,
  capability,
}: {
  clientId: string;
  capability: AblyCapability;
}) => {
  const client = getRest();

  if (!client) {
    return null;
  }
  return client.auth.createTokenRequest({
    clientId,
    capability: JSON.stringify(capability),
    ttl: ABLY_TOKEN_TTL_MS,
  });
};
