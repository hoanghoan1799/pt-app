"use server";

import { z } from "zod";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  setAdminAccountColor,
  setAdminConversationColor,
  setAdminNickname,
  setTraineeColor,
  setTraineeNickname,
} from "@/features/chat/services/chat-profile";
import { loadMyChatState } from "@/features/chat/services/chat-queries";
import { colorSchema, nicknameSchema } from "@/features/chat/utils/chat-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";

// Bubble colours (KAN-141, spec D2-D4) and shared nicknames (Messenger style:
// anyone in a conversation names anyone in it, themselves included; the other
// members see the same names; silent, no message and no push). Private aliases
// (contact-aliases) are not used in chat. Results are
// `{ status: "success", profile } | { status: "error", message }`. The API
// decides the chat lock and who may act in a conversation.

const fail = (message: string) => ({ status: "error" as const, message });

const conversationIdSchema = z.number().int().positive();

// target: "user" | "pt" | "admin:<id>"; nickname "" clears it. The trainee acts
// in their own conversation, an admin in the one named by id.
export const setNicknameAction = withResultErrorHandling(
  "setChatNickname",
  async (input: { target: string; nickname: string }) => {
    await requireUser();
    const parsed = nicknameSchema.safeParse(input);

    if (!parsed.success) {
      return fail(CHAT_MESSAGES.NICKNAME_INVALID);
    }
    return setTraineeNickname(parsed.data);
  },
);

export const adminSetNicknameAction = withResultErrorHandling(
  "adminSetChatNickname",
  async (input: { conversationId: number; target: string; nickname: string }) => {
    await requireAdmin();
    const id = conversationIdSchema.safeParse(input?.conversationId);
    const parsed = nicknameSchema.safeParse(input);

    if (!id.success) {
      return fail(CHAT_MESSAGES.INVALID_INPUT);
    }
    if (!parsed.success) {
      return fail(CHAT_MESSAGES.NICKNAME_INVALID);
    }
    return setAdminNickname(id.data, parsed.data);
  },
);

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
