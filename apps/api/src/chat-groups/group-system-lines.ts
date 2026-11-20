import {
  type GroupSystemEvent,
  serializeGroupSystemEvent,
} from "@pt/contracts";
import type { EntityManager } from "typeorm";

import { returnedRows } from "../common/sql.js";

type Runner = Pick<EntityManager, "query">;

// Stores a system line (company appendSystemLine). A line for everyone moves
// the inbox pointer (last_message_*); an alert (`audience`) never does, so it
// cannot change the preview or the order for anybody who may not read it.
// The event is validated before it is stored. Returns the row id.
export const appendSystemLine = async (
  runner: Runner,
  groupId: number,
  event: GroupSystemEvent,
  { now, audience = null }: { now: Date; audience?: "super_admin" | null },
): Promise<number> => {
  const inserted = returnedRows<{ id: number }>(
    await runner.query(
      `INSERT INTO chat_group_messages
         (group_id, kind, sender_key, body, system_event, audience, client_id, created_at)
       VALUES ($1, 'system', NULL, '', $2, $3, NULL, $4)
       RETURNING id`,
      [groupId, serializeGroupSystemEvent(event), audience, now],
    ),
  );
  const id = inserted[0].id;

  if (audience === null) {
    await movePointer(runner, groupId, id, now);
  }
  return id;
};

// Two parallel writes must not move the pointer back to the older one.
export const movePointer = (
  runner: Runner,
  groupId: number,
  messageId: number,
  now: Date,
) =>
  runner.query(
    `UPDATE chat_groups SET last_message_id = $1, last_message_at = $2
     WHERE id = $3 AND COALESCE(last_message_id, 0) < $1`,
    [messageId, now, groupId],
  );
