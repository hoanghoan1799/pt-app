import { ACCENT_COLOR_PATTERN } from "../../src/database/entities/accent-color.js";
import { byKey } from "./chat-social.js";
import type { RowRef, RowViolation } from "./plan.js";

// The tables and columns production gained after the API branched
// (company/main 8f0e085: group chat, accent color, user restrictions) and the
// migrations that give them a PostgreSQL shape (UserRestrictions, AccentTheme,
// ChatGroups). SQLite enforced none of their rules, so this module:
//
//  1. repairs source values PostgreSQL stores differently (NULL booleans that
//     meant false become false);
//  2. scans for rows the new CHECKs and composite foreign keys would reject
//     (reported like any other orphan; --orphans=skip drops them and their
//     dependents). Plain foreign keys (group, account ids) are found by the
//     generic orphan scan; the account-key formats and generated ids live in
//     account-refs.ts.
//
// Never reads or prints content: only table, rule, count and primary keys.

// ---- 1. values repaired while reading ------------------------------------

// NOT NULL DEFAULT false in PostgreSQL; the app wrote NULL for false.
const NULL_MEANS_FALSE: Record<string, string[]> = {
  chat_groups: ["managers_only"],
  chat_group_messages: ["silent"],
};

export const repairCompanyRow = (
  table: string,
  row: Record<string, unknown>,
) => {
  for (const column of NULL_MEANS_FALSE[table] ?? []) {
    if (row[column] === null) {
      row[column] = 0;
    }
  }
};

// ---- 2. rows the new constraints reject -----------------------------------

// Extra values the scan needs that are not columns: the group name's length
// in characters (never the name), as PostgreSQL's char_length counts it. The
// photo byte length and the size rule live with the other image tables in
// chat-social.ts.
export const companyScanValues = (
  table: string,
  row: Record<string, unknown>,
): Record<string, number> =>
  table === "chat_groups" && typeof row.name === "string"
    ? { name_length: [...row.name].length }
    : {};

// Source columns the scan reads (kept on the RowRef values). Never a body,
// name or other content.
export const COMPANY_SCAN_COLUMNS: Record<string, string[]> = {
  users: ["accent_color"],
  admins: ["accent_color"],
  theme_settings: ["accent"],
  user_restrictions: ["lifted_at", "lifted_by_admin_id"],
  chat_groups: ["last_message_id", "dissolved_at", "dissolved_by_admin_id"],
  chat_group_members: ["left_at", "removed_by_key", "last_read_message_id"],
  chat_group_messages: [
    "group_id",
    "kind",
    "sender_key",
    "hidden_by_key",
    "hidden_at",
    "reply_to_message_id",
    "photo_id",
  ],
  // size: the image-table rule in chat-social.ts.
  chat_group_photos: ["group_id", "message_id", "position", "size"],
};

// Foreign keys whose orphan is cleared instead of dropping the row under
// --orphans=skip: a user restriction must survive its admin (PostgreSQL itself
// sets these to NULL when an admin is deleted). Dropping it would silently lift
// a block.
export const NULL_INSTEAD_OF_SKIP: ReadonlySet<string> = new Set([
  "user_restrictions.created_by_admin_id",
  "user_restrictions.lifted_by_admin_id",
]);

export const COMPANY_REASONS = {
  accentFormat: "accent_not_rrggbb",
  liftedByWithoutLiftedAt: "lifted_by_without_lifted_at",
  dissolvedByWithoutDissolvedAt: "dissolved_by_without_dissolved_at",
  nameLength: "group_name_length",
  lastMessageOtherGroup: "last_message_in_other_group",
  removedWithoutLeftAt: "removed_by_without_left_at",
  negativeLastRead: "last_read_negative",
  senderKind: "sender_does_not_match_kind",
  hiddenPair: "hidden_by_and_hidden_at_disagree",
  replyOtherGroup: "reply_in_other_group",
  photoNotOfMessage: "photo_not_attached_to_message",
  photoOtherGroup: "photo_message_in_other_group",
  negativePosition: "position_negative",
  duplicatePosition: "duplicate_position_in_message",
} as const;

// Same pattern as the AccentTheme migration.
const ACCENT = new RegExp(ACCENT_COLOR_PATTERN);
const NAME_MAX = 60;

type Rows = Record<string, RowRef[]>;

const isSet = (value: unknown) => value !== null && value !== undefined;

export const findCompanyViolations = (rows: Rows): RowViolation[] => {
  const found: RowViolation[] = [];
  const add = (
    table: string,
    column: string,
    key: string,
    reason: string,
    nullable = false,
  ) =>
    found.push({ table, column, key, reason, ...(nullable ? { nullable } : {}) });

  // Colors: NULL or normalized "#rrggbb".
  for (const [table, column] of [
    ["users", "accent_color"],
    ["admins", "accent_color"],
    ["theme_settings", "accent"],
  ] as const) {
    for (const row of rows[table] ?? []) {
      const value = row.values[column];

      // A bad personal color is cleared (the default applies) rather than
      // dropping the account; theme_settings.accent is NOT NULL.
      if (isSet(value) && !(typeof value === "string" && ACCENT.test(value))) {
        add(
          table,
          column,
          row.key,
          COMPANY_REASONS.accentFormat,
          table !== "theme_settings",
        );
      }
    }
  }

  // "who did it" needs "when". Only the restriction's lifted_by is cleared
  // (still never lifted, still active); the others stop the run or drop the
  // row like any rule.
  for (const [table, by, at, reason] of [
    [
      "user_restrictions",
      "lifted_by_admin_id",
      "lifted_at",
      COMPANY_REASONS.liftedByWithoutLiftedAt,
    ],
    [
      "chat_groups",
      "dissolved_by_admin_id",
      "dissolved_at",
      COMPANY_REASONS.dissolvedByWithoutDissolvedAt,
    ],
    [
      "chat_group_members",
      "removed_by_key",
      "left_at",
      COMPANY_REASONS.removedWithoutLeftAt,
    ],
  ] as const) {
    for (const row of rows[table] ?? []) {
      if (isSet(row.values[by]) && !isSet(row.values[at])) {
        add(table, by, row.key, reason, table === "user_restrictions");
      }
    }
  }

  const messages = byKey(rows.chat_group_messages);
  const photos = byKey(rows.chat_group_photos);

  for (const row of rows.chat_groups ?? []) {
    const length = row.values.name_length;

    if (typeof length !== "number" || length < 1 || length > NAME_MAX) {
      add("chat_groups", "name", row.key, COMPANY_REASONS.nameLength);
    }

    // The last message is one of this group's (a missing one is an orphan).
    const last = messages.get(String(row.values.last_message_id));

    if (
      isSet(row.values.last_message_id) &&
      last &&
      String(last.values.group_id) !== row.key
    ) {
      add(
        "chat_groups",
        "last_message_id",
        row.key,
        COMPANY_REASONS.lastMessageOtherGroup,
      );
    }
  }

  for (const row of rows.chat_group_members ?? []) {
    const lastRead = row.values.last_read_message_id;

    if (typeof lastRead === "number" && lastRead < 0) {
      add(
        "chat_group_members",
        "last_read_message_id",
        row.key,
        COMPANY_REASONS.negativeLastRead,
      );
    }
  }

  for (const row of rows.chat_group_messages ?? []) {
    const v = row.values;

    if ((v.kind === "system") !== !isSet(v.sender_key)) {
      add(
        "chat_group_messages",
        "sender_key",
        row.key,
        COMPANY_REASONS.senderKind,
      );
    }

    if (isSet(v.hidden_by_key) !== isSet(v.hidden_at)) {
      add(
        "chat_group_messages",
        "hidden_by_key",
        row.key,
        COMPANY_REASONS.hiddenPair,
      );
    }

    // A reply stays in its group.
    const target = messages.get(String(v.reply_to_message_id));

    if (
      isSet(v.reply_to_message_id) &&
      target &&
      target.values.group_id !== v.group_id
    ) {
      add(
        "chat_group_messages",
        "reply_to_message_id",
        row.key,
        COMPANY_REASONS.replyOtherGroup,
      );
    }

    // photo_id (the cover) is a photo attached to this very message.
    const photo = photos.get(String(v.photo_id));

    if (
      isSet(v.photo_id) &&
      photo &&
      String(photo.values.message_id) !== row.key
    ) {
      add(
        "chat_group_messages",
        "photo_id",
        row.key,
        COMPANY_REASONS.photoNotOfMessage,
      );
    }
  }

  // Photos: same group as their message, one photo per position of a message
  // (the later row, by id, is the one reported).
  const positions = new Set<string>();
  const sortedPhotos = [...(rows.chat_group_photos ?? [])].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );

  for (const row of sortedPhotos) {
    const v = row.values;
    const message = messages.get(String(v.message_id));

    if (
      isSet(v.message_id) &&
      message &&
      message.values.group_id !== v.group_id
    ) {
      add(
        "chat_group_photos",
        "message_id",
        row.key,
        COMPANY_REASONS.photoOtherGroup,
      );
    }

    if (typeof v.position === "number" && v.position < 0) {
      add(
        "chat_group_photos",
        "position",
        row.key,
        COMPANY_REASONS.negativePosition,
      );
    }

    if (isSet(v.message_id) && isSet(v.position)) {
      const slot = `${String(v.message_id)}|${String(v.position)}`;

      if (positions.has(slot)) {
        add(
          "chat_group_photos",
          "position",
          row.key,
          COMPANY_REASONS.duplicatePosition,
        );
      }
      positions.add(slot);
    }
  }

  return found;
};
