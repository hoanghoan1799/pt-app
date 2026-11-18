import type { RowRef, RowViolation } from "./plan.js";

// The DbIntegrity migration added STORED generated account ids (PostgreSQL
// derives them from a text key or a kind + id pair) with real foreign keys,
// a CHECK on chat_messages and sender-scoped unique indexes. The loader never
// writes those columns, so dirty source rows would only fail at INSERT time.
// This module computes the same values from the source rows, so the dry run
// reports them like any other orphan and --orphans=skip can drop them.
//
// The derivations mirror the SQL of the migration (same shapes, same 9-digit
// id limit); account-refs.test.ts compares them with the real database.

const ID = "[1-9][0-9]{0,8}";
const USER_KEY = new RegExp(`^user:(${ID})$`);
const ADMIN_KEY = new RegExp(`^admin:(${ID})$`);

type Row = Record<string, unknown>;
type Derive = (row: Row) => number | null;

const fromKey =
  (column: string, pattern: RegExp): Derive =>
  (row) => {
    const value = row[column];
    const match = typeof value === "string" ? pattern.exec(value) : null;

    return match ? Number(match[1]) : null;
  };

const fromKind =
  (kindColumn: string, idColumn: string, kind: string): Derive =>
  (row) => {
    const id = row[idColumn];

    return row[kindColumn] === kind && typeof id === "number" ? id : null;
  };

const userKey = (column: string) => fromKey(column, USER_KEY);
const adminKey = (column: string) => fromKey(column, ADMIN_KEY);

// "table.generated_column" -> derivation from the source row.
export const DERIVED_IDS: Record<string, Derive> = {
  "social_comments.author_user_id": userKey("author_key"),
  "social_comments.author_admin_id": adminKey("author_key"),
  "social_reactions.reactor_user_id": userKey("reactor_key"),
  "social_reactions.reactor_admin_id": adminKey("reactor_key"),
  "social_notifications.recipient_user_id": userKey("recipient_key"),
  "social_notifications.recipient_admin_id": adminKey("recipient_key"),
  "social_notifications.actor_user_id": userKey("actor_key"),
  "social_notifications.actor_admin_id": adminKey("actor_key"),
  "social_reports.reporter_user_id": userKey("reporter_key"),
  "social_reports.reporter_admin_id": adminKey("reporter_key"),
  "social_reports.target_user_id": fromKind("target_kind", "target_id", "user"),
  "social_post_photos.uploader_user_id": userKey("uploader_key"),
  "social_post_photos.uploader_admin_id": adminKey("uploader_key"),
  "social_posts.author_user_id": fromKind("author_kind", "author_id", "user"),
  "social_posts.author_admin_id": fromKind("author_kind", "author_id", "admin"),
  "chat_custom_stickers.owner_user_id": fromKind(
    "owner_kind",
    "owner_id",
    "user",
  ),
  "chat_custom_stickers.owner_admin_id": fromKind(
    "owner_kind",
    "owner_id",
    "admin",
  ),
  "push_subscriptions.owner_user_id": userKey("owner_key"),
  "push_subscriptions.owner_admin_id": adminKey("owner_key"),
  "contact_aliases.owner_user_id": userKey("owner_key"),
  "contact_aliases.owner_admin_id": adminKey("owner_key"),
  "contact_aliases.target_user_id": userKey("target_key"),
  "contact_aliases.target_admin_id": adminKey("target_key"),
  "chat_photos.uploader_admin_id": adminKey("uploader_key"),
  "chat_reactions.reactor_admin_id": adminKey("reactor_key"),
  "chat_reads.reader_admin_id": adminKey("reader_key"),
};

export const isDerived = (table: string, column: string) =>
  `${table}.${column}` in DERIVED_IDS;

export const deriveId = (table: string, column: string, row: Row) =>
  DERIVED_IDS[`${table}.${column}`](row);

// Format rules of the text keys and ids (the CHECKs of the DbIntegrity
// migration, mirrored here): social "user:<id>" / "admin:<id>", chat "user" /
// "admin:<id>", alias targets also "pt", and ids of kind + id pairs > 0.
const SOCIAL = new RegExp(`^(user|admin):${ID}$`);
const CHAT = new RegExp(`^(user|admin:${ID})$`);
const ALIAS_TARGET = new RegExp(`^((user|admin):${ID}|pt)$`);

const FORMAT_RULES: Record<string, Record<string, RegExp | "positive">> = {
  social_comments: { author_key: SOCIAL },
  social_reactions: { reactor_key: SOCIAL },
  social_notifications: { recipient_key: SOCIAL, actor_key: SOCIAL },
  social_reports: { reporter_key: SOCIAL, target_id: "positive" },
  social_post_photos: { uploader_key: SOCIAL },
  social_posts: { author_id: "positive" },
  chat_custom_stickers: { owner_id: "positive" },
  push_subscriptions: { owner_key: SOCIAL },
  contact_aliases: { owner_key: SOCIAL, target_key: ALIAS_TARGET },
  chat_photos: { uploader_key: CHAT },
  chat_reactions: { reactor_key: CHAT },
  chat_reads: { reader_key: CHAT },
};

// Source columns the constraint scan reads (kept on the RowRef values).
export const VIOLATION_COLUMNS: Record<string, string[]> = (() => {
  const columns: Record<string, string[]> = {
    chat_messages: ["sender_role", "sender_admin_id"],
  };

  for (const [table, rules] of Object.entries(FORMAT_RULES)) {
    columns[table] = [...(columns[table] ?? []), ...Object.keys(rules)];
  }

  return columns;
})();

export const VIOLATION_REASONS = {
  userMessageWithAdmin: "user_message_with_admin",
  malformedKey: "malformed_key",
} as const;

// Rows PostgreSQL would reject for a reason other than a missing parent:
//  - chat_messages_user_has_no_admin: a user message with sender_admin_id set;
//  - a malformed text key, or a kind + id pair with id <= 0 (format CHECKs).
//
// The sender-scoped unique indexes need no scan: the frozen SQLite schema
// already has UNIQUE (conversation_id, client_id) on chat_messages and
// dm_messages, which is stricter, so the source cannot repeat a client_id.
export const findViolations = (
  rows: Record<string, RowRef[]>,
): RowViolation[] => {
  const found: RowViolation[] = (rows.chat_messages ?? [])
    .filter(
      (row) =>
        row.values.sender_role === "user" &&
        row.values.sender_admin_id !== null &&
        row.values.sender_admin_id !== undefined,
    )
    .map((row) => ({
      table: "chat_messages",
      column: "sender_admin_id",
      key: row.key,
      reason: VIOLATION_REASONS.userMessageWithAdmin,
    }));

  for (const [table, rules] of Object.entries(FORMAT_RULES)) {
    for (const row of rows[table] ?? []) {
      for (const [column, rule] of Object.entries(rules)) {
        const value = row.values[column];
        const ok =
          rule === "positive"
            ? typeof value === "number" && value > 0
            : typeof value === "string" && rule.test(value);

        if (!ok) {
          found.push({
            table,
            column,
            key: row.key,
            reason: VIOLATION_REASONS.malformedKey,
          });
        }
      }
    }
  }

  return found;
};
