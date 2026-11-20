import { ACCENT_COLOR_PATTERN } from "../../src/database/entities/accent-color.js";
import { byKey } from "./chat-social.js";
import type { RowRef, RowViolation } from "./plan.js";

// The tables and columns production gained after the API branched
// (company/main 8f0e085: group chat, accent color, user restrictions) and the
// migrations that give them a PostgreSQL shape (UserRestrictions, AccentTheme,
// ChatGroups, GroupChatRestrictionKeys). SQLite enforced none of their rules,
// so this module:
//
//  1. repairs source values PostgreSQL stores differently (NULL booleans that
//     meant false become false, a read cursor of 0 becomes NULL) and the rows
//     GroupChatRestrictionKeys repairs in place, the same way (a dangling read
//     cursor, a restriction lifted before it was created, older active
//     restrictions of one trainee);
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

// Cross-row repairs, planned once from the analysis pass
// (planCompanyRepairs) and applied on every later read (load and verify), so
// both sides of the checksum agree. Empty while the analysis pass reads.
type Repairs = {
  // user_restrictions id -> lifted_at (epoch ms).
  lifts: Map<string, number>;
  // chat_group_members keys ("<group_id>:<member_key>") whose cursor is
  // cleared.
  clearedCursors: Set<string>;
};

const emptyRepairs = (): Repairs => ({
  lifts: new Map(),
  clearedCursors: new Set(),
});

let repairs = emptyRepairs();

// Starts a run (the script is one run per process; tests run several).
export const resetCompanyRepairs = () => {
  repairs = emptyRepairs();
};

const memberKey = (row: Record<string, unknown>) =>
  `${String(row.group_id)}:${String(row.member_key)}`;

export const repairCompanyRow = (
  table: string,
  row: Record<string, unknown>,
) => {
  for (const column of NULL_MEANS_FALSE[table] ?? []) {
    if (row[column] === null) {
      row[column] = 0;
    }
  }

  if (table === "chat_group_members") {
    // 0 meant "nothing read"; PostgreSQL says NULL (the cursor is a foreign
    // key to a message of the group).
    if (
      row.last_read_message_id === 0 ||
      repairs.clearedCursors.has(memberKey(row))
    ) {
      row.last_read_message_id = null;
    }
  }

  if (table === "user_restrictions") {
    const created = row.created_at;

    // user_restrictions_lifted_after_created.
    if (
      typeof created === "number" &&
      typeof row.lifted_at === "number" &&
      row.lifted_at < created
    ) {
      row.lifted_at = created;
    }

    const lifted = repairs.lifts.get(String(row.id));

    if (lifted !== undefined && row.lifted_at === null) {
      row.lifted_at = lifted;
    }
  }
};

type RepairRows = Record<string, RowRef[]>;

const ms = (value: unknown) => (typeof value === "number" ? value : null);

// The moment an older active restriction ends when the next newer one of the
// same trainee replaces it: then, or at its own `until` if that came first,
// never before its own created_at. Same expression as the migration:
// GREATEST(created_at, LEAST(replaced_at, until)).
export const liftedAtFor = (
  createdAt: number,
  until: number | null,
  replacedAt: number,
) =>
  Math.max(
    createdAt,
    until === null ? replacedAt : Math.min(replacedAt, until),
  );

// user_restrictions_one_active: per trainee, the newest row (created_at, then
// id) that is not lifted stays active; every older one is lifted (liftedAtFor
// with the next newer row's created_at). lifted_by_admin_id is left as it is
// (NULL, unless the source had one: then lifted_by_without_lifted_at clears
// it). Returns id -> lifted_at.
export const planRestrictionLifts = (rows: RowRef[] | undefined) => {
  const active = new Map<string, RowRef[]>();

  for (const row of rows ?? []) {
    const created = ms(row.values.created_at);
    const lifted = ms(row.values.lifted_at);

    // A lifted_at before created_at is repaired to created_at: still lifted.
    if (lifted !== null || created === null) {
      continue;
    }

    const user = String(row.values.user_id);

    active.set(user, [...(active.get(user) ?? []), row]);
  }

  const lifts = new Map<string, number>();

  for (const list of active.values()) {
    const newestFirst = [...list].sort(
      (a, b) =>
        (b.values.created_at as number) - (a.values.created_at as number) ||
        Number(b.key) - Number(a.key),
    );

    for (let index = 1; index < newestFirst.length; index += 1) {
      const row = newestFirst[index];

      lifts.set(
        row.key,
        liftedAtFor(
          row.values.created_at as number,
          ms(row.values.until),
          newestFirst[index - 1].values.created_at as number,
        ),
      );
    }
  }

  return lifts;
};

// fk_chat_group_members_last_read: a cursor that names no message of its own
// group (missing, or another group's) is cleared, as the migration does; the
// membership stays. Read cursors are already 0 -> NULL here.
export const planClearedCursors = (rows: RepairRows) => {
  const messages = byKey(rows.chat_group_messages);
  const cleared = new Set<string>();

  for (const row of rows.chat_group_members ?? []) {
    const cursor = row.values.last_read_message_id;

    // A negative id is not a stale cursor but a bad value: reported as
    // last_read_negative.
    if (cursor === null || cursor === undefined || Number(cursor) < 0) {
      continue;
    }

    const message = messages.get(String(cursor));

    if (
      !message ||
      String(message.values.group_id) !== String(row.values.group_id)
    ) {
      cleared.add(row.key);
    }
  }

  return cleared;
};

export type CompanyRepairSummary = {
  liftedRestrictions: string[];
  clearedCursors: string[];
};

// Plans the cross-row repairs from the analysis rows and clears the planned
// cursors in `rows` too, so the orphan scan that follows sees the loaded
// value. Call once per run, after the analysis pass.
export const planCompanyRepairs = (rows: RepairRows): CompanyRepairSummary => {
  repairs = {
    lifts: planRestrictionLifts(rows.user_restrictions),
    clearedCursors: planClearedCursors(rows),
  };

  for (const row of rows.chat_group_members ?? []) {
    if (repairs.clearedCursors.has(row.key)) {
      row.values.last_read_message_id = null;
    }
  }

  return {
    liftedRestrictions: [...repairs.lifts.keys()],
    clearedCursors: [...repairs.clearedCursors],
  };
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
  user_restrictions: [
    "user_id",
    "created_at",
    "until",
    "lifted_at",
    "lifted_by_admin_id",
  ],
  chat_groups: ["last_message_id", "dissolved_at", "dissolved_by_admin_id"],
  chat_group_members: [
    "group_id",
    "left_at",
    "removed_by_key",
    "last_read_message_id",
  ],
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
// a block. A read cursor whose message is skipped only loses the cursor, not
// the membership (PostgreSQL clears it when the message is deleted).
export const NULL_INSTEAD_OF_SKIP: ReadonlySet<string> = new Set([
  "user_restrictions.created_by_admin_id",
  "user_restrictions.lifted_by_admin_id",
  "chat_group_members.last_read_message_id",
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
  photoOtherGroup: "photo_message_in_other_group",
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
    found.push({
      table,
      column,
      key,
      reason,
      ...(nullable ? { nullable } : {}),
    });

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

    // The cover and the photo positions: PHOTO_LINKS in chat-social.ts.
  }

  // Photos: same group as their message.
  for (const row of rows.chat_group_photos ?? []) {
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
  }

  return found;
};
