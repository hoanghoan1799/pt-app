import { sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type * as schema from "@/db/schema";
import { adminHiddenUsers, chatHiddenConversations } from "@/db/schema";

// KAN-163: round 1 hid conversations, round 2 hides trainees. Moves every
// legacy row into admin_hidden_users through the conversation's trainee
// (insert or ignore, so a rerun or an existing row changes nothing), then
// removes the legacy rows. Rows whose conversation no longer exists have no
// trainee to hide and are dropped. Idempotent; returns how many rows moved.
export const moveHiddenConversationsToUsers = async (
  db: LibSQLDatabase<typeof schema>,
) =>
  db.transaction(async (tx) => {
    const moved = await tx.all<{ total: number }>(
      sql`select count(*) as total from ${chatHiddenConversations}
        inner join chat_conversations c on c.id = ${chatHiddenConversations.conversationId}`,
    );

    await tx.run(
      sql`insert or ignore into ${adminHiddenUsers} (admin_id, user_id, hidden_at)
        select h.admin_id, c.user_id, h.hidden_at
        from ${chatHiddenConversations} h
        inner join chat_conversations c on c.id = h.conversation_id`,
    );
    await tx.delete(chatHiddenConversations);
    return Number(moved[0]?.total ?? 0);
  });
