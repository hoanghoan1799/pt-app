"use server";

import { z } from "zod";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  setAdminAccountColor,
  setAdminConversationColor,
  setTraineeColor,
} from "@/features/chat/services/chat-profile";
import { loadMyChatState } from "@/features/chat/services/chat-queries";
import { colorSchema } from "@/features/chat/utils/chat-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";

// Bubble colours (KAN-141, spec D2-D4); nicknames are private aliases
// (contact-aliases). Results are
// `{ status: "success", profile } | { status: "error", message }`. The API
// decides the chat lock and who may act in a conversation.

const fail = (message: string) => ({ status: "error" as const, message });

const conversationIdSchema = z.number().int().positive();

// color: a palette key, or null for the default.
export const setChatColorAction = withResultErrorHandling(
  "setChatColor",
  async (input: { color: string | null }) => {
    await requireUser();
    const parsed = colorSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.COLOR_INVALID);
    }
    return setTraineeColor(
      parsed.data,
      async () => (await loadMyChatState()).profile,
    );
  },
);

export const adminSetChatColorAction = withResultErrorHandling(
  "adminSetChatColor",
  async (input: { color: string | null }) => {
    await requireAdmin();
    const parsed = colorSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.COLOR_INVALID);
    }
    return setAdminAccountColor(parsed.data);
  },
);

// Colour of this admin in one conversation only; null removes the override.
export const adminSetConversationColorAction = withResultErrorHandling(
  "adminSetChatConversationColor",
  async (input: { conversationId: number; color: string | null }) => {
    await requireAdmin();
    const id = conversationIdSchema.safeParse(input?.conversationId);
    const parsed = colorSchema.safeParse(input);

    if (!id.success || !parsed.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    return setAdminConversationColor(id.data, parsed.data);
  },
);
