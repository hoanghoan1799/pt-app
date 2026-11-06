import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  admins,
  chatColorOverrides,
  chatConversations,
  chatNicknames,
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
  nicknameSchema,
  parseAdminTarget,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";

// Nicknames and bubble colours (KAN-141). The callers have already checked
// the session, that the caller is in the conversation and the chat lock.

// What both clients get with the thread. Keys are "user", "pt" and
// "admin:<id>"; entries exist only when set. `colors` is already resolved:
// an admin's per-conversation override wins over their account colour.
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

export const loadChatProfile = async (
  conversationId: number,
): Promise<ChatProfile> => {
  const [nicknameRows, overrideRows, adminRows, [trainee]] = await Promise.all([
    db
      .select({
        targetKey: chatNicknames.targetKey,
        nickname: chatNicknames.nickname,
      })
      .from(chatNicknames)
      .where(eq(chatNicknames.conversationId, conversationId)),
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
      .select({ color: users.chatColor })
      .from(chatConversations)
      .innerJoin(users, eq(users.id, chatConversations.userId))
      .where(eq(chatConversations.id, conversationId)),
  ]);
  const nicknames: Record<string, string> = {};
  const colors: Record<string, ChatColorKey> = {};

  for (const row of nicknameRows) {
    nicknames[row.targetKey] = row.nickname;
  }
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

const done = async (conversationId: number): Promise<ProfileResult> => {
  await bumpConversationChange(conversationId);
  await publishProfileUpdate(conversationId);
  return { status: "success", profile: await loadChatProfile(conversationId) };
};

const unchanged = async (conversationId: number): Promise<ProfileResult> => ({
  status: "success",
  profile: await loadChatProfile(conversationId),
});

// Anyone in the conversation may set or clear any of its nicknames, their own
// included (D1). An empty nickname clears it; saving the same value is a
// no-op (no cursor bump, no event).
export const setConversationNickname = async (
  conversationId: number,
  setByKey: string,
  input: unknown,
): Promise<ProfileResult> => {
  const parsed = nicknameSchema.safeParse(input);

  if (!parsed.success) {
    return fail(CHAT_MESSAGES.NICKNAME_INVALID);
  }
  const { target, nickname } = parsed.data;
  const adminId = parseAdminTarget(target);

  if (adminId !== null) {
    const [admin] = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.id, adminId))
      .limit(1);

    if (!admin) {
      return fail(CHAT_MESSAGES.ADMIN_NOT_FOUND);
    }
  }
  const [existing] = await db
    .select({ nickname: chatNicknames.nickname })
    .from(chatNicknames)
    .where(
      and(
        eq(chatNicknames.conversationId, conversationId),
        eq(chatNicknames.targetKey, target),
      ),
    );

  if ((existing?.nickname ?? "") === nickname) {
    return unchanged(conversationId);
  }
  if (nickname === "") {
    await db
      .delete(chatNicknames)
      .where(
        and(
          eq(chatNicknames.conversationId, conversationId),
          eq(chatNicknames.targetKey, target),
        ),
      );
  } else {
    await db
      .insert(chatNicknames)
      .values({
        conversationId,
        targetKey: target,
        nickname,
        setByKey,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [chatNicknames.conversationId, chatNicknames.targetKey],
        set: { nickname, setByKey, updatedAt: new Date() },
      });
  }
  return done(conversationId);
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
  return done(conversationId);
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
  return done(conversationId);
};
