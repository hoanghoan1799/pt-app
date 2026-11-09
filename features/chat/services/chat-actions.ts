"use server";

import { z } from "zod";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  type ChatActor,
  editChatMessage,
  isReplyTargetValid,
  reactToMessage,
  unsendChatMessage,
} from "@/features/chat/services/chat-mutations";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  attachPhotoToMessage,
  isPhotoAttachable,
  photoUploaderKey,
} from "@/features/chat/services/chat-photos";
import { schedulePush } from "@/features/chat/services/chat-push";
import {
  type ChatMessage,
  findConversationById,
  findConversationByUserId,
  findMessageByClientId,
  getOrCreateConversation,
  insertMessageOnce,
  saveReadCursor,
} from "@/features/chat/services/chat-queries";
import {
  publishNewMessage,
  publishRead,
} from "@/features/chat/services/chat-realtime";
import { canQuotePost } from "@/features/chat/services/chat-reply-post";
import {
  ownsSticker,
  type StickerOwner,
} from "@/features/chat/services/custom-stickers";
import { parseChatCommand } from "@/features/chat/utils/chat-commands";
import {
  adminReaderKey,
  hasBodyOrSticker,
  sendMessageSchema,
  sendMessageShape,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";
import {
  type StickerInput,
  toStoredSticker,
} from "@/features/chat/utils/sticker-rules";
import {
  actorOfAdmin,
  actorOfUser,
} from "@/features/social/services/post-context";
import type { SocialActor } from "@/features/social/types/social";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdminForUser } from "@/services/admin-access";
import { toAdminRole } from "@/services/admin-scope";
import { requireAdmin, requireUser } from "@/services/auth-guard";
import { findUserById } from "@/services/users";

// Message bodies are never logged (spec section 7): only ids, if anything.

type SendResult =
  | { status: "success"; message: ChatMessage }
  | { status: "error"; message: string };

const fail = (message: string) => ({ status: "error" as const, message });

// Text or a sticker (KAN-144); the schema has already ruled out both/neither.
// `input` is untrusted: the client only names a manifest sticker or a GIPHY
// media URL, and what is stored comes from the validated value.
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

// A personal sticker (KAN-158) may only be sent by its owner; the other kinds
// are fully checked by the schema.
const ownsStickerInput = async (
  owner: StickerOwner,
  sticker: StickerInput | undefined,
) =>
  !sticker || !("customId" in sticker) || ownsSticker(owner, sticker.customId);

// Slash commands (KAN-167) only apply to text and photo captions. The stored
// body is the text without the command; a text-only message left empty is
// rejected. Stickers carry no text, so they are never silent.
const resolveContent = (parsed: {
  body?: string;
  sticker?: StickerInput;
  photoId?: number;
}) => {
  if (parsed.sticker) {
    return {
      content: { body: "", ...toStoredSticker(parsed.sticker) },
      silent: false,
    };
  }
  const { body, effects } = parseChatCommand(parsed.body ?? "");

  if (!body && parsed.photoId === undefined) {
    return null;
  }
  return {
    content: { body, photoId: parsed.photoId ?? null },
    silent: effects.silent === true,
  };
};

type Conversation = Awaited<ReturnType<typeof getOrCreateConversation>>;

// A retried send of a photo message (same clientId) finds its photo already
// attached, and a retried post reply may name a post that has become private
// since; both are answered with the stored message before any check.
const findRetry = (
  conversation: Conversation,
  parsed: { photoId?: number; postId?: number; clientId: string },
  viewer: SocialActor,
) =>
  parsed.photoId === undefined && parsed.postId === undefined
    ? null
    : findMessageByClientId(conversation.id, parsed.clientId, viewer);

// The error of a send that quotes a post, or null when it is fine: a text is
// required and the post must be visible to the sender and written by the other
// side (see canQuotePost).
const postReplyError = async (
  sender: SocialActor,
  postId: number | undefined,
  body: string,
  traineeId: number,
) => {
  if (postId === undefined) {
    return null;
  }
  if (body === "") {
    return CHAT_MESSAGES.POST_NEEDS_TEXT;
  }
  return (await canQuotePost(sender, postId, traineeId))
    ? null
    : CHAT_MESSAGES.POST_NOT_FOUND;
};

// Trainee send. The conversation always comes from the session user, never
// from the client. insertMessage is idempotent: a retried clientId returns
// the stored message. No send limit (D13, Hoan 2026-11-04).
export const sendMessageAction = withResultErrorHandling(
  "sendChatMessage",
  async (input: SendInput): Promise<SendResult> => {
    const user = await requireUser();

    if (!isChatEnabled(user)) {
      return fail(CHAT_MESSAGES.CHAT_LOCKED);
    }
    const parsed = sendMessageSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const { clientId, replyToMessageId, postId } = parsed.data;
    const sender = actorOfUser(user);

    if (
      !(await ownsStickerInput(
        { kind: "user", id: user.id },
        parsed.data.sticker,
      ))
    ) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const resolved = resolveContent(parsed.data);

    if (!resolved) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const conversation = await getOrCreateConversation(user.id);

    const retried = await findRetry(conversation, parsed.data, sender);

    if (retried) {
      return { status: "success", message: retried };
    }
    if (
      parsed.data.photoId !== undefined &&
      !(await isPhotoAttachable(
        parsed.data.photoId,
        conversation.id,
        photoUploaderKey({ kind: "user" }),
      ))
    ) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const postError = await postReplyError(
      sender,
      postId,
      resolved.content.body,
      user.id,
    );

    if (postError) {
      return fail(postError);
    }
    if (!(await isReplyTargetValid(conversation, replyToMessageId))) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const { message, created } = await insertMessageOnce(
      {
        conversationId: conversation.id,
        senderRole: "user",
        senderAdminId: null,
        ...resolved.content,
        clientId,
        replyToMessageId,
        replyPostId: postId ?? null,
      },
      sender,
    );

    if (created && parsed.data.photoId !== undefined) {
      await attachPhotoToMessage(parsed.data.photoId, message.id);
    }
    // After the DB write; publishChatEvent never throws. A retried send
    // republishes the stored message, clients dedupe by id.
    await publishNewMessage(conversation.id, message);
    // Push only for a new row, never for a retried clientId, and never for a
    // silent (/imlang) message.
    if (created && !resolved.silent) {
      schedulePush({
        senderRole: "user",
        traineeUserId: user.id,
        conversationId: conversation.id,
        body: resolved.content.body,
        ...(parsed.data.sticker ? { sticker: true } : {}),
        ...(parsed.data.photoId === undefined ? {} : { photo: true }),
      });
    }
    return { status: "success", message };
  },
);

const adminSendSchema = sendMessageShape
  .extend({ userId: z.number().int().positive() })
  .refine(hasBodyOrSticker);

// Admin reply to one trainee. D6: a locked trainee cannot be written to either.
export const adminSendMessageAction = withResultErrorHandling(
  "adminSendChatMessage",
  async (input: SendInput & { userId: number }): Promise<SendResult> => {
    const admin = await requireAdmin();
    const parsed = adminSendSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const { userId, clientId, replyToMessageId, postId } = parsed.data;

    await requireAdminForUser(userId);
    const sender = actorOfAdmin({
      id: admin.id,
      role: toAdminRole(admin.role),
    });
    const trainee = await findUserById(userId);

    if (!trainee) {
      return fail(CHAT_MESSAGES.USER_NOT_FOUND);
    }
    if (!isChatEnabled(trainee)) {
      return fail(CHAT_MESSAGES.CHAT_LOCKED);
    }
    if (
      !(await ownsStickerInput(
        { kind: "admin", id: admin.id },
        parsed.data.sticker,
      ))
    ) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const resolved = resolveContent(parsed.data);

    if (!resolved) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const conversation = await getOrCreateConversation(trainee.id);

    const retried = await findRetry(conversation, parsed.data, sender);

    if (retried) {
      return { status: "success", message: retried };
    }
    if (
      parsed.data.photoId !== undefined &&
      !(await isPhotoAttachable(
        parsed.data.photoId,
        conversation.id,
        photoUploaderKey({ kind: "admin", id: admin.id }),
      ))
    ) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const postError = await postReplyError(
      sender,
      postId,
      resolved.content.body,
      trainee.id,
    );

    if (postError) {
      return fail(postError);
    }
    if (!(await isReplyTargetValid(conversation, replyToMessageId))) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    const { message, created } = await insertMessageOnce(
      {
        conversationId: conversation.id,
        senderRole: "admin",
        senderAdminId: admin.id,
        ...resolved.content,
        clientId,
        replyToMessageId,
        replyPostId: postId ?? null,
      },
      sender,
    );

    // After the DB write; publishChatEvent never throws. A retried send
    // republishes the stored message, clients dedupe by id.
    if (created && parsed.data.photoId !== undefined) {
      await attachPhotoToMessage(parsed.data.photoId, message.id);
    }
    await publishNewMessage(conversation.id, message);
    if (created && !resolved.silent) {
      schedulePush({
        senderRole: "admin",
        senderAdminId: admin.id,
        traineeUserId: trainee.id,
        conversationId: conversation.id,
        body: resolved.content.body,
        ...(parsed.data.sticker ? { sticker: true } : {}),
        ...(parsed.data.photoId === undefined ? {} : { photo: true }),
      });
    }
    return { status: "success", message };
  },
);

// Trainee reaction, edit and unsend (KAN-138). Same rules as sending: the
// conversation comes from the session and a locked chat is read-only.
const withTraineeConversation = async <T>(
  run: (
    actor: ChatActor,
    conversation: { id: number; userId: number },
  ) => Promise<T>,
) => {
  const user = await requireUser();

  if (!isChatEnabled(user)) {
    return fail(CHAT_MESSAGES.CHAT_LOCKED);
  }
  const conversation = await findConversationByUserId(user.id);

  if (!conversation) {
    return fail(CHAT_MESSAGES.CONVERSATION_NOT_FOUND);
  }
  return run({ role: "user", userId: user.id, name: user.name }, conversation);
};

export const reactMessageAction = withResultErrorHandling(
  "reactChatMessage",
  async (input: { messageId: number; emoji: string | null }) =>
    withTraineeConversation((actor, conversation) =>
      reactToMessage(actor, conversation, input),
    ),
);

export const editMessageAction = withResultErrorHandling(
  "editChatMessage",
  async (input: { messageId: number; body: string }) =>
    withTraineeConversation((actor, conversation) =>
      editChatMessage(actor, conversation, input),
    ),
);

export const unsendMessageAction = withResultErrorHandling(
  "unsendChatMessage",
  async (input: { messageId: number }) =>
    withTraineeConversation((actor, conversation) =>
      unsendChatMessage(actor, conversation, input),
    ),
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
    await requireAdminForUser(conversation.userId);
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
