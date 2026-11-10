"use server";

import { z } from "zod";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  setAdminAccountColor,
  setAdminConversationColor,
  setTraineeColor,
} from "@/features/chat/services/chat-profile";
import {
  findConversationById,
  getOrCreateConversation,
} from "@/features/chat/services/chat-queries";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdminForUser } from "@/services/admin-access";
import { requireAdmin, requireUser } from "@/services/auth-guard";
import { findUserById } from "@/services/users";

// Bubble colours (KAN-141, spec D2-D4); nicknames are private aliases now
// (contact-aliases). Results are
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
  await requireAdminForUser(trainee.id);
  if (!isChatEnabled(trainee)) {
    return fail(CHAT_MESSAGES.CHAT_LOCKED);
  }
  return run(admin, conversation.id);
};

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
