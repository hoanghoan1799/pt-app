import type { EntityManager } from "typeorm";

import { returnedRows } from "../common/sql.js";

// Moves the change cursor of one conversation (strictly increasing, in whole
// milliseconds) without touching a message; the cursor defeats the 204 fast
// path. Returns the new cursor. Shared by ChatQueries and ChatModeration (the
// latter cannot depend on ChatQueries: Social uses it and Chat imports Social).
export const bumpConversationChange = async (
  manager: EntityManager,
  conversationId: number,
  now: Date,
): Promise<Date> => {
  const result: unknown = await manager.query(
    `UPDATE chat_conversations
     SET last_change_at = date_trunc('milliseconds', GREATEST(
       COALESCE(last_change_at, 'epoch'::timestamptz) + interval '1 millisecond',
       $2::timestamptz))
     WHERE id = $1
     RETURNING last_change_at AS "lastChangeAt"`,
    [conversationId, now],
  );

  return returnedRows<{ lastChangeAt: Date }>(result)[0]?.lastChangeAt ?? now;
};
