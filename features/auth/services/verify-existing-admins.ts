import { isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type * as schema from "@/db/schema";
import { admins } from "@/db/schema";

// P1: admins that existed before roles (role null = super admin) get an
// explicit super_admin role and the blue tick, once. Setting the role marks
// the row as migrated, so a tick the super admin removes later is not
// granted again by the next deploy. PT accounts always have a role and are
// left alone. Idempotent; returns how many rows changed.
export const verifyExistingSuperAdmins = async (
  db: LibSQLDatabase<typeof schema>,
  now: Date = new Date(),
) => {
  const updated = await db
    .update(admins)
    .set({ role: "super_admin", verifiedAt: now })
    .where(isNull(admins.role))
    .returning({ id: admins.id });

  return updated.length;
};
