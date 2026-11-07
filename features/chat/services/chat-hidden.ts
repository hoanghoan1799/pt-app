import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { chatConversations, chatHiddenConversations } from "@/db/schema";
import { HIDDEN_CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  type InboxItem,
  listHiddenInboxForAdmin,
} from "@/features/chat/services/chat-queries";
import { findAdminSecrets } from "@/services/admins";
import {
  clearAttempts,
  isLocked,
  passcodeRevealLimiterKey,
  recordFailure,
} from "@/services/login-limiter";
import { verifyPassword } from "@/services/password";

export type HideResult =
  { status: "success"; hidden: number } | { status: "error"; message: string };

export type RevealResult =
  | { status: "success"; conversations: InboxItem[] }
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
    .select({ adminId: chatHiddenConversations.adminId })
    .from(chatHiddenConversations)
    .where(
      and(
        eq(chatHiddenConversations.adminId, adminId),
        eq(chatHiddenConversations.conversationId, conversationId),
      ),
    )
    .limit(1);

  return Boolean(row);
};

// Hides conversations for this admin only. Needs a passcode (Q3); unknown ids
// are ignored and a repeat is a no-op.
export const hideConversations = async (
  adminId: number,
  conversationIds: number[],
): Promise<HideResult> => {
  const secrets = await findAdminSecrets(adminId);

  if (!secrets?.passcodeHash) {
    return { status: "error", message: HIDDEN_CHAT_MESSAGES.PASSCODE_REQUIRED };
  }
  const ids = [...new Set(conversationIds)];
  const existing = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(inArray(chatConversations.id, ids));

  if (existing.length > 0) {
    await db
      .insert(chatHiddenConversations)
      .values(existing.map((row) => ({ adminId, conversationId: row.id })))
      .onConflictDoNothing();
  }
  return { status: "success", hidden: existing.length };
};

export const unhideConversation = async (
  adminId: number,
  conversationId: number,
) => {
  await db
    .delete(chatHiddenConversations)
    .where(
      and(
        eq(chatHiddenConversations.adminId, adminId),
        eq(chatHiddenConversations.conversationId, conversationId),
      ),
    );
};

// The inbox search box calls this with whatever was typed. Only the right
// passcode returns anything; every other outcome (wrong code, no passcode,
// rate limited) is the same "no-match", so it leaks nothing. Wrong codes use
// their own limiter key and never count toward the lock sign-out (Q5).
export const revealHiddenConversations = async (
  adminId: number,
  passcode: string,
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
  return {
    status: "success",
    conversations: await listHiddenInboxForAdmin(adminId),
  };
};
