import { MigrationInterface, QueryRunner } from "typeorm";

// Tighter schema for chat, direct messages and social (twelve fixes, one
// migration). Not additive: it drops columns and a table and makes `silent`
// NOT NULL, so the previous API version cannot run against it.
//
//  1. size = octet_length(data) on every table that stores image bytes.
//  2. chat_messages.silent NOT NULL DEFAULT false (NULL meant "not silent").
//  3. chat_messages.attachment_url / attachment_meta dropped (no reader or
//     writer since photos got their own table). sticker_url stays: a message
//     keeps rendering its sticker after the custom sticker was deleted.
//  4. A reply points at a message of the SAME conversation (composite FK).
//  5. last_message_id points at a message of its own conversation.
//  6. Photo <-> message / post: both directions exist (photo.message_id and
//     message.photo_id), and a pair of composite FKs makes them agree. The
//     message side is checked immediately, the photo side DEFERRABLE INITIALLY
//     DEFERRED because the app (and the data script) set one side first.
//  7. user_low < user_high on dm_conversations and social_friendships, and the
//     requester of a friendship is one of the two.
//  8. chat_nicknames dropped (replaced by contact_aliases; nothing reads it).
//  9. One open report per reporter and target; status and resolution agree.
// 10. chat_photos_conversation dropped (a prefix of chat_photos_uploader_client).
// (11. the NULL role branches of two queries live in the code, not here.)
//
// The composite FKs use "ON DELETE SET NULL (column)" (PostgreSQL 15+) so
// deleting the parent only clears the nullable column and never the key part
// that is also the row's own id or conversation.

const IMAGE_TABLES = [
  "chat_photos",
  "dm_photos",
  "social_post_photos",
  "chat_custom_stickers",
  "user_avatars",
  "admin_avatars",
];
const sizeCheck = (table: string) => `${table}_size_matches_data`;

type Fk = {
  table: string;
  name: string;
  columns: string;
  parent: string;
  parentColumns: string;
  action: string;
  deferred?: boolean;
};

const FK = {
  reply: {
    table: "chat_messages",
    name: "fk_chat_messages_reply_in_conversation",
    columns: `"conversation_id", "reply_to_message_id"`,
    parent: "chat_messages",
    parentColumns: `"conversation_id", "id"`,
    action: `SET NULL ("reply_to_message_id")`,
  },
  chatLast: {
    table: "chat_conversations",
    name: "fk_chat_conversations_last_message",
    columns: `"id", "last_message_id"`,
    parent: "chat_messages",
    parentColumns: `"conversation_id", "id"`,
    action: `SET NULL ("last_message_id")`,
  },
  dmLast: {
    table: "dm_conversations",
    name: "fk_dm_conversations_last_message",
    columns: `"id", "last_message_id"`,
    parent: "dm_messages",
    parentColumns: `"conversation_id", "id"`,
    action: `SET NULL ("last_message_id")`,
  },
  chatMessagePhoto: {
    table: "chat_messages",
    name: "fk_chat_messages_photo",
    columns: `"id", "photo_id"`,
    parent: "chat_photos",
    parentColumns: `"message_id", "id"`,
    action: `SET NULL ("photo_id")`,
  },
  chatPhotoMessage: {
    table: "chat_photos",
    name: "fk_chat_photos_message",
    columns: `"message_id", "id"`,
    parent: "chat_messages",
    parentColumns: `"id", "photo_id"`,
    action: "CASCADE",
    deferred: true,
  },
  dmMessagePhoto: {
    table: "dm_messages",
    name: "fk_dm_messages_photo",
    columns: `"id", "photo_id"`,
    parent: "dm_photos",
    parentColumns: `"message_id", "id"`,
    action: `SET NULL ("photo_id")`,
  },
  dmPhotoMessage: {
    table: "dm_photos",
    name: "fk_dm_photos_message",
    columns: `"message_id", "id"`,
    parent: "dm_messages",
    parentColumns: `"id", "photo_id"`,
    action: "CASCADE",
    deferred: true,
  },
  postPhoto: {
    table: "social_posts",
    name: "fk_social_posts_photo",
    columns: `"id", "photo_id"`,
    parent: "social_post_photos",
    parentColumns: `"post_id", "id"`,
    action: `SET NULL ("photo_id")`,
  },
  photoPost: {
    table: "social_post_photos",
    name: "fk_social_post_photos_post",
    columns: `"post_id", "id"`,
    parent: "social_posts",
    parentColumns: `"id", "photo_id"`,
    action: "CASCADE",
    deferred: true,
  },
} satisfies Record<string, Fk>;

// The single-column FKs of the baseline that the composite ones replace.
const OLD_FK: { table: string; name: string; column: string; parent: string; action: string }[] = [
  { table: "chat_messages", name: "FK_686a3bfebb7545534342c5fa272", column: "reply_to_message_id", parent: "chat_messages", action: "SET NULL" },
  { table: "chat_conversations", name: "FK_62f2a55e7ad59ec2830ad3a29fd", column: "last_message_id", parent: "chat_messages", action: "SET NULL" },
  { table: "dm_conversations", name: "FK_aacfadeec6165182891b05ffda7", column: "last_message_id", parent: "dm_messages", action: "SET NULL" },
  { table: "chat_messages", name: "FK_35037bafe2cad5183bdb922158e", column: "photo_id", parent: "chat_photos", action: "SET NULL" },
  { table: "chat_photos", name: "FK_7eb3699a19274f3fddcc68f7862", column: "message_id", parent: "chat_messages", action: "CASCADE" },
  { table: "dm_messages", name: "FK_6977f1d1b3724812a0981a56a99", column: "photo_id", parent: "dm_photos", action: "SET NULL" },
  { table: "dm_photos", name: "FK_15c5be7038229684679d68a6a15", column: "message_id", parent: "dm_messages", action: "CASCADE" },
  { table: "social_posts", name: "FK_c2f4eb885e6e04039c887dc7223", column: "photo_id", parent: "social_post_photos", action: "SET NULL" },
  { table: "social_post_photos", name: "FK_ee0dd655ef2b674035e242f49ed", column: "post_id", parent: "social_posts", action: "CASCADE" },
];

// Index swaps: [table, old (non-unique) index, its columns, new unique index,
// its columns]. A composite FK needs a unique index on the referenced columns;
// the new one starts with the old one's columns, so the old one goes.
const UNIQUE_SWAPS: [string, string, string, string, string][] = [
  ["chat_messages", "chat_messages_conversation_id", `"conversation_id", "id"`, "chat_messages_conversation_id", `"conversation_id", "id"`],
  ["dm_messages", "dm_messages_conversation_id", `"conversation_id", "id"`, "dm_messages_conversation_id", `"conversation_id", "id"`],
  ["chat_photos", "chat_photos_message", `"message_id"`, "chat_photos_message_photo", `"message_id", "id"`],
  ["dm_photos", "dm_photos_message", `"message_id"`, "dm_photos_message_photo", `"message_id", "id"`],
  ["social_post_photos", "social_post_photos_post", `"post_id"`, "social_post_photos_post_photo", `"post_id", "id"`],
];
// Unique only so that the photo side can reference it.
const EXTRA_UNIQUE: [string, string][] = [
  ["chat_messages", "chat_messages_id_photo"],
  ["dm_messages", "dm_messages_id_photo"],
  ["social_posts", "social_posts_id_photo"],
];

const addFk = (queryRunner: QueryRunner, fk: Fk) =>
  queryRunner.query(
    `ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}" FOREIGN KEY (${fk.columns}) REFERENCES "${fk.parent}" (${fk.parentColumns}) ON DELETE ${fk.action} ON UPDATE NO ACTION${fk.deferred ? " DEFERRABLE INITIALLY DEFERRED" : ""}`,
  );

export class DbChatSocial1795200000000 implements MigrationInterface {
  name = "DbChatSocial1795200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Stored size equals the stored bytes.
    for (const table of IMAGE_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${sizeCheck(table)}" CHECK ("size" = octet_length("data"))`,
      );
    }

    // 2. silent: a message is silent or it is not.
    await queryRunner.query(
      `UPDATE "chat_messages" SET "silent" = false WHERE "silent" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "silent" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "silent" SET NOT NULL`,
    );

    // 3. Legacy attachment columns (nothing in the API or web uses them).
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP COLUMN "attachment_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP COLUMN "attachment_meta"`,
    );

    // 8. The shared nicknames were turned into private aliases long ago.
    await queryRunner.query(`DROP TABLE "chat_nicknames"`);

    // 10. Redundant: chat_photos_uploader_client starts with conversation_id.
    await queryRunner.query(`DROP INDEX "public"."chat_photos_conversation"`);

    // 4, 5, 6. Unique keys first, then the composite FKs in place of the
    // single-column ones.
    for (const old of OLD_FK) {
      await queryRunner.query(
        `ALTER TABLE "${old.table}" DROP CONSTRAINT "${old.name}"`,
      );
    }
    for (const [table, oldIndex, , index, columns] of UNIQUE_SWAPS) {
      await queryRunner.query(`DROP INDEX "public"."${oldIndex}"`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX "${index}" ON "${table}" (${columns})`,
      );
    }
    for (const [table, index] of EXTRA_UNIQUE) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX "${index}" ON "${table}" ("id", "photo_id")`,
      );
    }
    for (const fk of Object.values(FK)) {
      await addFk(queryRunner, fk);
    }

    // 7. Pair order and the requester of a friendship.
    await queryRunner.query(
      `ALTER TABLE "dm_conversations" ADD CONSTRAINT "dm_conversations_users_ordered" CHECK ("user_low" < "user_high")`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_friendships" ADD CONSTRAINT "social_friendships_users_ordered" CHECK ("user_low" < "user_high")`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_friendships" ADD CONSTRAINT "social_friendships_requested_by_member" CHECK ("requested_by" IN ("user_low", "user_high"))`,
    );

    // 9. One open report per reporter and target (the app already refused a
    // second one, but check-then-insert races). Duplicates that exist are
    // identical, so the oldest stays.
    await queryRunner.query(
      `DELETE FROM "social_reports" r USING "social_reports" older
        WHERE r."status" = 'open' AND older."status" = 'open'
          AND r."reporter_key" = older."reporter_key"
          AND r."target_kind" = older."target_kind"
          AND r."target_id" = older."target_id"
          AND older."id" < r."id"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "social_reports_open_unique" ON "social_reports" ("reporter_key", "target_kind", "target_id") WHERE "status" = 'open'`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_status_resolution" CHECK (("status" = 'open' AND "resolution" IS NULL AND "resolved_at" IS NULL AND "resolved_by" IS NULL) OR ("status" = 'resolved' AND "resolution" IS NOT NULL AND "resolved_at" IS NOT NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "social_reports_status_resolution"`,
    );
    await queryRunner.query(`DROP INDEX "public"."social_reports_open_unique"`);

    await queryRunner.query(
      `ALTER TABLE "social_friendships" DROP CONSTRAINT "social_friendships_requested_by_member"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_friendships" DROP CONSTRAINT "social_friendships_users_ordered"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dm_conversations" DROP CONSTRAINT "dm_conversations_users_ordered"`,
    );

    for (const fk of [...Object.values(FK)].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${fk.table}" DROP CONSTRAINT "${fk.name}"`,
      );
    }
    for (const [, index] of [...EXTRA_UNIQUE].reverse()) {
      await queryRunner.query(`DROP INDEX "public"."${index}"`);
    }
    for (const [table, oldIndex, oldColumns, index] of [
      ...UNIQUE_SWAPS,
    ].reverse()) {
      await queryRunner.query(`DROP INDEX "public"."${index}"`);
      await queryRunner.query(
        `CREATE INDEX "${oldIndex}" ON "${table}" (${oldColumns})`,
      );
    }
    for (const old of [...OLD_FK].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${old.table}" ADD CONSTRAINT "${old.name}" FOREIGN KEY ("${old.column}") REFERENCES "${old.parent}" ("id") ON DELETE ${old.action} ON UPDATE NO ACTION`,
      );
    }

    await queryRunner.query(
      `CREATE INDEX "chat_photos_conversation" ON "chat_photos" ("conversation_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "chat_nicknames" (
        "conversation_id" integer NOT NULL,
        "target_key" text NOT NULL,
        "nickname" text NOT NULL,
        "set_by_key" text NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_6b970e2c7189c401face1a838e2" PRIMARY KEY ("conversation_id", "target_key")
      )`);
    await queryRunner.query(
      `ALTER TABLE "chat_nicknames" ADD CONSTRAINT "FK_81b116608de66734860b4dcd2ef" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // The attachment values are gone for good; the columns come back empty.
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD "attachment_meta" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD "attachment_url" text`,
    );

    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "silent" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ALTER COLUMN "silent" DROP DEFAULT`,
    );

    for (const table of [...IMAGE_TABLES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${sizeCheck(table)}"`,
      );
    }
  }
}
