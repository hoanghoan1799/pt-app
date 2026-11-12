import "server-only";

import {
  and,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { db } from "@/db";
import { chatConversations, users } from "@/db/schema";

// Pure role helpers moved to utils/admin-role.ts (no database); re-exported so
// the areas still on Drizzle keep their imports until they switch.
export { type AdminRole, isSuperAdmin, toAdminRole } from "@/utils/admin-role";

// Trainees this admin may NOT work with: for a PT every trainee outside their
// workspace (users.pt_admin_id), for a super admin none. A subquery, so it
// drops into `notInArray(column, outOfScopeUserIdsOf(adminId))` like
// hiddenUserIdsOf without a round trip or the role in hand.
export const outOfScopeUserIdsOf = (adminId: number) =>
  db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`(select role from admins where id = ${adminId}) = 'pt'`,
        or(isNull(users.ptAdminId), ne(users.ptAdminId, adminId)),
      ),
    );

// The chat conversations of those trainees, for message-level filters.
export const outOfScopeConversationIdsOf = (adminId: number) =>
  db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(inArray(chatConversations.userId, outOfScopeUserIdsOf(adminId)));

// Ids of the conversations this admin may follow (a PT: own trainees).
export const listConversationIdsInScope = async (adminId: number) => {
  const rows = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(adminScopeFilter(adminId, chatConversations.userId));

  return rows.map((row) => row.id);
};

// Condition: `column` (a user id) belongs to a trainee this admin may see.
export const adminScopeFilter = (
  adminId: number,
  column: SQLiteColumn = users.id,
): SQL => notInArray(column, outOfScopeUserIdsOf(adminId));

export const isUserInAdminScope = async (adminId: number, userId: number) => {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`${users.id} = ${userId}`, adminScopeFilter(adminId)))
    .limit(1);

  return Boolean(row);
};
