import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { adminHiddenUsers, chatConversations, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { HIDDEN_CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  type InboxItem,
  type InboxWithoutConversation,
  listHiddenInboxForAdmin,
  listTraineeNicknames,
} from "@/features/chat/services/chat-queries";
import { resolveDisplayName } from "@/features/chat/utils/display-name";
import { adminScopeFilter } from "@/services/admin-scope";
import { findAdminSecrets } from "@/services/admins";
import { isUserHidden } from "@/services/hidden-users";
import {
  clearAttempts,
  isLocked,
  passcodeRevealLimiterKey,
  recordFailure,
} from "@/services/login-limiter";
import { verifyPassword } from "@/services/password";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

export interface HiddenUser {
  userId: number;
  userName: string;
  // The nickname an admin set, else the real name (same as the inbox).
  displayName: string;
  avatarUrl: string | null;
}

export type HideResult =
  { status: "success"; hidden: number } | { status: "error"; message: string };

export type RevealResult =
  | {
      status: "success";
      // Every trainee this admin hid, by name.
      users: HiddenUser[];
      // The same trainees in inbox shape: with a conversation, and without.
      conversations: InboxItem[];
      withoutConversation: InboxWithoutConversation[];
    }
  | { status: "error"; message: string };

// Generic on purpose: no detail on why (wrong code, no passcode, limited).
export const noMatch = (): { status: "error"; message: string } => ({
  status: "error",
  message: HIDDEN_CHAT_MESSAGES.NO_MATCH,
});

export const isConversationHidden = async (
  adminId: number,
  conversationId: number,
) => {
  const [row] = await db
    .select({ userId: chatConversations.userId })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  return row ? isUserHidden(adminId, row.userId) : false;
};

// Hides trainees for this admin only, with or without a conversation. Needs a
// passcode (Q3); unknown ids are ignored and a repeat is a no-op.
export const hideUsers = async (
  adminId: number,
  userIds: number[],
): Promise<HideResult> => {
  const secrets = await findAdminSecrets(adminId);

  if (!secrets?.passcodeHash) {
    return { status: "error", message: HIDDEN_CHAT_MESSAGES.PASSCODE_REQUIRED };
  }
  const ids = [...new Set(userIds)];
  const existing =
    ids.length === 0
      ? []
      : await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, ids), adminScopeFilter(adminId)));

  if (existing.length > 0) {
    await db
      .insert(adminHiddenUsers)
      .values(existing.map((row) => ({ adminId, userId: row.id })))
      .onConflictDoNothing();
  }
  return { status: "success", hidden: existing.length };
};

export const unhideUser = async (adminId: number, userId: number) => {
  await db
    .delete(adminHiddenUsers)
    .where(
      and(
        eq(adminHiddenUsers.adminId, adminId),
        eq(adminHiddenUsers.userId, userId),
      ),
    );
};

// Conversation-based wrappers for the inbox and the chat sheet: a
// conversation maps to its trainee.
export const hideConversations = async (
  adminId: number,
  conversationIds: number[],
): Promise<HideResult> => {
  const ids = [...new Set(conversationIds)];
  const owners =
    ids.length === 0
      ? []
      : await db
          .select({ userId: chatConversations.userId })
          .from(chatConversations)
          .where(inArray(chatConversations.id, ids));

  return hideUsers(
    adminId,
    owners.map((row) => row.userId),
  );
};

export const unhideConversation = async (
  adminId: number,
  conversationId: number,
) => {
  const [row] = await db
    .select({ userId: chatConversations.userId })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  if (row) {
    await unhideUser(adminId, row.userId);
  }
};

const listHiddenUsers = async (adminId: number): Promise<HiddenUser[]> => {
  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(adminHiddenUsers)
    .innerJoin(users, eq(users.id, adminHiddenUsers.userId))
    .where(eq(adminHiddenUsers.adminId, adminId))
    .orderBy(asc(users.nameKey));

  const nicknames = await listTraineeNicknames(rows.map((row) => row.userId));

  return rows.map(({ avatarUpdatedAt, ...row }) => ({
    ...row,
    displayName: resolveDisplayName(nicknames.get(row.userId), row.userName),
    avatarUrl: avatarUrl("user", row.userId, avatarUpdatedAt),
  }));
};

// The search boxes call this with whatever was typed. Only the right passcode
// returns anything; every other outcome (wrong code, no passcode, rate
// limited) is the same "no-match", so it leaks nothing. Wrong codes use their
// own limiter key and never count toward the lock sign-out (Q5). The caller
// (the server action) sets the reveal cookie on success.
export const revealHiddenUsers = async (
  adminId: number,
  passcode: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<RevealResult> => {
  const limiterKey = passcodeRevealLimiterKey(adminId);

  if (await isLocked(limiterKey)) {
    return noMatch();
  }
  const secrets = await findAdminSecrets(adminId);

  if (
    !secrets?.passcodeHash ||
    !(await verifyPassword(passcode, secrets.passcodeHash))
  ) {
    await recordFailure(limiterKey);
    return noMatch();
  }
  await clearAttempts(limiterKey);

  const [hiddenUsers, inbox] = await Promise.all([
    listHiddenUsers(adminId),
    listHiddenInboxForAdmin(adminId, locale),
  ]);

  return {
    status: "success",
    users: hiddenUsers,
    conversations: inbox.conversations,
    withoutConversation: inbox.withoutConversation,
  };
};
