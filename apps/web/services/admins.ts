import "server-only";

import { eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminHiddenUsers, admins } from "@/db/schema";
import { toAdminRole } from "@/services/admin-scope";
import { toUsernameKey } from "@/utils/username";

export const findAdminById = async (id: number) => {
  const [admin] = await db
    .select({
      id: admins.id,
      username: admins.username,
      role: admins.role,
      verifiedAt: admins.verifiedAt,
      locale: admins.locale,
      presenceHidden:
        sql<boolean>`coalesce(${admins.presenceHidden}, 0)`.mapWith(Boolean),
      // Never expose the hash itself, only whether a passcode exists.
      hasPasscode: sql<boolean>`${admins.passcodeHash} is not null`.mapWith(
        Boolean,
      ),
    })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  if (!admin) {
    return null;
  }
  const { role, verifiedAt, ...rest } = admin;

  // Null role = super admin (admins created before roles existed).
  return { ...rest, role: toAdminRole(role), verified: verifiedAt !== null };
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
    .set({
      passcodeFailedCount: sql`coalesce(${admins.passcodeFailedCount}, 0) + 1`,
    })
    .where(eq(admins.id, id))
    .returning({ count: admins.passcodeFailedCount });

  return Number(row?.count ?? 0);
};

export const resetPasscodeFailures = async (id: number) => {
  await db
    .update(admins)
    .set({ passcodeFailedCount: 0 })
    .where(eq(admins.id, id));
};

export const countHiddenUsers = async (adminId: number) => {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(adminHiddenUsers)
    .where(eq(adminHiddenUsers.adminId, adminId));

  return row?.total ?? 0;
};

// Ids of admins with the blue tick, for trainee-facing chat screens.
export const listVerifiedAdminIds = async () => {
  const rows = await db
    .select({ id: admins.id })
    .from(admins)
    .where(isNotNull(admins.verifiedAt));

  return rows.map((row) => row.id);
};

export const setAdminLocale = async (id: number, locale: string) => {
  await db.update(admins).set({ locale }).where(eq(admins.id, id));
};
