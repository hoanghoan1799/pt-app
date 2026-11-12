import "server-only";

import { eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { admins } from "@/db/schema";

// Legacy reads, kept only for the chat pages still on Drizzle. The admin's
// profile, passcode, locale and settings are the API's now (GET /v1/auth/me,
// /v1/admins/me, /v1/me/locale, /v1/admins/me/passcode…). Delete this file with
// the last of these callers.

// Passcode hash for the legacy hide-by-conversation path (chat-hidden.ts).
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

// Ids of admins with the blue tick, for trainee-facing chat screens.
export const listVerifiedAdminIds = async () => {
  const rows = await db
    .select({ id: admins.id })
    .from(admins)
    .where(isNotNull(admins.verifiedAt));

  return rows.map((row) => row.id);
};
