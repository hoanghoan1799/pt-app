"use server";

import { z } from "zod";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import { schedulePush } from "@/features/chat/services/chat-push";
import {
  type ChatMessage,
  findConversationById,
  findConversationByUserId,
  getOrCreateConversation,
  insertMessageOnce,
  saveReadCursor,
} from "@/features/chat/services/chat-queries";
import {
  publishNewMessage,
  publishRead,
} from "@/features/chat/services/chat-realtime";
import {
  adminReaderKey,
  sendMessageSchema,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";
import { findUserById } from "@/services/users";

// Message bodies are never logged (spec section 7): only ids, if anything.

type SendResult =
  | { status: "success"; message: ChatMessage }
  | { status: "error"; message: string };

const fail = (message: string) => ({ status: "error" as const, message });

// Trainee send. The conversation always comes from the session user, never
// from the client. insertMessage is idempotent: a retried clientId returns
// the stored message. No send limit (D13, Hoan 2026-11-04).
export const sendMessageAction = withResultErrorHandling(
  "sendChatMessage",
  async (input: { body: string; clientId: string }): Promise<SendResult> => {
    const user = await requireUser();

    if (!isChatEnabled(user)) {
      return fail(CHAT_MESSAGES.CHAT_LOCKED);
    }
    const parsed = sendMessageSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const { body, clientId } = parsed.data;
    const conversation = await getOrCreateConversation(user.id);
    const { message, created } = await insertMessageOnce({
      conversationId: conversation.id,
      senderRole: "user",
      senderAdminId: null,
      body,
      clientId,
    });

    // After the DB write; publishChatEvent never throws. A retried send
    // republishes the stored message, clients dedupe by id.
    await publishNewMessage(conversation.id, message);
    // Push only for a new row, never for a retried clientId.
    if (created) {
      schedulePush({
        senderRole: "user",
        traineeUserId: user.id,
        conversationId: conversation.id,
      });
    }
    return { status: "success", message };
  },
);

const adminSendSchema = sendMessageSchema.extend({
  userId: z.number().int().positive(),
});

// Admin reply to one trainee. D6: a locked trainee cannot be written to either.
export const adminSendMessageAction = withResultErrorHandling(
  "adminSendChatMessage",
  async (input: {
    userId: number;
    body: string;
    clientId: string;
  }): Promise<SendResult> => {
    const admin = await requireAdmin();
    const parsed = adminSendSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const { userId, body, clientId } = parsed.data;
    const trainee = await findUserById(userId);

    if (!trainee) {
      return fail(CHAT_MESSAGES.USER_NOT_FOUND);
    }
    if (!isChatEnabled(trainee)) {
      return fail(CHAT_MESSAGES.CHAT_LOCKED);
    }
    const conversation = await getOrCreateConversation(trainee.id);
    const { message, created } = await insertMessageOnce({
      conversationId: conversation.id,
      senderRole: "admin",
      senderAdminId: admin.id,
      body,
      clientId,
    });

    // After the DB write; publishChatEvent never throws. A retried send
    // republishes the stored message, clients dedupe by id.
    await publishNewMessage(conversation.id, message);
    if (created) {
      schedulePush({
        senderRole: "admin",
        traineeUserId: trainee.id,
        conversationId: conversation.id,
      });
    }
    return { status: "success", message };
  },
);

const readCursorSchema = z.number().int().nonnegative();

// Reading stays allowed while chat is locked (D5: read-only history).
export const markReadAction = withResultErrorHandling(
  "markChatRead",
  async (input: { lastReadMessageId: number }) => {
    const user = await requireUser();
    const parsed = readCursorSchema.safeParse(input?.lastReadMessageId);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const conversation = await findConversationByUserId(user.id);

    if (conversation) {
      const saved = await saveReadCursor(
        conversation.id,
        USER_READER_KEY,
        parsed.data,
        conversation.lastMessageId ?? 0,
      );

      await publishRead(conversation.id, USER_READER_KEY, saved);
    }
  },
);

const adminReadSchema = z.object({
  conversationId: z.number().int().positive(),
  lastReadMessageId: readCursorSchema,
});

export const adminMarkReadAction = withResultErrorHandling(
  "adminMarkChatRead",
  async (input: { conversationId: number; lastReadMessageId: number }) => {
    const admin = await requireAdmin();
    const parsed = adminReadSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const conversation = await findConversationById(parsed.data.conversationId);

    if (!conversation) {
      return fail(CHAT_MESSAGES.CONVERSATION_NOT_FOUND);
    }
    const readerKey = adminReaderKey(admin.id);
    const saved = await saveReadCursor(
      conversation.id,
      readerKey,
      parsed.data.lastReadMessageId,
      conversation.lastMessageId ?? 0,
    );

    await publishRead(conversation.id, readerKey, saved);
  },
);
