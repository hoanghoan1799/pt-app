import { toEmailKey } from "@/utils/email";

import { withApiDb } from "./api-db";
import { e2eEmail } from "./config";

// Chat data for the chat specs, in the API's PostgreSQL (the only place chat
// lives now). Trainees exist from global setup (api-seed.ts); a spec resets the
// chat rows it owns first and last, so a rerun (--repeat-each) starts clean.
// Straight SQL, because a spec needs what the API deliberately cannot do: put
// a message at a past time, move last seen, wipe a conversation. Everything the
// product does (sending, locking, reading) is done through the web app itself.

export const getUserId = (name: string) =>
  withApiDb(async (client) => {
    const result = await client.query(
      "SELECT id FROM users WHERE email_key = $1",
      [toEmailKey(e2eEmail(name))],
    );

    return Number(result.rows[0].id);
  });

const lockChat = `chat_enabled = NULL, chat_enabled_changed_at = NULL,
  chat_enabled_by_admin_id = NULL`;

// Back to the seeded state: no conversation (its messages, reads, reactions and
// edit history go with it), chat never enabled. `profile` also wipes colours,
// nicknames and the trainee's last seen; `stickers` the personal stickers.
export const resetChat = (
  name: string,
  { profile = false, stickers = false } = {},
) =>
  withApiDb(async (client) => {
    const userId = await getUserId(name);

    await client.query("DELETE FROM chat_conversations WHERE user_id = $1", [
      userId,
    ]);
    if (stickers) {
      await client.query("DELETE FROM chat_custom_stickers");
    }
    if (profile) {
      await client.query(
        "DELETE FROM contact_aliases WHERE owner_key = $1 OR target_key = $1",
        [`user:${userId}`],
      );
      await client.query("UPDATE admins SET chat_color = NULL");
    }
    await client.query(
      `UPDATE users SET ${lockChat}${profile ? ", chat_color = NULL, last_seen_at = NULL" : ""} WHERE id = $1`,
      [userId],
    );
    return userId;
  });

// Chat enabled with an empty conversation (the inbox lists it), presence
// unknown.
export const prepareChatTrainee = (name: string) =>
  withApiDb(async (client) => {
    const userId = await getUserId(name);

    await client.query("DELETE FROM chat_conversations WHERE user_id = $1", [
      userId,
    ]);
    await client.query(
      "UPDATE users SET chat_enabled = TRUE, last_seen_at = NULL WHERE id = $1",
      [userId],
    );
    await client.query("INSERT INTO chat_conversations (user_id) VALUES ($1)", [
      userId,
    ]);
    return userId;
  });

// Seeded state for the settings spec: clean profile, chat on with an empty
// conversation, or off.
export const setChatState = async (name: string, enabled: boolean) => {
  const userId = await resetChat(name, { profile: true });

  if (enabled) {
    await withApiDb(async (client) => {
      await client.query("UPDATE users SET chat_enabled = TRUE WHERE id = $1", [
        userId,
      ]);
      await client.query(
        "INSERT INTO chat_conversations (user_id) VALUES ($1)",
        [userId],
      );
    });
  }
  return userId;
};

export const setLocked = (userId: number) =>
  withApiDb((client) =>
    client.query(`UPDATE users SET ${lockChat} WHERE id = $1`, [userId]),
  );

export type SeededMessage = { body: string; createdAt: number };

// A conversation for the trainee, optionally enabled, with the given PT
// messages (`createdAt` in epoch ms).
export const prepareThread = async (
  name: string,
  { enabled, messages }: { enabled: boolean; messages: SeededMessage[] },
) => {
  const userId = await resetChat(name, { profile: true });

  await withApiDb(async (client) => {
    if (enabled) {
      await client.query("UPDATE users SET chat_enabled = TRUE WHERE id = $1", [
        userId,
      ]);
    }
    const created = await client.query(
      "INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id",
      [userId],
    );
    const conversationId = Number(created.rows[0].id);
    let lastId = 0;
    let lastAt = 0;

    for (const [index, message] of messages.entries()) {
      const inserted = await client.query(
        `INSERT INTO chat_messages (conversation_id, sender_role, body, client_id, created_at, updated_at)
         VALUES ($1, 'admin', $2, $3, to_timestamp($4 / 1000.0), to_timestamp($4 / 1000.0))
         RETURNING id`,
        [
          conversationId,
          message.body,
          `e2e-screen-${index}-${message.createdAt}`,
          message.createdAt,
        ],
      );

      lastId = Number(inserted.rows[0].id);
      lastAt = message.createdAt;
    }
    if (lastId > 0) {
      await client.query(
        "UPDATE chat_conversations SET last_message_id = $1, last_message_at = to_timestamp($2 / 1000.0) WHERE id = $3",
        [lastId, lastAt, conversationId],
      );
    }
  });
};

const conversationOf = "(SELECT id FROM chat_conversations WHERE user_id = $1)";

export const countMessages = (name: string) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS n FROM chat_messages WHERE conversation_id IN ${conversationOf}`,
      [await getUserId(name)],
    );

    return Number(result.rows[0].n);
  });

// The bodies stored for a trainee's conversation, oldest first.
export const getStoredBodies = (name: string) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT body FROM chat_messages WHERE conversation_id IN ${conversationOf} ORDER BY id`,
      [await getUserId(name)],
    );

    return result.rows.map((row) => String(row.body));
  });

// The read cursor is saved after a short debounce: a spec waits for it before
// leaving the thread, or the unread count would still include the message.
export const getReadCursor = (name: string, readerKeyPrefix: string) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT last_read_message_id AS id FROM chat_reads
       WHERE reader_key LIKE $2 AND conversation_id IN ${conversationOf}`,
      [await getUserId(name), `${readerKeyPrefix}%`],
    );

    return result.rows.length === 0 ? 0 : Number(result.rows[0].id);
  });

export const getNewestMessageId = (
  name: string,
  senderRole: "user" | "admin",
) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT MAX(id) AS id FROM chat_messages
       WHERE sender_role = $2 AND conversation_id IN ${conversationOf}`,
      [await getUserId(name), senderRole],
    );

    return Number(result.rows[0].id);
  });

// last_seen_at is a `timestamptz` column; the API stores whole seconds.
export const setUserLastSeen = (name: string, atMs: number | null) =>
  withApiDb((client) =>
    client.query(
      "UPDATE users SET last_seen_at = to_timestamp($1 / 1000.0) WHERE email_key = $2",
      [
        atMs === null ? null : Math.floor(atMs / 1000) * 1000,
        toEmailKey(e2eEmail(name)),
      ],
    ),
  );

// Epoch ms of the stored last seen, or null.
export const getLastSeenMs = (
  table: "users" | "admins",
  where: "email_key" | "username" | "id",
  arg: string | number,
) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT (EXTRACT(EPOCH FROM last_seen_at) * 1000)::bigint AS seen FROM ${table} WHERE ${where} = $1`,
      [arg],
    );
    const seen = result.rows[0]?.seen;

    return seen === null || seen === undefined ? null : Number(seen);
  });

export type AdminSeen = { id: number; seen: number | null };

export const getAdminsLastSeen = () =>
  withApiDb(async (client) => {
    const result = await client.query(
      "SELECT id, (EXTRACT(EPOCH FROM last_seen_at) * 1000)::bigint AS seen FROM admins",
    );

    return result.rows.map((row): AdminSeen => ({
      id: Number(row.id),
      seen: row.seen === null ? null : Number(row.seen),
    }));
  });

export const setAdminsLastSeen = (atMs: number) =>
  withApiDb((client) =>
    client.query("UPDATE admins SET last_seen_at = to_timestamp($1 / 1000.0)", [
      Math.floor(atMs / 1000) * 1000,
    ]),
  );

export const restoreAdminsLastSeen = (saved: AdminSeen[]) =>
  withApiDb(async (client) => {
    for (const { id, seen } of saved) {
      await client.query(
        "UPDATE admins SET last_seen_at = to_timestamp($1 / 1000.0) WHERE id = $2",
        [seen, id],
      );
    }
  });

// The custom sticker messages as stored.
export const getCustomStickerRows = () =>
  withApiDb(async (client) => {
    const result = await client.query(
      "SELECT sticker_ref, sticker_url FROM chat_messages WHERE sticker_ref LIKE 'custom:%'",
    );

    return result.rows as { sticker_ref: string; sticker_url: string }[];
  });
