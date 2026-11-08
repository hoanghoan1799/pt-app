import "server-only";

import { asc, eq, notInArray, or } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { listTraineeNicknames } from "@/features/chat/services/chat-queries";
import { resolveDisplayName } from "@/features/chat/utils/display-name";
import type { Member } from "@/features/members/types/member";
import { hiddenUserIdsOf } from "@/services/hidden-users";

// Trainees `adminId` hid are left out (KAN-163), except `keepUserId` (the one
// whose page is open, which the admin is allowed to see).
export const listMembers = async (
  adminId: number,
  keepUserId?: number,
): Promise<Member[]> => {
  const visible = notInArray(users.id, hiddenUserIdsOf(adminId));

  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      keepUserId === undefined
        ? visible
        : or(eq(users.id, keepUserId), visible),
    )
    .orderBy(asc(users.nameKey));
  const nicknames = await listTraineeNicknames(rows.map((row) => row.id));

  // `name` is what the admin sees: the nickname if one is set.
  return rows.map((row) => ({
    ...row,
    name: resolveDisplayName(nicknames.get(row.id), row.name),
  }));
};
