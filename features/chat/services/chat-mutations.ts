import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { chatMessageEdits, chatMessages, chatReactions } from "@/db/schema";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { scheduleReactionPush } from "@/features/chat/services/chat-push";
import {
  type ChatMessage,
  findMessageById,
  findStoredMessage,
  touchMessage,
} from "@/features/chat/services/chat-queries";
import { publishMessageUpdate } from "@/features/chat/services/chat-realtime";
import {
  adminReaderKey,
  editSchema,
  reactSchema,
  unsendSchema,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";

// Shared by the trainee and admin actions (KAN-138). The callers have already
// checked the session and the chat lock; this module checks that the message
// belongs to the caller's conversation and that the caller may change it.
// Message bodies are never logged.

export type ChatActor =
  | { role: "user"; userId: number; name: string }
  | { role: "admin"; adminId: number; name: string };

export interface ChatConversationRef {
  id: number;
  userId: number;
}

export type MutationResult =
  | { status: "success"; message: ChatMessage }
  | { status: "error"; message: string };

const fail = (message: string): MutationResult => ({
  status: "error",
  message,
});

const reactorKeyOf = (actor: ChatActor) =>
  actor.role === "user" ? USER_READER_KEY : adminReaderKey(actor.adminId);

// A message id from another conversation answers "not found", never "not
// yours", so ids cannot be probed across conversations.
const loadStored = async (
  conversation: ChatConversationRef,
  messageId: number,
) => {
  const stored = await findStoredMessage(messageId);

  return stored && stored.conversationId === conversation.id ? stored : null;
};

type StoredMessage = NonNullable<Awaited<ReturnType<typeof findStoredMessage>>>;

const isOwnMessage = (actor: ChatActor, stored: StoredMessage) =>
  actor.role === "user"
    ? stored.senderRole === "user"
    : stored.senderRole === "admin" && stored.senderAdminId === actor.adminId;

// Stamps the change cursor, tells the open conversations (ids only) and
// returns the message as clients see it.
const finish = async (
  conversation: ChatConversationRef,
  messageId: number,
): Promise<MutationResult> => {
  await touchMessage(conversation.id, messageId);
  await publishMessageUpdate(conversation.id, messageId);
  const message = await findMessageById(messageId);

  return message
    ? { status: "success", message }
    : fail(CHAT_MESSAGES.MESSAGE_NOT_FOUND);
};

const current = async (messageId: number): Promise<MutationResult> => {
  const message = await findMessageById(messageId);

  return message
    ? { status: "success", message }
    : fail(CHAT_MESSAGES.MESSAGE_NOT_FOUND);
};

const notifyAuthor = (
  actor: ChatActor,
  conversation: ChatConversationRef,
  stored: StoredMessage,
  emoji: string,
) => {
  if (stored.senderRole === "user") {
    if (actor.role === "user") {
      return;
    }
    scheduleReactionPush({
      recipient: { role: "user", userId: conversation.userId },
      reactorName: actor.name,
      emoji,
      traineeUserId: conversation.userId,
      conversationId: conversation.id,
    });
    return;
  }
  if (
    stored.senderAdminId === null ||
    (actor.role === "admin" && actor.adminId === stored.senderAdminId)
  ) {
    return;
  }
  scheduleReactionPush({
    recipient: { role: "admin", adminId: stored.senderAdminId },
    reactorName: actor.name,
    emoji,
    traineeUserId: conversation.userId,
    conversationId: conversation.id,
  });
};

// One reaction per reactor per message: another emoji replaces it, the same
// emoji or null removes it. Only adding or replacing pushes the author.
export const reactToMessage = async (
  actor: ChatActor,
  conversation: ChatConversationRef,
  input: unknown,
): Promise<MutationResult> => {
  const parsed = reactSchema.safeParse(input);

  if (!parsed.success) {
    return fail(CHAT_MESSAGES.INVALID_INPUT);
  }
  const { messageId, emoji } = parsed.data;
  const stored = await loadStored(conversation, messageId);

  if (!stored) {
    return fail(CHAT_MESSAGES.MESSAGE_NOT_FOUND);
  }
  if (stored.deletedAt !== null) {
    return fail(CHAT_MESSAGES.MESSAGE_UNSENT);
  }
  const reactorKey = reactorKeyOf(actor);
  const [existing] = await db
    .select({ emoji: chatReactions.emoji })
    .from(chatReactions)
    .where(
      and(
        eq(chatReactions.messageId, messageId),
        eq(chatReactions.reactorKey, reactorKey),
      ),
    );

  if (emoji === null || existing?.emoji === emoji) {
    if (!existing) {
      return current(messageId);
    }
    await db
      .delete(chatReactions)
      .where(
        and(
          eq(chatReactions.messageId, messageId),
          eq(chatReactions.reactorKey, reactorKey),
        ),
      );
    return finish(conversation, messageId);
  }
  await db
    .insert(chatReactions)
    .values({ messageId, reactorKey, emoji, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [chatReactions.messageId, chatReactions.reactorKey],
      set: { emoji, createdAt: new Date() },
    });
  const result = await finish(conversation, messageId);

  notifyAuthor(actor, conversation, stored, emoji);
  return result;
};

// Own messages only, no time limit. The previous body is kept so both people
// in the conversation can open the history.
export const editChatMessage = async (
  actor: ChatActor,
  conversation: ChatConversationRef,
  input: unknown,
): Promise<MutationResult> => {
  const parsed = editSchema.safeParse(input);

  if (!parsed.success) {
    return fail(CHAT_MESSAGES.INVALID_INPUT);
  }
  const { messageId, body } = parsed.data;
  const stored = await loadStored(conversation, messageId);

  if (!stored) {
    return fail(CHAT_MESSAGES.MESSAGE_NOT_FOUND);
  }
  if (!isOwnMessage(actor, stored)) {
    return fail(CHAT_MESSAGES.NOT_YOUR_MESSAGE);
  }
  if (stored.deletedAt !== null) {
    return fail(CHAT_MESSAGES.MESSAGE_UNSENT);
  }
  // Saving the same text again is not an edit: no history row, no marker.
  if (stored.body === body) {
    return current(messageId);
  }
  const editedAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(chatMessageEdits)
      .values({ messageId, previousBody: stored.body, editedAt });
    await tx
      .update(chatMessages)
      .set({ body, editedAt })
      .where(eq(chatMessages.id, messageId));
  });
  return finish(conversation, messageId);
};

// Unsend for everyone: soft delete, idempotent.
export const unsendChatMessage = async (
  actor: ChatActor,
  conversation: ChatConversationRef,
  input: unknown,
): Promise<MutationResult> => {
  const parsed = unsendSchema.safeParse(input);

  if (!parsed.success) {
    return fail(CHAT_MESSAGES.INVALID_INPUT);
  }
  const { messageId } = parsed.data;
  const stored = await loadStored(conversation, messageId);

  if (!stored) {
    return fail(CHAT_MESSAGES.MESSAGE_NOT_FOUND);
  }
  if (!isOwnMessage(actor, stored)) {
    return fail(CHAT_MESSAGES.NOT_YOUR_MESSAGE);
  }
  if (stored.deletedAt !== null) {
    return current(messageId);
  }
  await db
    .update(chatMessages)
    .set({ deletedAt: new Date() })
    .where(eq(chatMessages.id, messageId));
  return finish(conversation, messageId);
};

// The reply target of a new message must be a message of the same
// conversation; unknown and foreign ids are both just invalid.
export const isReplyTargetValid = async (
  conversation: ChatConversationRef,
  replyToMessageId: number | undefined,
) =>
  replyToMessageId === undefined ||
  (await loadStored(conversation, replyToMessageId)) !== null;
