import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

export { isChatEnabled } from "@/features/chat/utils/chat-permission-rules";

// Turns chat on or off for one trainee and records who did it and when.
// `updated: false` means the trainee does not exist (e.g. deleted meanwhile).
export const setChatEnabled = async (
  userId: number,
  enabled: boolean,
  adminId: number,
) => {
  const rows = await db
    .update(users)
    .set({
      chatEnabled: enabled,
      chatEnabledChangedAt: new Date(),
      chatEnabledByAdminId: adminId,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  return { updated: rows.length > 0 };
};
