"use server";

import { z } from "zod";

import { HIDDEN_CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  hideConversations,
  isConversationHidden,
  listRevealedHidden,
  noMatch,
  unhideConversation,
} from "@/features/chat/services/chat-hidden";
import { withResultErrorHandling } from "@/services/action-errors";
import { callApi, tryApi } from "@/services/api/call";
import { requireAdmin } from "@/services/auth-guard";
import { getActiveLocale } from "@/services/localize-message";

const idSchema = z.number().int().positive();
const idsSchema = z.array(idSchema).min(1).max(100);
const passcodeSchema = z.string().regex(/^\d{4}$/);

const invalid = () => ({
  status: "error" as const,
  message: HIDDEN_CHAT_MESSAGES.INVALID_INPUT,
});

// Conversation-based entry points (inbox "Chọn" mode, chat settings sheet):
// the conversation maps to its trainee.
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

export const hideUsersAction = withResultErrorHandling(
  "hideUsers",
  async (userIds: number[]) => {
    await requireAdmin();
    const parsed = idsSchema.safeParse(userIds);

    if (!parsed.success) {
      return invalid();
    }
    // The API needs a passcode (PASSCODE_REQUIRED) and ignores unknown ids and
    // trainees outside this admin's workspace.
    const { hidden } = await callApi("admin", (api) =>
      api.POST("/v1/admins/me/hidden-users", {
        body: { userIds: parsed.data },
      }),
    );

    return { status: "success" as const, hidden };
  },
);

export const unhideUserAction = withResultErrorHandling(
  "unhideUser",
  async (userId: number) => {
    await requireAdmin();
    const parsed = idSchema.safeParse(userId);

    if (!parsed.success) {
      return invalid();
    }
    await callApi("admin", (api) =>
      api.DELETE("/v1/admins/me/hidden-users/{userId}", {
        params: { path: { userId: parsed.data } },
      }),
    );
    return { status: "success" as const };
  },
);

// Anything but a well-formed 4-digit code is a quiet generic failure without
// touching the limiter, so ordinary name searches never burn attempts. A right
// code also starts the 10-minute reveal session (R2, on the API): the hidden trainees'
// pages open until it ends.
export const revealHiddenUsersAction = withResultErrorHandling(
  "revealHiddenUsers",
  async (passcode: string) => {
    const admin = await requireAdmin();
    const parsed = passcodeSchema.safeParse(passcode);

    if (!parsed.success) {
      return noMatch();
    }
    // The API checks the code (own limiter, same answer for every failure) and
    // opens the 10-minute reveal window on the admin's session.
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/admins/me/hidden-users/reveal", { body: { passcode } }),
    );

    // A refused request (rate limited, limited admin) is the same quiet miss.
    return outcome.ok && outcome.data.revealed
      ? listRevealedHidden(admin.id, await getActiveLocale())
      : noMatch();
  },
);

// The inbox search box keeps its original name.
export const revealHiddenConversationsAction = revealHiddenUsersAction;

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
