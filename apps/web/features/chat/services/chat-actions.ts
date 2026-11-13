"use server";

import { z } from "zod";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  editChatMessage,
  fail,
  failFrom,
  reactToMessage,
  sendAsAdmin,
  sendAsUser,
  unsendChatMessage,
} from "@/features/chat/services/chat-mutations";
import {
  hasBodyOrSticker,
  sendMessageSchema,
  sendMessageShape,
} from "@/features/chat/utils/chat-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { requireAdmin, requireUser } from "@/services/auth-guard";

// Message bodies are never logged (spec section 7): only ids, if anything.
// The API owns the rules (chat lock, ownership, stickers, photos, /imlang);
// these actions check the session and the shape, then call it.

// Text or a sticker (KAN-144); the schema has already ruled out both/neither.
interface SendInput {
  body?: string;
  sticker?:
    | { pack: string; id: string }
    | { giphyId: string; url: string }
    | { customId: number };
  // KAN-160: a photo uploaded to /api/chat/photos, plus optional text.
  photoId?: number;
  clientId: string;
  replyToMessageId?: number;
  // The social post being replied to; needs a text.
  postId?: number;
}

// Trainee send. The conversation always comes from the session user. A retried
// clientId returns the stored message.
export const sendMessageAction = withResultErrorHandling(
  "sendChatMessage",
  async (input: SendInput) => {
    await requireUser();
    const parsed = sendMessageSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    return sendAsUser(parsed.data);
  },
);

const adminSendSchema = sendMessageShape
  .extend({ userId: z.number().int().positive() })
  .refine(hasBodyOrSticker);

// Admin reply to one trainee. D6: a locked trainee cannot be written to either.
export const adminSendMessageAction = withResultErrorHandling(
  "adminSendChatMessage",
  async (input: SendInput & { userId: number }) => {
    await requireAdmin();
    const parsed = adminSendSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const { userId, ...body } = parsed.data;

    return sendAsAdmin(userId, body);
  },
);

// Trainee reaction, edit and unsend (KAN-138).
export const reactMessageAction = withResultErrorHandling(
  "reactChatMessage",
  async (input: { messageId: number; emoji: string | null }) => {
    await requireUser();
    return reactToMessage("user", input.messageId, input.emoji);
  },
);

export const editMessageAction = withResultErrorHandling(
  "editChatMessage",
  async (input: { messageId: number; body: string }) => {
    await requireUser();
    return editChatMessage("user", input.messageId, input.body);
  },
);

export const unsendMessageAction = withResultErrorHandling(
  "unsendChatMessage",
  async (input: { messageId: number }) => {
    await requireUser();
    return unsendChatMessage("user", input.messageId);
  },
);

const readCursorSchema = z.number().int().nonnegative();

// Reading stays allowed while chat is locked (D5: read-only history).
export const markReadAction = withResultErrorHandling(
  "markChatRead",
  async (input: { lastReadMessageId: number }) => {
    await requireUser();
    const parsed = readCursorSchema.safeParse(input?.lastReadMessageId);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const outcome = await tryApi("user", (api) =>
      api.POST("/v1/chat/conversations/me/read", {
        body: { lastReadMessageId: parsed.data },
      }),
    );

    // A trainee without a conversation has nothing to mark.
    if (!outcome.ok && outcome.error.status !== 404) {
      return failFrom(outcome.error);
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
    await requireAdmin();
    const parsed = adminReadSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/chat/conversations/{cid}/read", {
        params: { path: { cid: parsed.data.conversationId } },
        body: { lastReadMessageId: parsed.data.lastReadMessageId },
      }),
    );

    if (!outcome.ok) {
      return failFrom(outcome.error);
    }
  },
);
