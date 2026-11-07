"use server";

import { z } from "zod";

import { HIDDEN_CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  hideConversations,
  isConversationHidden,
  noMatch,
  revealHiddenConversations,
  unhideConversation,
} from "@/features/chat/services/chat-hidden";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin } from "@/services/auth-guard";

const idSchema = z.number().int().positive();
const idsSchema = z.array(idSchema).min(1).max(100);
const passcodeSchema = z.string().regex(/^\d{4}$/);

const invalid = () => ({
  status: "error" as const,
  message: HIDDEN_CHAT_MESSAGES.INVALID_INPUT,
});

export const hideConversationsAction = withResultErrorHandling(
  "hideConversations",
  async (conversationIds: number[]) => {
    const admin = await requireAdmin();
    const parsed = idsSchema.safeParse(conversationIds);

    if (!parsed.success) {
      return invalid();
    }
    return hideConversations(admin.id, parsed.data);
  },
);

export const unhideConversationAction = withResultErrorHandling(
  "unhideConversation",
  async (conversationId: number) => {
    const admin = await requireAdmin();
    const parsed = idSchema.safeParse(conversationId);

    if (!parsed.success) {
      return invalid();
    }
    await unhideConversation(admin.id, parsed.data);
    return { status: "success" as const };
  },
);

// Anything but a well-formed 4-digit code is a quiet generic failure without
// touching the limiter, so ordinary name searches never burn attempts.
export const revealHiddenConversationsAction = withResultErrorHandling(
  "revealHiddenConversations",
  async (passcode: string) => {
    const admin = await requireAdmin();
    const parsed = passcodeSchema.safeParse(passcode);

    if (!parsed.success) {
      return noMatch();
    }
    return revealHiddenConversations(admin.id, parsed.data);
  },
);

export const isConversationHiddenAction = withResultErrorHandling(
  "isConversationHidden",
  async (conversationId: number) => {
    const admin = await requireAdmin();
    const parsed = idSchema.safeParse(conversationId);

    if (!parsed.success) {
      return invalid();
    }
    return {
      status: "success" as const,
      hidden: await isConversationHidden(admin.id, parsed.data),
    };
  },
);
