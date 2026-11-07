import "server-only";

import { asc, eq, notInArray, or } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import type { Member } from "@/features/members/types/member";
import { hiddenUserIdsOf } from "@/services/hidden-users";

// Trainees `adminId` hid are left out (KAN-163), except `keepUserId` (the one
// whose page is open, which the admin is allowed to see).
export const listMembers = async (
  adminId: number,
  keepUserId?: number,
): Promise<Member[]> => {
  const visible = notInArray(users.id, hiddenUserIdsOf(adminId));

  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      keepUserId === undefined
        ? visible
        : or(eq(users.id, keepUserId), visible),
    )
    .orderBy(asc(users.nameKey));
};
