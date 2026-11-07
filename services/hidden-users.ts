import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { adminHiddenUsers, chatConversations } from "@/db/schema";
import { canSeeHiddenUsers } from "@/services/admin-lock";

// Trainees this admin hid (KAN-163). A subquery, so callers can drop it into
// `notInArray(users.id, hiddenUserIdsOf(adminId))` without a round trip.
export const hiddenUserIdsOf = (adminId: number) =>
  db
    .select({ id: adminHiddenUsers.userId })
    .from(adminHiddenUsers)
    .where(eq(adminHiddenUsers.adminId, adminId));

// The conversations of those trainees, for message-level filters.
export const hiddenConversationIdsOf = (adminId: number) =>
  db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .innerJoin(
      adminHiddenUsers,
      and(
        eq(adminHiddenUsers.userId, chatConversations.userId),
        eq(adminHiddenUsers.adminId, adminId),
      ),
    );

export const isUserHidden = async (adminId: number, userId: number) => {
  const [row] = await db
    .select({ adminId: adminHiddenUsers.adminId })
    .from(adminHiddenUsers)
    .where(
      and(
        eq(adminHiddenUsers.adminId, adminId),
        eq(adminHiddenUsers.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(row);
};

// Page / API guard: a hidden trainee is "not found" for the admin who hid it
// unless that admin revealed hidden trainees with the passcode (R2).
export const canAdminAccessUser = async (adminId: number, userId: number) =>
  !(await isUserHidden(adminId, userId)) || (await canSeeHiddenUsers(adminId));
