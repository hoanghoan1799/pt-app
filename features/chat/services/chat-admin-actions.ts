"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  type ChatActor,
  editChatMessage,
  reactToMessage,
  unsendChatMessage,
} from "@/features/chat/services/chat-mutations";
import {
  isChatEnabled,
  setChatEnabled,
} from "@/features/chat/services/chat-permission";
import {
  findConversationById,
  findConversationByUserId,
} from "@/features/chat/services/chat-queries";
import { publishChatStatus } from "@/features/chat/services/chat-realtime";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin } from "@/services/auth-guard";
import { findUserById } from "@/services/users";

const inputSchema = z.object({
  userId: z.number().int().positive(),
  enabled: z.boolean(),
});

// Admin switch: lock or unlock chat for one trainee (S1).
export const setChatEnabledAction = withResultErrorHandling(
  "setChatEnabled",
  async (userId: number, enabled: boolean) => {
    const admin = await requireAdmin();
    const input = inputSchema.parse({ userId, enabled });
    const { updated } = await setChatEnabled(
      input.userId,
      input.enabled,
      admin.id,
    );

    if (!updated) {
      return {
        status: "error" as const,
        message: CHAT_MESSAGES.USER_NOT_FOUND,
      };
    }

    // The switch is already saved: a failed lookup only skips the
    // conversation channel, it never fails the action.
    const conversation = await findConversationByUserId(input.userId).catch(
      () => null,
    );

    await publishChatStatus(
      input.userId,
      conversation?.id ?? null,
      input.enabled,
    );
    revalidatePath(`${ROUTES.ADMIN_USERS}/${input.userId}`);
  },
);

const conversationIdSchema = z.number().int().positive();

// Admin reaction, edit and unsend (KAN-138). Any admin may act in any
// conversation (shared inbox); edit and unsend still only on their own
// messages. Like sending, a locked trainee makes the thread read-only.
const withAdminConversation = async <T>(
  conversationId: number,
  run: (
    actor: ChatActor,
    conversation: { id: number; userId: number },
  ) => Promise<T>,
) => {
  const admin = await requireAdmin();
  const id = conversationIdSchema.safeParse(conversationId);

  if (!id.success) {
    return { status: "error" as const, message: CHAT_MESSAGES.INVALID_INPUT };
  }
  const conversation = await findConversationById(id.data);
  const trainee = conversation ? await findUserById(conversation.userId) : null;

  if (!conversation || !trainee) {
    return {
      status: "error" as const,
      message: CHAT_MESSAGES.CONVERSATION_NOT_FOUND,
    };
  }
  if (!isChatEnabled(trainee)) {
    return { status: "error" as const, message: CHAT_MESSAGES.CHAT_LOCKED };
  }
  return run(
    { role: "admin", adminId: admin.id, name: admin.username },
    conversation,
  );
};

export const adminReactMessageAction = withResultErrorHandling(
  "adminReactChatMessage",
  async (input: {
    conversationId: number;
    messageId: number;
    emoji: string | null;
  }) =>
    withAdminConversation(input?.conversationId, (actor, conversation) =>
      reactToMessage(actor, conversation, input),
    ),
);

export const adminEditMessageAction = withResultErrorHandling(
  "adminEditChatMessage",
  async (input: { conversationId: number; messageId: number; body: string }) =>
    withAdminConversation(input?.conversationId, (actor, conversation) =>
      editChatMessage(actor, conversation, input),
    ),
);

export const adminUnsendMessageAction = withResultErrorHandling(
  "adminUnsendChatMessage",
  async (input: { conversationId: number; messageId: number }) =>
    withAdminConversation(input?.conversationId, (actor, conversation) =>
      unsendChatMessage(actor, conversation, input),
    ),
);
