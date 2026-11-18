import { MigrationInterface, QueryRunner } from "typeorm";

// Group chat (company/main #202-#204, docs/specs/group-chat.md): six new
// tables, the same shape as the SQLite ones. Additive.
//
// SQLite had no foreign keys on them (its D10); the old code cleaned the
// children by hand. PostgreSQL adds what that cleanup meant:
//  - every child goes with its group (CASCADE);
//  - a member row and a reaction go with the account (STORED generated account
//    ids from the text key, FK CASCADE, as in DbIntegrity);
//  - messages and attached photos stay when their sender / uploader is deleted
//    ("Deleted member"), so sender_key, uploader_key and the other *_by_key
//    columns only get a format CHECK;
//  - a reply, last_message_id and a photo stay inside their group (composite
//    FKs on (group_id, id)); photo_id is a photo attached to that message
//    (deferred to COMMIT, the app attaches the photos first). The composite
//    SET NULL FKs clear only the nullable column ("SET NULL (column)", PG 15+).
// managers_only and silent are NOT NULL DEFAULT false (SQLite: NULL meant
// false; the data script maps NULL to false).
const ID = "[1-9][0-9]{0,8}";
const KEY = `'^(user|admin):${ID}$'`;
const userKey = (column: string) =>
  `CASE WHEN "${column}" ~ '^user:${ID}$' THEN substring("${column}" from 6)::integer END`;
const adminKey = (column: string) =>
  `CASE WHEN "${column}" ~ '^admin:${ID}$' THEN substring("${column}" from 7)::integer END`;

// [table, column, expression, target]. Same expressions as the entities
// (actor-ids.ts); migration:check compares them through typeorm_metadata.
const GENERATED: [string, string, string, "users" | "admins"][] = [
  ["chat_group_members", "member_user_id", userKey("member_key"), "users"],
  ["chat_group_members", "member_admin_id", adminKey("member_key"), "admins"],
  ["chat_group_reactions", "reactor_user_id", userKey("reactor_key"), "users"],
  [
    "chat_group_reactions",
    "reactor_admin_id",
    adminKey("reactor_key"),
    "admins",
  ],
];

const TABLES = [
  `CREATE TABLE "chat_groups" (
    "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" text NOT NULL,
    "avatar" text,
    "avatar_updated_at" TIMESTAMP WITH TIME ZONE,
    "created_by_key" text NOT NULL,
    "managers_only" boolean NOT NULL DEFAULT false,
    "last_message_id" integer,
    "last_message_at" TIMESTAMP WITH TIME ZONE,
    "last_change_at" TIMESTAMP WITH TIME ZONE,
    "dissolved_at" TIMESTAMP WITH TIME ZONE,
    "dissolved_by_admin_id" integer,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "chat_groups_dissolved_by_needs_dissolved_at" CHECK ("dissolved_by_admin_id" IS NULL OR "dissolved_at" IS NOT NULL),
    CONSTRAINT "chat_groups_created_by_key_format" CHECK ("created_by_key" ~ ${KEY}),
    CONSTRAINT "chat_groups_name_length" CHECK (char_length("name") BETWEEN 1 AND 60),
    CONSTRAINT "PK_99f0cb8163569cd32e8a16cbc9f" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "chat_group_messages" (
    "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    "group_id" integer NOT NULL,
    "kind" text NOT NULL,
    "sender_key" text,
    "body" text NOT NULL DEFAULT '',
    "system_event" text,
    "audience" text,
    "client_id" text,
    "reply_to_message_id" integer,
    "sticker_ref" text,
    "sticker_url" text,
    "photo_id" integer,
    "silent" boolean NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP WITH TIME ZONE,
    "hidden_by_key" text,
    "hidden_at" TIMESTAMP WITH TIME ZONE,
    "edited_at" TIMESTAMP WITH TIME ZONE,
    "updated_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "chat_group_messages_hidden_pair" CHECK (("hidden_by_key" IS NULL) = ("hidden_at" IS NULL)),
    CONSTRAINT "chat_group_messages_sender_matches_kind" CHECK (("kind" = 'system') = ("sender_key" IS NULL)),
    CONSTRAINT "chat_group_messages_hidden_by_key_format" CHECK ("hidden_by_key" ~ ${KEY}),
    CONSTRAINT "chat_group_messages_sender_key_format" CHECK ("sender_key" ~ ${KEY}),
    CONSTRAINT "CHK_220f65ed01e2d3d513f3c7546b" CHECK ("audience" IN ('super_admin')),
    CONSTRAINT "CHK_1b4d89295f8994a9abed703086" CHECK ("kind" IN ('message', 'system')),
    CONSTRAINT "PK_cd08baeeff6421097f4d8633e43" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "chat_group_photos" (
    "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    "group_id" integer NOT NULL,
    "message_id" integer,
    "uploader_key" text NOT NULL,
    "position" integer,
    "mime" text NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "data" bytea NOT NULL,
    "size" integer NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "CHK_e4c4f541e86dc3538c2438870d" CHECK ("mime" IN ('image/webp', 'image/jpeg', 'image/png')),
    CONSTRAINT "chat_group_photos_position_nonnegative" CHECK ("position" IS NULL OR "position" >= 0),
    CONSTRAINT "chat_group_photos_size_matches_data" CHECK ("size" = octet_length("data")),
    CONSTRAINT "chat_group_photos_uploader_key_format" CHECK ("uploader_key" ~ ${KEY}),
    CONSTRAINT "PK_639b622895abf50b6ff85648344" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "chat_group_members" (
    "group_id" integer NOT NULL,
    "member_key" text NOT NULL,
    "added_by_key" text NOT NULL,
    "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "left_at" TIMESTAMP WITH TIME ZONE,
    "removed_by_key" text,
    "muted_at" TIMESTAMP WITH TIME ZONE,
    "last_read_message_id" integer NOT NULL DEFAULT '0',
    CONSTRAINT "chat_group_members_last_read_nonnegative" CHECK ("last_read_message_id" >= 0),
    CONSTRAINT "chat_group_members_removed_needs_left_at" CHECK ("removed_by_key" IS NULL OR "left_at" IS NOT NULL),
    CONSTRAINT "chat_group_members_removed_by_key_format" CHECK ("removed_by_key" ~ ${KEY}),
    CONSTRAINT "chat_group_members_added_by_key_format" CHECK ("added_by_key" ~ ${KEY}),
    CONSTRAINT "chat_group_members_member_key_format" CHECK ("member_key" ~ ${KEY}),
    CONSTRAINT "PK_ac8a3797ab1d7a9c2e28f0d5b12" PRIMARY KEY ("group_id", "member_key")
  )`,
  `CREATE TABLE "chat_group_reactions" (
    "message_id" integer NOT NULL,
    "reactor_key" text NOT NULL,
    "emoji" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "chat_group_reactions_reactor_key_format" CHECK ("reactor_key" ~ ${KEY}),
    CONSTRAINT "PK_ac75639987dc68598e17e72887a" PRIMARY KEY ("message_id", "reactor_key")
  )`,
  `CREATE TABLE "chat_group_message_edits" (
    "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    "message_id" integer NOT NULL,
    "previous_body" text NOT NULL,
    "edited_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "PK_1b9f6e0281c60623c91d2581b26" PRIMARY KEY ("id")
  )`,
];

const INDEXES = [
  `CREATE INDEX "chat_groups_dissolved_by_admin_id_idx" ON "chat_groups" ("dissolved_by_admin_id")`,
  `CREATE INDEX "chat_groups_last_message_id_idx" ON "chat_groups" ("last_message_id")`,
  `CREATE INDEX "chat_groups_dissolved_last_message" ON "chat_groups" ("dissolved_at", "last_message_at")`,
  `CREATE INDEX "chat_group_messages_sender_key_idx" ON "chat_group_messages" ("sender_key")`,
  `CREATE INDEX "chat_group_messages_photo_id_idx" ON "chat_group_messages" ("photo_id")`,
  `CREATE INDEX "chat_group_messages_reply_to_message_id_idx" ON "chat_group_messages" ("reply_to_message_id")`,
  `CREATE UNIQUE INDEX "chat_group_messages_group_client" ON "chat_group_messages" ("group_id", "client_id")`,
  `CREATE UNIQUE INDEX "chat_group_messages_id_photo" ON "chat_group_messages" ("id", "photo_id")`,
  `CREATE UNIQUE INDEX "chat_group_messages_group_id" ON "chat_group_messages" ("group_id", "id")`,
  `CREATE INDEX "chat_group_photos_uploader_key_idx" ON "chat_group_photos" ("uploader_key")`,
  `CREATE INDEX "chat_group_photos_group" ON "chat_group_photos" ("group_id")`,
  `CREATE UNIQUE INDEX "chat_group_photos_message_position" ON "chat_group_photos" ("message_id", "position") WHERE "message_id" IS NOT NULL AND "position" IS NOT NULL`,
  `CREATE UNIQUE INDEX "chat_group_photos_message_photo" ON "chat_group_photos" ("message_id", "id")`,
  `CREATE INDEX "chat_group_members_member_admin_id_idx" ON "chat_group_members" ("member_admin_id") WHERE "member_admin_id" IS NOT NULL`,
  `CREATE INDEX "chat_group_members_member_user_id_idx" ON "chat_group_members" ("member_user_id") WHERE "member_user_id" IS NOT NULL`,
  `CREATE INDEX "chat_group_members_member" ON "chat_group_members" ("member_key", "left_at")`,
  `CREATE INDEX "chat_group_reactions_reactor_admin_id_idx" ON "chat_group_reactions" ("reactor_admin_id") WHERE "reactor_admin_id" IS NOT NULL`,
  `CREATE INDEX "chat_group_reactions_reactor_user_id_idx" ON "chat_group_reactions" ("reactor_user_id") WHERE "reactor_user_id" IS NOT NULL`,
  `CREATE INDEX "chat_group_message_edits_message" ON "chat_group_message_edits" ("message_id")`,
];

// [table, constraint, definition]
const FOREIGN_KEYS: [string, string, string][] = [
  [
    "chat_groups",
    "FK_cfad27a41b4298c8e03355379e6",
    `FOREIGN KEY ("dissolved_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  ],
  [
    "chat_groups",
    "fk_chat_groups_last_message",
    `FOREIGN KEY ("id", "last_message_id") REFERENCES "chat_group_messages"("group_id", "id") ON DELETE SET NULL ("last_message_id") ON UPDATE NO ACTION`,
  ],
  [
    "chat_group_messages",
    "FK_9f4254b1ba41a98780611503013",
    `FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  ],
  [
    "chat_group_messages",
    "fk_chat_group_messages_reply_in_group",
    `FOREIGN KEY ("group_id", "reply_to_message_id") REFERENCES "chat_group_messages"("group_id", "id") ON DELETE SET NULL ("reply_to_message_id") ON UPDATE NO ACTION`,
  ],
  [
    "chat_group_messages",
    "fk_chat_group_messages_photo",
    `FOREIGN KEY ("id", "photo_id") REFERENCES "chat_group_photos"("message_id", "id") ON DELETE SET NULL ("photo_id") ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
  ],
  [
    "chat_group_photos",
    "FK_b28855898e0d2f6e1daaffa56fd",
    `FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  ],
  [
    "chat_group_photos",
    "fk_chat_group_photos_message",
    `FOREIGN KEY ("group_id", "message_id") REFERENCES "chat_group_messages"("group_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
  ],
  [
    "chat_group_members",
    "FK_022c85da17c68d3047c2e6261bb",
    `FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  ],
  [
    "chat_group_reactions",
    "FK_7d4c7ef6084a6cf0b8c4abb4a43",
    `FOREIGN KEY ("message_id") REFERENCES "chat_group_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  ],
  [
    "chat_group_message_edits",
    "FK_10de5b5ce2fba0a6e3556f61e89",
    `FOREIGN KEY ("message_id") REFERENCES "chat_group_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  ],
];

// Children first.
const DROP_ORDER = [
  "chat_group_message_edits",
  "chat_group_reactions",
  "chat_group_members",
  "chat_group_photos",
  "chat_group_messages",
  "chat_groups",
];

export class ChatGroups1795900000000 implements MigrationInterface {
  name = "ChatGroups1795900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    const schema = await queryRunner.getCurrentSchema();

    for (const statement of TABLES) {
      await queryRunner.query(statement);
    }

    // TypeORM keeps the expression of a generated column in typeorm_metadata
    // (DbIntegrity created the table) and compares it in migration:check.
    for (const [table, column, expression, target] of GENERATED) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "${column}" integer GENERATED ALWAYS AS (${expression}) STORED`,
      );
      await queryRunner.query(
        `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
        [database, schema, table, "GENERATED_COLUMN", column, expression],
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "fk_${table}_${column}" FOREIGN KEY ("${column}") REFERENCES "${target}"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }

    for (const statement of INDEXES) {
      await queryRunner.query(statement);
    }

    for (const [table, name, definition] of FOREIGN_KEYS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${definition}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    const schema = await queryRunner.getCurrentSchema();

    for (const [table, column] of GENERATED) {
      await queryRunner.query(
        `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3 AND "table" = $4 AND "database" = $5`,
        ["GENERATED_COLUMN", column, schema, table, database],
      );
    }

    await queryRunner.query(
      `DROP TABLE ${DROP_ORDER.map((table) => `"${table}"`).join(", ")} CASCADE`,
    );
  }
}
