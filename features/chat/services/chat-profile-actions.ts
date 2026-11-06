"use server";

import { z } from "zod";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  setAdminAccountColor,
  setAdminConversationColor,
  setConversationNickname,
  setTraineeColor,
} from "@/features/chat/services/chat-profile";
import {
  findConversationById,
  getOrCreateConversation,
} from "@/features/chat/services/chat-queries";
import {
  adminReaderKey,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";
import { findUserById } from "@/services/users";

// Nicknames and bubble colours (KAN-141, spec D1-D4). Results are
// `{ status: "success", profile } | { status: "error", message }`. Like
// sending, a locked chat is read-only for everything scoped to a
// conversation; an admin's account colour is not.

const fail = (message: string) => ({ status: "error" as const, message });

const conversationIdSchema = z.number().int().positive();

// The conversation always comes from the session user.
const withTraineeConversation = async <T>(
  run: (user: { id: number }, conversationId: number) => Promise<T>,
) => {
  const user = await requireUser();

  if (!isChatEnabled(user)) {
    return fail(CHAT_MESSAGES.CHAT_LOCKED);
  }
  const conversation = await getOrCreateConversation(user.id);

  return run(user, conversation.id);
};

// Any admin may act in any conversation (shared inbox); an unknown id is
// "not found".
const withAdminConversation = async <T>(
  conversationId: unknown,
  run: (admin: { id: number }, conversationId: number) => Promise<T>,
) => {
  const admin = await requireAdmin();
  const id = conversationIdSchema.safeParse(conversationId);

  if (!id.success) {
    return fail(CHAT_MESSAGES.INVALID_INPUT);
  }
  const conversation = await findConversationById(id.data);
  const trainee = conversation ? await findUserById(conversation.userId) : null;

  if (!conversation || !trainee) {
    return fail(CHAT_MESSAGES.CONVERSATION_NOT_FOUND);
  }
  if (!isChatEnabled(trainee)) {
    return fail(CHAT_MESSAGES.CHAT_LOCKED);
  }
  return run(admin, conversation.id);
};

// target: "user" | "pt" | "admin:<id>"; nickname "" clears it.
export const setNicknameAction = withResultErrorHandling(
  "setChatNickname",
  async (input: { target: string; nickname: string }) =>
    withTraineeConversation((_user, conversationId) =>
      setConversationNickname(conversationId, USER_READER_KEY, input),
    ),
);

export const adminSetNicknameAction = withResultErrorHandling(
  "adminSetChatNickname",
  async (input: { conversationId: number; target: string; nickname: string }) =>
    withAdminConversation(input?.conversationId, (admin, conversationId) =>
      setConversationNickname(conversationId, adminReaderKey(admin.id), input),
    ),
);

// color: a palette key, or null for the default.
export const setChatColorAction = withResultErrorHandling(
  "setChatColor",
  async (input: { color: string | null }) =>
    withTraineeConversation((user, conversationId) =>
      setTraineeColor(conversationId, user.id, input),
    ),
);

export const adminSetChatColorAction = withResultErrorHandling(
  "adminSetChatColor",
  async (input: { color: string | null }) => {
    const admin = await requireAdmin();

    return setAdminAccountColor(admin.id, input);
  },
);

// Colour of this admin in one conversation only; null removes the override.
export const adminSetConversationColorAction = withResultErrorHandling(
  "adminSetChatConversationColor",
  async (input: { conversationId: number; color: string | null }) =>
    withAdminConversation(input?.conversationId, (admin, conversationId) =>
      setAdminConversationColor(conversationId, admin.id, input),
    ),
);
