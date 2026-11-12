import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  admins,
  chatColorOverrides,
  chatConversations,
  users,
} from "@/db/schema";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  bumpAllConversationChanges,
  bumpConversationChange,
} from "@/features/chat/services/chat-queries";
import { publishProfileUpdate } from "@/features/chat/services/chat-realtime";
import {
  type ChatColorKey,
  isChatColorKey,
} from "@/features/chat/utils/chat-palette";
import {
  adminReaderKey,
  colorSchema,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";
import { loadAllAliases } from "@/features/contact-aliases/services/contact-aliases";
import {
  adminActorKey,
  aliasesToConversationNicknames,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";

// Nicknames and bubble colours (KAN-141). The callers have already checked
// the session, that the caller is in the conversation and the chat lock.

// What a client gets with the thread. Keys are "user", "pt" and "admin:<id>";
// entries exist only when set. `nicknames` are the VIEWER'S private aliases
// (contact-aliases) for the other people here, never anybody else's, and
// never one for the viewer. `colors` is already resolved: an admin's
// per-conversation override wins over their account colour.
export interface ChatProfile {
  nicknames: Record<string, string>;
  colors: Record<string, ChatColorKey>;
}

export const EMPTY_CHAT_PROFILE: ChatProfile = { nicknames: {}, colors: {} };

export type ProfileResult =
  | { status: "success"; profile: ChatProfile }
  | { status: "error"; message: string };

const fail = (message: string): ProfileResult => ({
  status: "error",
  message,
});

// `viewerKey` is the signed-in actor ("user:<id>" / "admin:<id>"), taken from
// the session by the caller.
export const loadChatProfile = async (
  conversationId: number,
  viewerKey: string,
): Promise<ChatProfile> => {
  const [aliases, overrideRows, adminRows, [trainee]] = await Promise.all([
    loadAllAliases(viewerKey),
    db
      .select({
        adminId: chatColorOverrides.adminId,
        color: chatColorOverrides.color,
      })
      .from(chatColorOverrides)
      .where(eq(chatColorOverrides.conversationId, conversationId)),
    db
      .select({ id: admins.id, color: admins.chatColor })
      .from(admins)
      .where(isNotNull(admins.chatColor)),
    db
      .select({ userId: users.id, color: users.chatColor })
      .from(chatConversations)
      .innerJoin(users, eq(users.id, chatConversations.userId))
      .where(eq(chatConversations.id, conversationId)),
  ]);
  const colors: Record<string, ChatColorKey> = {};
  const nicknames = trainee
    ? aliasesToConversationNicknames(aliases, {
        viewerKey,
        traineeUserId: trainee.userId,
      })
    : {};

  if (isChatColorKey(trainee?.color)) {
    colors[USER_READER_KEY] = trainee.color;
  }
  for (const row of adminRows) {
    if (isChatColorKey(row.color)) {
      colors[adminReaderKey(row.id)] = row.color;
    }
  }
  for (const row of overrideRows) {
    if (isChatColorKey(row.color)) {
      colors[adminReaderKey(row.adminId)] = row.color;
    }
  }
  return { nicknames, colors };
};

const done = async (
  conversationId: number,
  viewerKey: string,
): Promise<ProfileResult> => {
  await bumpConversationChange(conversationId);
  await publishProfileUpdate(conversationId);
  return {
    status: "success",
    profile: await loadChatProfile(conversationId, viewerKey),
  };
};

// The trainee's own colour. Nobody can set it for them.
export const setTraineeColor = async (
  conversationId: number,
  userId: number,
  input: unknown,
): Promise<ProfileResult> => {
  const parsed = colorSchema.safeParse(input);

  if (!parsed.success) {
    return fail(CHAT_MESSAGES.COLOR_INVALID);
  }
  const rows = await db
    .update(users)
    .set({ chatColor: parsed.data.color })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (rows.length === 0) {
    return fail(CHAT_MESSAGES.USER_NOT_FOUND);
  }
  return done(conversationId, userActorKey(userId));
};

// An admin's account colour: shows in every conversation without an override,
// so every conversation's cursor moves and each one is told.
export const setAdminAccountColor = async (
  adminId: number,
  input: unknown,
): Promise<{ status: "success" } | { status: "error"; message: string }> => {
  const parsed = colorSchema.safeParse(input);

  if (!parsed.success) {
    return { status: "error", message: CHAT_MESSAGES.COLOR_INVALID };
  }
  const rows = await db
    .update(admins)
    .set({ chatColor: parsed.data.color })
    .where(eq(admins.id, adminId))
    .returning({ id: admins.id });

  if (rows.length === 0) {
    return { status: "error", message: CHAT_MESSAGES.ADMIN_NOT_FOUND };
  }
  const conversationIds = await bumpAllConversationChanges();

  await Promise.all(conversationIds.map(publishProfileUpdate));
  return { status: "success" };
};

// An admin's colour for one conversation only; null removes the override.
export const setAdminConversationColor = async (
  conversationId: number,
  adminId: number,
  input: unknown,
): Promise<ProfileResult> => {
  const parsed = colorSchema.safeParse(input);

  if (!parsed.success) {
    return fail(CHAT_MESSAGES.COLOR_INVALID);
  }
  const { color } = parsed.data;

  if (color === null) {
    await db
      .delete(chatColorOverrides)
      .where(
        and(
          eq(chatColorOverrides.conversationId, conversationId),
          eq(chatColorOverrides.adminId, adminId),
        ),
      );
  } else {
    await db
      .insert(chatColorOverrides)
      .values({ conversationId, adminId, color })
      .onConflictDoUpdate({
        target: [chatColorOverrides.conversationId, chatColorOverrides.adminId],
        set: { color },
      });
  }
  return done(conversationId, adminActorKey(adminId));
};

// The admin's saved account colour (null when never picked or unknown), so
// the settings sheet can preselect it.
export const loadAdminAccountColor = async (
  adminId: number,
): Promise<ChatColorKey | null> => {
  const [row] = await db
    .select({ color: admins.chatColor })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);

  return isChatColorKey(row?.color) ? row.color : null;
};
