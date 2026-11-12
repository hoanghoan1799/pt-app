"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  editChatMessage,
  fail,
  reactToMessage,
  unsendChatMessage,
} from "@/features/chat/services/chat-mutations";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { requireAdmin } from "@/services/auth-guard";

const inputSchema = z.object({
  userId: z.number().int().positive(),
  enabled: z.boolean(),
});

// Admin switch: lock or unlock chat for one trainee (S1). The API checks that
// the trainee is in this admin's workspace and tells the open chats.
export const setChatEnabledAction = withResultErrorHandling(
  "setChatEnabled",
  async (userId: number, enabled: boolean) => {
    await requireAdmin();
    const input = inputSchema.parse({ userId, enabled });
    const outcome = await tryApi("admin", (api) =>
      api.PUT("/v1/chat/trainees/{userId}/enabled", {
        params: { path: { userId: input.userId } },
        body: { enabled: input.enabled },
      }),
    );

    if (!outcome.ok) {
      return {
        status: "error" as const,
        message:
          outcome.error.status === 404
            ? CHAT_MESSAGES.USER_NOT_FOUND
            : outcome.error.message,
      };
    }
    revalidatePath(`${ROUTES.ADMIN_USERS}/${input.userId}`);
  },
);

const idsSchema = z.object({
  conversationId: z.number().int().positive(),
  messageId: z.number().int().positive(),
});

// Admin reaction, edit and unsend (KAN-138). Any admin may act in any
// conversation they can read (shared inbox); edit and unsend still only on
// their own messages. A locked trainee makes the thread read-only. The API
// finds the conversation from the message.
const parsedIds = (input: unknown) => idsSchema.safeParse(input);

export const adminReactMessageAction = withResultErrorHandling(
  "adminReactChatMessage",
  async (input: {
    conversationId: number;
    messageId: number;
    emoji: string | null;
  }) => {
    await requireAdmin();
    const ids = parsedIds(input);

    return ids.success
      ? reactToMessage("admin", ids.data.messageId, input.emoji ?? null)
      : fail(CHAT_MESSAGES.INVALID_INPUT);
  },
);

export const adminEditMessageAction = withResultErrorHandling(
  "adminEditChatMessage",
  async (input: {
    conversationId: number;
    messageId: number;
    body: string;
  }) => {
    await requireAdmin();
    const ids = parsedIds(input);

    return ids.success
      ? editChatMessage("admin", ids.data.messageId, input.body)
      : fail(CHAT_MESSAGES.INVALID_INPUT);
  },
);

export const adminUnsendMessageAction = withResultErrorHandling(
  "adminUnsendChatMessage",
  async (input: { conversationId: number; messageId: number }) => {
    await requireAdmin();
    const ids = parsedIds(input);

    return ids.success
      ? unsendChatMessage("admin", ids.data.messageId)
      : fail(CHAT_MESSAGES.INVALID_INPUT);
  },
);
