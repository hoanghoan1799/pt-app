import type { Client as LibsqlClient } from "@libsql/client";
import type { Client } from "pg";

import type { TursoColumns } from "../turso-columns.js";
import type { RowRef, RowViolation } from "./plan.js";

// The DbChatSocial migration tightened chat, direct messages and social. This
// module carries everything the data script needs for it:
//
//  1. legacy data PostgreSQL no longer has (chat_messages.attachment_url and
//     attachment_meta, the chat_nicknames table): counted in the source, the
//     run aborts unless the operator accepts losing them;
//  2. source values that are repaired on the way in (silent NULL -> false);
//  3. a scan for rows the new constraints would reject (reported like any
//     other orphan; --orphans=skip drops them and their dependents);
//  4. a post-load recompute of the denormalised last_message_* fields.
//
// Never reads or prints content: only table, rule, count and primary keys.

// ---- 1. legacy data -------------------------------------------------------

export const LEGACY_TABLES = ["chat_nicknames"];
export const LEGACY_COLUMNS: Record<string, string[]> = {
  chat_messages: ["attachment_url", "attachment_meta"],
};

// The mapping the target side works with: without the table and the columns
// PostgreSQL dropped. The source schema check still uses the full mapping.
export const withoutLegacy = (mapping: TursoColumns): TursoColumns => ({
  ...mapping,
  tables: Object.fromEntries(
    Object.entries(mapping.tables)
      .filter(([table]) => !LEGACY_TABLES.includes(table))
      .map(([table, spec]) => [
        table,
        {
          ...spec,
          columns: spec.columns.filter(
            (column) => !LEGACY_COLUMNS[table]?.includes(column.name),
          ),
        },
      ]),
  ),
});

export type LegacyCounts = { attachments: number; nicknames: number };

export const countLegacy = async (
  source: LibsqlClient,
): Promise<LegacyCounts> => {
  const attachments = await source.execute(
    "SELECT count(*) AS n FROM chat_messages WHERE attachment_url IS NOT NULL OR attachment_meta IS NOT NULL",
  );
  const nicknames = await source.execute(
    "SELECT count(*) AS n FROM chat_nicknames",
  );

  return {
    attachments: Number(attachments.rows[0].n),
    nicknames: Number(nicknames.rows[0].n),
  };
};

// Messages for the abort; empty when nothing blocks the run.
export const legacyProblems = (
  counts: LegacyCounts,
  accept: { attachments?: boolean; nicknames?: boolean },
) => {
  const problems: string[] = [];

  if (counts.attachments > 0 && !accept.attachments) {
    problems.push(
      `${counts.attachments} chat message(s) have attachment_url or attachment_meta; PostgreSQL no longer has those columns (photos live in chat_photos). Check them, then pass --drop-legacy-attachments to drop the values.`,
    );
  }

  if (counts.nicknames > 0 && !accept.nicknames) {
    problems.push(
      `chat_nicknames has ${counts.nicknames} row(s); PostgreSQL no longer has that table (private contact_aliases replaced it). Pass --drop-legacy-nicknames to drop them.`,
    );
  }

  return problems;
};

// ---- 2. values repaired while reading ------------------------------------

// chat_messages.silent is NOT NULL DEFAULT false in PostgreSQL; the source
// allowed NULL and the app meant "not silent" by it.
export const repairSourceRow = (
  table: string,
  row: Record<string, unknown>,
) => {
  if (table === "chat_messages" && row.silent === null) {
    row.silent = 0;
  }
};

// ---- 3. rows the new constraints reject -----------------------------------

// Tables whose size column must equal the byte length of data.
const IMAGE_TABLES = [
  "chat_photos",
  "dm_photos",
  "social_post_photos",
  "chat_custom_stickers",
];

// Extra values the scan needs that are not columns (the blob itself is never
// kept in memory, only its length).
export const derivedValues = (
  table: string,
  row: Record<string, unknown>,
): Record<string, number> =>
  IMAGE_TABLES.includes(table) && Buffer.isBuffer(row.data)
    ? { data_length: row.data.length }
    : {};

// Source columns the scan reads (kept on the RowRef values).
export const SCAN_COLUMNS: Record<string, string[]> = {
  chat_messages: ["conversation_id", "reply_to_message_id", "photo_id"],
  chat_conversations: ["last_message_id"],
  chat_photos: ["message_id", "size"],
  dm_messages: ["conversation_id", "photo_id"],
  dm_conversations: ["last_message_id", "user_low", "user_high"],
  dm_photos: ["message_id", "size"],
  social_posts: ["photo_id"],
  social_post_photos: ["post_id", "size"],
  chat_custom_stickers: ["size"],
  social_friendships: ["user_low", "user_high", "requested_by"],
  social_reports: [
    "reporter_key",
    "target_kind",
    "target_id",
    "status",
    "resolution",
    "resolved_at",
    "resolved_by",
  ],
};

export const REASONS = {
  replyOtherConversation: "reply_in_other_conversation",
  lastMessageOtherConversation: "last_message_in_other_conversation",
  photoLinkMismatch: "photo_link_mismatch",
  sizeMismatch: "size_not_byte_length",
  pairNotOrdered: "pair_not_ordered",
  requesterNotMember: "requester_not_in_pair",
  statusResolution: "status_resolution_mismatch",
  duplicateOpenReport: "duplicate_open_report",
} as const;

type Rows = Record<string, RowRef[]>;

const byKey = (rows: RowRef[] | undefined) =>
  new Map((rows ?? []).map((row) => [row.key, row]));

const numeric = (value: unknown) => (typeof value === "number" ? value : null);

// owner table, photo table, photo column pointing at the owner.
const PHOTO_LINKS = [
  ["chat_messages", "chat_photos", "message_id"],
  ["dm_messages", "dm_photos", "message_id"],
  ["social_posts", "social_post_photos", "post_id"],
] as const;

export const findChatSocialViolations = (rows: Rows): RowViolation[] => {
  const found: RowViolation[] = [];
  const add = (
    table: string,
    column: string,
    key: string,
    reason: string,
  ) => found.push({ table, column, key, reason });

  // A reply stays in its conversation (a missing target is a plain orphan).
  const messages = byKey(rows.chat_messages);

  for (const row of rows.chat_messages ?? []) {
    const target = messages.get(String(row.values.reply_to_message_id));

    if (
      row.values.reply_to_message_id != null &&
      target &&
      target.values.conversation_id !== row.values.conversation_id
    ) {
      add(
        "chat_messages",
        "reply_to_message_id",
        row.key,
        REASONS.replyOtherConversation,
      );
    }
  }

  // last_message_id belongs to its conversation.
  for (const [conversations, messageTable] of [
    ["chat_conversations", "chat_messages"],
    ["dm_conversations", "dm_messages"],
  ] as const) {
    const owners = byKey(rows[messageTable]);

    for (const row of rows[conversations] ?? []) {
      const last = owners.get(String(row.values.last_message_id));

      if (
        row.values.last_message_id != null &&
        last &&
        last.values.conversation_id !== numeric(Number(row.key))
      ) {
        add(
          conversations,
          "last_message_id",
          row.key,
          REASONS.lastMessageOtherConversation,
        );
      }
    }
  }

  // Both directions of every photo link name each other.
  for (const [ownerTable, photoTable, photoColumn] of PHOTO_LINKS) {
    const owners = byKey(rows[ownerTable]);
    const photos = byKey(rows[photoTable]);

    for (const owner of rows[ownerTable] ?? []) {
      const photo = photos.get(String(owner.values.photo_id));

      if (
        owner.values.photo_id != null &&
        photo &&
        String(photo.values[photoColumn]) !== owner.key
      ) {
        add(ownerTable, "photo_id", owner.key, REASONS.photoLinkMismatch);
      }
    }

    for (const photo of rows[photoTable] ?? []) {
      const owner = owners.get(String(photo.values[photoColumn]));

      if (
        photo.values[photoColumn] != null &&
        owner &&
        String(owner.values.photo_id) !== photo.key
      ) {
        add(photoTable, photoColumn, photo.key, REASONS.photoLinkMismatch);
      }
    }
  }

  // size = octet_length(data).
  for (const table of IMAGE_TABLES) {
    for (const row of rows[table] ?? []) {
      if (row.values.size !== row.values.data_length) {
        add(table, "size", row.key, REASONS.sizeMismatch);
      }
    }
  }

  // Ordered pairs and the requester of a friendship.
  for (const table of ["dm_conversations", "social_friendships"]) {
    for (const row of rows[table] ?? []) {
      const { user_low: low, user_high: high } = row.values;

      if (typeof low !== "number" || typeof high !== "number" || low >= high) {
        add(table, "user_low", row.key, REASONS.pairNotOrdered);
      }
    }
  }

  for (const row of rows.social_friendships ?? []) {
    const { user_low: low, user_high: high, requested_by: by } = row.values;

    if (by !== low && by !== high) {
      add(
        "social_friendships",
        "requested_by",
        row.key,
        REASONS.requesterNotMember,
      );
    }
  }

  // Reports: status and resolution agree; one open report per reporter+target
  // (the first by id stays, the later ones are the violations).
  const seen = new Set<string>();
  const reports = [...(rows.social_reports ?? [])].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );

  for (const row of reports) {
    const v = row.values;
    const open =
      v.status === "open" &&
      v.resolution === null &&
      v.resolved_at === null &&
      v.resolved_by === null;
    const resolved =
      v.status === "resolved" && v.resolution !== null && v.resolved_at !== null;

    if (!open && !resolved) {
      add("social_reports", "status", row.key, REASONS.statusResolution);
    }

    if (v.status === "open") {
      const identity = `${String(v.reporter_key)}|${String(v.target_kind)}|${String(v.target_id)}`;

      if (seen.has(identity)) {
        add(
          "social_reports",
          "reporter_key",
          row.key,
          REASONS.duplicateOpenReport,
        );
      }
      seen.add(identity);
    }
  }

  return found;
};

// ---- 4. denormalised last_message_* fields --------------------------------

export type DerivedCheck = {
  table: string;
  rule: string;
  count: number;
  sampleIds: string[];
};

// ChatService.send keeps last_message_id at the highest message id of the
// conversation and last_message_at at that message's created_at. Recomputed
// from the loaded messages and compared; a difference is reported, never fixed
// (the fields are app-maintained).
export const checkLastMessages = async (
  target: Client,
): Promise<DerivedCheck[]> => {
  const checks: DerivedCheck[] = [];

  for (const [conversations, messages] of [
    ["chat_conversations", "chat_messages"],
    ["dm_conversations", "dm_messages"],
  ]) {
    const result = await target.query<{ id: number }>(
      `SELECT c.id
         FROM ${conversations} c
         LEFT JOIN LATERAL (
           SELECT m.id, m.created_at FROM ${messages} m
            WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1
         ) latest ON true
        WHERE c.last_message_id IS DISTINCT FROM latest.id
           OR c.last_message_at IS DISTINCT FROM latest.created_at
        ORDER BY c.id`,
    );

    checks.push({
      table: conversations,
      rule: "last_message_id / last_message_at differ from the newest message",
      count: result.rows.length,
      sampleIds: result.rows.slice(0, 10).map((row) => String(row.id)),
    });
  }

  return checks;
};
