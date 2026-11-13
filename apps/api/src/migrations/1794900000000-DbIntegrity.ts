import { MigrationInterface, QueryRunner } from "typeorm";

// Database integrity (four fixes, one migration):
//
// 1. btree indexes for the text keys account deletion filters on
//    (SocialCleanupService, TraineeDeletionService) that no index led with.
// 2. Real foreign keys for the text-keyed / kind+id references to users and
//    admins: STORED generated columns extract the account id, a FK with
//    ON DELETE CASCADE checks it, a partial index serves the cascade. The app
//    keeps writing the text key. A key that is not account-shaped gives NULL.
//    CHECKs make every such key well formed (a well-formed key is FK-checked,
//    nothing else can be stored) and every kind + id id positive.
// 3. Message dedup key scoped by sender: a retry by the same sender finds the
//    original, another sender may reuse the same client_id.
// 4. CHECK: a trainee message never carries an admin id.
//
// Loading dirty rows (dangling keys, a user message with an admin id) now
// fails, so scripts/migrate-from-turso.ts scans for them first.

const ID = "[1-9][0-9]{0,8}";
const userKey = (column: string) =>
  `CASE WHEN "${column}" ~ '^user:${ID}$' THEN substring("${column}" from 6)::integer END`;
const adminKey = (column: string) =>
  `CASE WHEN "${column}" ~ '^admin:${ID}$' THEN substring("${column}" from 7)::integer END`;
const kind = (kindColumn: string, idColumn: string, value: string) =>
  `CASE WHEN "${kindColumn}" = '${value}' THEN "${idColumn}" END`;

type Generated = {
  table: string;
  column: string;
  expression: string;
  target: "users" | "admins";
};

const user = (
  table: string,
  column: string,
  expression: string,
): Generated => ({ table, column, expression, target: "users" });
const admin = (
  table: string,
  column: string,
  expression: string,
): Generated => ({ table, column, expression, target: "admins" });

// These expressions must equal `asExpression` in the entities
// (database/entities/actor-ids.ts); migration:check fails when they differ.
const GENERATED: Generated[] = [
  // social scheme: "user:<id>" / "admin:<id>"
  user("social_comments", "author_user_id", userKey("author_key")),
  admin("social_comments", "author_admin_id", adminKey("author_key")),
  user("social_reactions", "reactor_user_id", userKey("reactor_key")),
  admin("social_reactions", "reactor_admin_id", adminKey("reactor_key")),
  user("social_notifications", "recipient_user_id", userKey("recipient_key")),
  admin(
    "social_notifications",
    "recipient_admin_id",
    adminKey("recipient_key"),
  ),
  user("social_notifications", "actor_user_id", userKey("actor_key")),
  admin("social_notifications", "actor_admin_id", adminKey("actor_key")),
  user("social_reports", "reporter_user_id", userKey("reporter_key")),
  admin("social_reports", "reporter_admin_id", adminKey("reporter_key")),
  user(
    "social_reports",
    "target_user_id",
    kind("target_kind", "target_id", "user"),
  ),
  user("social_post_photos", "uploader_user_id", userKey("uploader_key")),
  admin("social_post_photos", "uploader_admin_id", adminKey("uploader_key")),
  // kind + id pairs
  user(
    "social_posts",
    "author_user_id",
    kind("author_kind", "author_id", "user"),
  ),
  admin(
    "social_posts",
    "author_admin_id",
    kind("author_kind", "author_id", "admin"),
  ),
  user(
    "chat_custom_stickers",
    "owner_user_id",
    kind("owner_kind", "owner_id", "user"),
  ),
  admin(
    "chat_custom_stickers",
    "owner_admin_id",
    kind("owner_kind", "owner_id", "admin"),
  ),
  // push and aliases: "user:<id>" / "admin:<id>" (alias target also "pt")
  user("push_subscriptions", "owner_user_id", userKey("owner_key")),
  admin("push_subscriptions", "owner_admin_id", adminKey("owner_key")),
  user("contact_aliases", "owner_user_id", userKey("owner_key")),
  admin("contact_aliases", "owner_admin_id", adminKey("owner_key")),
  user("contact_aliases", "target_user_id", userKey("target_key")),
  admin("contact_aliases", "target_admin_id", adminKey("target_key")),
  // chat scheme: "user" (the conversation's trainee, covered by the
  // conversation's own FK) / "admin:<id>"
  admin("chat_photos", "uploader_admin_id", adminKey("uploader_key")),
  admin("chat_reactions", "reactor_admin_id", adminKey("reactor_key")),
  admin("chat_reads", "reader_admin_id", adminKey("reader_key")),
];

// Fix 1: [index, table, columns]
const LOOKUP_INDEXES: [string, string, string][] = [
  ["social_comments_author_key_idx", "social_comments", `"author_key"`],
  ["social_reactions_reactor_key_idx", "social_reactions", `"reactor_key"`],
  ["social_notifications_actor_key_idx", "social_notifications", `"actor_key"`],
  ["social_reports_reporter_key_idx", "social_reports", `"reporter_key"`],
  ["social_reports_target_idx", "social_reports", `"target_kind", "target_id"`],
  [
    "social_post_photos_uploader_key_idx",
    "social_post_photos",
    `"uploader_key"`,
  ],
  ["contact_aliases_target_key_idx", "contact_aliases", `"target_key"`],
];

const social = (column: string) => `"${column}" ~ '^(user|admin):${ID}$'`;
const chat = (column: string) => `"${column}" ~ '^(user|admin:${ID})$'`;
const aliasTarget = (column: string) =>
  `"${column}" ~ '^((user|admin):${ID}|pt)$'`;

// Fix 2b: [table, constraint, expression]. Same expressions as the entities.
const FORMAT_CHECKS: [string, string, string][] = (
  [
    ["social_comments", "author_key", social("author_key")],
    ["social_reactions", "reactor_key", social("reactor_key")],
    ["social_notifications", "recipient_key", social("recipient_key")],
    ["social_notifications", "actor_key", social("actor_key")],
    ["social_reports", "reporter_key", social("reporter_key")],
    ["social_post_photos", "uploader_key", social("uploader_key")],
    ["push_subscriptions", "owner_key", social("owner_key")],
    ["contact_aliases", "owner_key", social("owner_key")],
    ["contact_aliases", "target_key", aliasTarget("target_key")],
    ["chat_photos", "uploader_key", chat("uploader_key")],
    ["chat_reactions", "reactor_key", chat("reactor_key")],
    ["chat_reads", "reader_key", chat("reader_key")],
    ["social_posts", "author_id", `"author_id" > 0`],
    ["chat_custom_stickers", "owner_id", `"owner_id" > 0`],
    ["social_reports", "target_id", `"target_id" > 0`],
  ] as [string, string, string][]
).map(([table, column, expression]) => [
  table,
  `${table}_${column}_${column.endsWith("_id") ? "positive" : "format"}`,
  expression,
]);

const fkName = (g: Generated) => `fk_${g.table}_${g.column}`;
const indexName = (g: Generated) => `${g.table}_${g.column}_idx`;

export class DbIntegrity1794900000000 implements MigrationInterface {
  name = "DbIntegrity1794900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Lookup indexes.
    for (const [index, table, columns] of LOOKUP_INDEXES) {
      await queryRunner.query(
        `CREATE INDEX "${index}" ON "${table}" (${columns})`,
      );
    }

    // 2. Generated account ids with real foreign keys. TypeORM keeps the
    // expression of a generated column in typeorm_metadata and compares it.
    const database = await queryRunner.getCurrentDatabase();
    const schema = await queryRunner.getCurrentSchema();

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "typeorm_metadata" ("type" character varying NOT NULL, "database" character varying, "schema" character varying, "table" character varying, "name" character varying, "value" text)`,
    );
    for (const g of GENERATED) {
      await queryRunner.query(
        `ALTER TABLE "${g.table}" ADD "${g.column}" integer GENERATED ALWAYS AS (${g.expression}) STORED`,
      );
      await queryRunner.query(
        `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
        [database, schema, g.table, "GENERATED_COLUMN", g.column, g.expression],
      );
      await queryRunner.query(
        `ALTER TABLE "${g.table}" ADD CONSTRAINT "${fkName(g)}" FOREIGN KEY ("${g.column}") REFERENCES "${g.target}"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `CREATE INDEX "${indexName(g)}" ON "${g.table}" ("${g.column}") WHERE "${g.column}" IS NOT NULL`,
      );
    }

    // 2b. Well-formed keys only. A malformed value in existing rows fails here.
    for (const [table, name, expression] of FORMAT_CHECKS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`,
      );
    }

    // 3. Message dedup keys scoped by sender.
    await queryRunner.query(
      `DROP INDEX "public"."chat_messages_conversation_client"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "chat_messages_conversation_sender_client" ON "chat_messages" ("conversation_id", "sender_role", (COALESCE("sender_admin_id", 0)), "client_id")`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."dm_messages_conversation_client"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "dm_messages_conversation_sender_client" ON "dm_messages" ("conversation_id", "sender_id", "client_id")`,
    );

    // 4. A trainee message has no admin sender.
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_has_no_admin" CHECK ("sender_role" <> 'user' OR "sender_admin_id" IS NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_user_has_no_admin"`,
    );

    for (const [table, name] of [...FORMAT_CHECKS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`,
      );
    }

    await queryRunner.query(
      `DROP INDEX "public"."dm_messages_conversation_sender_client"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "dm_messages_conversation_client" ON "dm_messages" ("conversation_id", "client_id")`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."chat_messages_conversation_sender_client"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "chat_messages_conversation_client" ON "chat_messages" ("conversation_id", "client_id")`,
    );

    const database = await queryRunner.getCurrentDatabase();
    const schema = await queryRunner.getCurrentSchema();

    for (const g of [...GENERATED].reverse()) {
      await queryRunner.query(`DROP INDEX "public"."${indexName(g)}"`);
      await queryRunner.query(
        `ALTER TABLE "${g.table}" DROP CONSTRAINT "${fkName(g)}"`,
      );
      await queryRunner.query(
        `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3 AND "table" = $4 AND "database" = $5`,
        ["GENERATED_COLUMN", g.column, schema, g.table, database],
      );
      await queryRunner.query(
        `ALTER TABLE "${g.table}" DROP COLUMN "${g.column}"`,
      );
    }

    // TypeORM's own table, created by this migration when it was missing.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM "typeorm_metadata") THEN
          DROP TABLE "typeorm_metadata";
        END IF;
      END $$`);

    for (const [index] of [...LOOKUP_INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX "public"."${index}"`);
    }
  }
}
