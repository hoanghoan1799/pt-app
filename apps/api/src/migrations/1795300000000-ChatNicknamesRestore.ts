import { MigrationInterface, QueryRunner } from "typeorm";

// Messenger-style shared nicknames are back (docs/specs/messenger-nicknames.md
// of the company repo): one nickname per member of a conversation, seen by
// everybody in it. DbChatSocial dropped the table because nothing read it
// (private contact_aliases had replaced it); this recreates it, empty, with the
// constraints the neighbouring chat tables have. Additive: a new table only
// (contact_aliases and its rows stay, they are used outside chat), so the
// previous API version keeps working.
//
// - Primary key (conversation_id, target_key): one nickname per member.
// - conversation_id -> chat_conversations ON DELETE CASCADE: deleting a
//   trainee (or their conversation) clears every nickname in it.
// - target_key is "user" | "pt" | "admin:<id>", set_by_key "user" | "admin:<id>";
//   the target admin id is a STORED generated column with a real FK (CASCADE:
//   the nickname of a removed admin goes with them). The setter is only
//   format-checked, so removing the admin who typed a nickname does not erase
//   what somebody else is called.
// - nickname is 1 to 30 characters (a cleared nickname has no row).

const ID = "[1-9][0-9]{0,8}";
const TARGET_ADMIN_EXPRESSION = `CASE WHEN "target_key" ~ '^admin:${ID}$' THEN substring("target_key" from 7)::integer END`;

export class ChatNicknamesRestore1795300000000 implements MigrationInterface {
  name = "ChatNicknamesRestore1795300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_nicknames" (
        "conversation_id" integer NOT NULL,
        "target_key" text NOT NULL,
        "nickname" text NOT NULL,
        "set_by_key" text NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "target_admin_id" integer GENERATED ALWAYS AS (${TARGET_ADMIN_EXPRESSION}) STORED,
        CONSTRAINT "chat_nicknames_target_key_format" CHECK ("target_key" ~ '^(user|pt|admin:${ID})$'),
        CONSTRAINT "chat_nicknames_set_by_key_format" CHECK ("set_by_key" ~ '^(user|admin:${ID})$'),
        CONSTRAINT "chat_nicknames_nickname_length" CHECK (char_length("nickname") BETWEEN 1 AND 30),
        CONSTRAINT "PK_6b970e2c7189c401face1a838e2" PRIMARY KEY ("conversation_id", "target_key")
      )`);

    // TypeORM keeps the expression of a generated column in typeorm_metadata
    // and compares it (see DbIntegrity).
    const database = await queryRunner.getCurrentDatabase();
    const schema = await queryRunner.getCurrentSchema();

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "typeorm_metadata" ("type" character varying NOT NULL, "database" character varying, "schema" character varying, "table" character varying, "name" character varying, "value" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        schema,
        "chat_nicknames",
        "GENERATED_COLUMN",
        "target_admin_id",
        TARGET_ADMIN_EXPRESSION,
      ],
    );
    await queryRunner.query(
      `ALTER TABLE "chat_nicknames" ADD CONSTRAINT "fk_chat_nicknames_target_admin_id" FOREIGN KEY ("target_admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "chat_nicknames_target_admin_id_idx" ON "chat_nicknames" ("target_admin_id") WHERE "target_admin_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_nicknames" ADD CONSTRAINT "FK_81b116608de66734860b4dcd2ef" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = 'GENERATED_COLUMN' AND "table" = 'chat_nicknames' AND "name" = 'target_admin_id'`,
    );
    // Dropping the table drops its constraints and indexes.
    await queryRunner.query(`DROP TABLE "chat_nicknames"`);
  }
}
