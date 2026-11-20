import { MigrationInterface, QueryRunner } from "typeorm";

// Three keys of the company/main tables (UserRestrictions, ChatGroups) that
// let wrong rows in:
//
// 1. chat_group_messages: the retry key was (group_id, client_id), so a member
//    who reused another member's client_id got that member's message back as
//    "already sent". Scoped by sender, as DbIntegrity did for chat_messages
//    and dm_messages: (group_id, sender_key, client_id). System lines have no
//    sender and no client id (NULLs differ), as before.
//
// 2. chat_group_members.last_read_message_id was NOT NULL DEFAULT 0 with no
//    foreign key, so a cursor could name another group's message or a message
//    that is gone. Now NULL = nothing read, and a composite FK
//    (group_id, last_read_message_id) -> chat_group_messages (group_id, id)
//    keeps it inside the group. Deleting the message clears only the cursor
//    ("SET NULL (column)", PG 15+), never group_id. Read cursors compare ids
//    (unread = id > cursor, NULL as 0), so this changes no count: messages are
//    soft-deleted (deleted_at) and only a group delete removes rows, which
//    takes the member rows with it.
//    Existing rows: 0, and a cursor whose message is missing or in another
//    group, become NULL before the FK is added.
//
// 3. user_restrictions: nothing stopped two active rows for one trainee.
//    "Active" here is lifted_at IS NULL (an index cannot use now(); a row past
//    its `until` but never lifted still holds the slot, so a new block lifts it
//    too). One per trainee via a partial UNIQUE index, and a CHECK that a row
//    is not lifted before it was created.
//    Existing rows, in this order:
//     a. lifted_at before created_at becomes created_at;
//     b. per trainee, the newest row that is not lifted (created_at, then id)
//        stays active. Each older one is lifted when the next newer one
//        replaced it (that row's created_at), or at its own `until` when it
//        had already ended before that, never before its own created_at.
//        lifted_by_admin_id is kept (NULL here: the existing CHECK allows
//        it only with lifted_at, so a row not lifted has none). The
//        moments come from the rows, not now(), so the data script
//        (scripts/migrate/company-features.ts) computes the same values.
//
// Additive for the previous API version: it reads and writes none of these
// tables (only the data script does).
export class GroupChatRestrictionKeys1796100000000 implements MigrationInterface {
  name = "GroupChatRestrictionKeys1796100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Retry key per sender.
    await queryRunner.query(
      `DROP INDEX "public"."chat_group_messages_group_client"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "chat_group_messages_group_sender_client" ON "chat_group_messages" ("group_id", "sender_key", "client_id")`,
    );

    // 2. Read cursor: NULL = nothing read, always a message of the group.
    await queryRunner.query(
      `ALTER TABLE "chat_group_members" ALTER COLUMN "last_read_message_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_group_members" ALTER COLUMN "last_read_message_id" DROP DEFAULT`,
    );
    await queryRunner.query(
      `UPDATE "chat_group_members" AS m SET "last_read_message_id" = NULL
        WHERE m."last_read_message_id" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "chat_group_messages" g
             WHERE g."group_id" = m."group_id" AND g."id" = m."last_read_message_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_group_members" ADD CONSTRAINT "fk_chat_group_members_last_read" FOREIGN KEY ("group_id", "last_read_message_id") REFERENCES "chat_group_messages"("group_id", "id") ON DELETE SET NULL ("last_read_message_id") ON UPDATE NO ACTION`,
    );

    // 3a. Not lifted before created.
    await queryRunner.query(
      `UPDATE "user_restrictions" SET "lifted_at" = "created_at" WHERE "lifted_at" < "created_at"`,
    );
    // 3b. One active row per trainee: the newest; the older ones lifted.
    // lag() over the newest-first order is the next newer row.
    await queryRunner.query(
      `WITH active AS (
         SELECT "id", "created_at", "until",
                lag("created_at") OVER (
                  PARTITION BY "user_id" ORDER BY "created_at" DESC, "id" DESC
                ) AS "replaced_at"
           FROM "user_restrictions"
          WHERE "lifted_at" IS NULL
       )
       UPDATE "user_restrictions" AS r
          SET "lifted_at" = GREATEST(a."created_at", LEAST(a."replaced_at", a."until"))
         FROM active AS a
        WHERE r."id" = a."id" AND a."replaced_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_lifted_after_created" CHECK ("lifted_at" IS NULL OR "lifted_at" >= "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "user_restrictions_one_active" ON "user_restrictions" ("user_id") WHERE "lifted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Repaired rows stay repaired (lifted rows stay lifted, cleared cursors
    // read 0 = nothing read); only the rules are loosened again.
    await queryRunner.query(
      `DROP INDEX "public"."user_restrictions_one_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_restrictions" DROP CONSTRAINT "user_restrictions_lifted_after_created"`,
    );

    await queryRunner.query(
      `ALTER TABLE "chat_group_members" DROP CONSTRAINT "fk_chat_group_members_last_read"`,
    );
    await queryRunner.query(
      `UPDATE "chat_group_members" SET "last_read_message_id" = 0 WHERE "last_read_message_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_group_members" ALTER COLUMN "last_read_message_id" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_group_members" ALTER COLUMN "last_read_message_id" SET NOT NULL`,
    );

    // Fails if two senders of a group now share a client_id, like the
    // DbIntegrity down.
    await queryRunner.query(
      `DROP INDEX "public"."chat_group_messages_group_sender_client"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "chat_group_messages_group_client" ON "chat_group_messages" ("group_id", "client_id")`,
    );
  }
}
