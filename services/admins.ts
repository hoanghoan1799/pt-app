import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { admins, chatHiddenConversations } from "@/db/schema";
import { toUsernameKey } from "@/utils/username";

export const findAdminById = async (id: number) => {
  const [admin] = await db
    .select({
      id: admins.id,
      username: admins.username,
      presenceHidden: admins.presenceHidden,
      // Never expose the hash itself, only whether a passcode exists.
      hasPasscode: sql<boolean>`${admins.passcodeHash} is not null`.mapWith(
        Boolean,
      ),
    })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  return admin ?? null;
};

export const findAdminByUsername = async (username: string) => {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.usernameKey, toUsernameKey(username)))
    .limit(1);

  return admin ?? null;
};

// Passcode state (KAN-160). Hashes stay inside this module's callers.
export const findAdminSecrets = async (id: number) => {
  const [row] = await db
    .select({
      passwordHash: admins.passwordHash,
      passcodeHash: admins.passcodeHash,
    })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  return row ?? null;
};

export const setAdminPasscodeHash = async (
  id: number,
  passcodeHash: string | null,
) => {
  await db
    .update(admins)
    .set({ passcodeHash, passcodeFailedCount: 0 })
    .where(eq(admins.id, id));
};

// Atomic increment, so two parallel wrong guesses both count. Returns the new
// count.
export const recordPasscodeFailure = async (id: number) => {
  const [row] = await db
    .update(admins)
    .set({ passcodeFailedCount: sql`${admins.passcodeFailedCount} + 1` })
    .where(eq(admins.id, id))
    .returning({ count: admins.passcodeFailedCount });

  return row?.count ?? 0;
};

export const resetPasscodeFailures = async (id: number) => {
  await db
    .update(admins)
    .set({ passcodeFailedCount: 0 })
    .where(eq(admins.id, id));
};

export const countHiddenConversations = async (adminId: number) => {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(chatHiddenConversations)
    .where(eq(chatHiddenConversations.adminId, adminId));

  return row?.total ?? 0;
};
