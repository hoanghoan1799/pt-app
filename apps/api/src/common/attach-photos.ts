import type { EntityManager } from "typeorm";

import { returnedRows } from "./sql.js";

type AttachSpec = {
  table: "chat_photos" | "chat_group_photos" | "social_post_photos";
  ownerColumn: "message_id" | "post_id";
  ownerId: number;
  // The array order is the display order (position = index).
  photoIds: readonly number[];
  // Who may attach them, as SQL on the photo table using $2.. (the photo ids
  // are $1), and its parameters.
  guard: string;
  guardParams: readonly unknown[];
};

// Attaches pending photos (owner NULL) to a message or post inside the caller's
// transaction. False when any of them is gone or taken: the caller throws and
// nothing is stored. The rows are locked in id order first, so two sends with
// the same photos in opposite orders queue up instead of deadlocking; the
// loser then sees the winner's owner and gets false.
export const attachPendingPhotos = async (
  manager: EntityManager,
  spec: AttachSpec,
): Promise<boolean> => {
  const { table, ownerColumn, ownerId, photoIds, guard, guardParams } = spec;

  if (photoIds.length === 0) {
    return true;
  }
  const locked = returnedRows<{ id: number }>(
    await manager.query(
      `SELECT id FROM ${table}
       WHERE id = ANY($1::int[]) AND ${guard} AND ${ownerColumn} IS NULL
       ORDER BY id FOR UPDATE`,
      [[...photoIds], ...guardParams],
    ),
  );

  if (locked.length !== photoIds.length) {
    return false;
  }
  const attached = returnedRows<{ id: number }>(
    await manager.query(
      `UPDATE ${table} t SET ${ownerColumn} = $1, position = p.position
       FROM unnest($2::int[], $3::int[]) AS p(id, position)
       WHERE t.id = p.id AND t.${ownerColumn} IS NULL RETURNING t.id`,
      [ownerId, [...photoIds], photoIds.map((_, index) => index)],
    ),
  );

  return attached.length === photoIds.length;
};
