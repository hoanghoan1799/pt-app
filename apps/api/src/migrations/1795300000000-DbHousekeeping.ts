import { MigrationInterface, QueryRunner } from "typeorm";

// Two housekeeping fixes (additive: new functions, triggers and indexes only,
// so the previous API version keeps working against it).
//
//  1. Direct messages: dm_messages.sender_id, dm_photos.uploader_id and
//     dm_reads.user_id were plain FKs to users, nothing tied them to the two
//     people of the conversation. A constraint trigger on each table now
//     refuses a user who is not user_low or user_high of the row's
//     conversation (SQLSTATE 23514, message names table, row and conversation,
//     never content). A trigger, not a composite FK, because the pair is two
//     columns and "either" cannot be a foreign key. dm_conversations refuses
//     to change its pair at all (a changed pair would orphan every member row).
//     Rows that already break the rule are left alone: the trigger only checks
//     rows written from now on (INSERT, or UPDATE naming the user column).
//
//  2. login_attempts and rate_limits grow without bound (rows are only
//     removed by a successful login). The purge service deletes dead rows;
//     these partial indexes serve its WHERE clauses.
//       login_attempts: unlocked and window over  -> (window_started_at)
//                       lock over                 -> (locked_until)
//       rate_limits:    window over               -> (window_started_at)

const MEMBER_TABLES: [table: string, column: string][] = [
  ["dm_messages", "sender_id"],
  ["dm_photos", "uploader_id"],
  ["dm_reads", "user_id"],
];

export class DbHousekeeping1795300000000 implements MigrationInterface {
  name = "DbHousekeeping1795300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TG_ARGV[0] is the user column of the table the trigger sits on.
    await queryRunner.query(`
      CREATE FUNCTION "dm_assert_member"() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        member_id integer := (to_jsonb(NEW) ->> TG_ARGV[0])::integer;
        pair record;
      BEGIN
        IF member_id IS NULL THEN
          RETURN NULL;
        END IF;
        SELECT user_low, user_high INTO pair
          FROM dm_conversations WHERE id = NEW.conversation_id;
        -- No conversation: the foreign key reports it (or a cascade removed it).
        IF NOT FOUND THEN
          RETURN NULL;
        END IF;
        IF member_id <> pair.user_low AND member_id <> pair.user_high THEN
          RAISE EXCEPTION '% row % (conversation %): user % is not a member of the conversation',
            TG_TABLE_NAME, COALESCE(to_jsonb(NEW) ->> 'id', '-'), NEW.conversation_id, member_id
            USING ERRCODE = '23514', TABLE = TG_TABLE_NAME;
        END IF;
        RETURN NULL;
      END
      $$`);
    for (const [table, column] of MEMBER_TABLES) {
      await queryRunner.query(
        `CREATE CONSTRAINT TRIGGER "${table}_member" AFTER INSERT OR UPDATE OF "${column}", "conversation_id" ON "${table}" FOR EACH ROW EXECUTE FUNCTION "dm_assert_member"('${column}')`,
      );
    }

    await queryRunner.query(`
      CREATE FUNCTION "dm_conversations_pair_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'dm_conversations row %: the pair of users cannot change', OLD.id
          USING ERRCODE = '23514', TABLE = 'dm_conversations';
      END
      $$`);
    await queryRunner.query(
      `CREATE TRIGGER "dm_conversations_pair_frozen" BEFORE UPDATE OF "user_low", "user_high" ON "dm_conversations" FOR EACH ROW WHEN (OLD."user_low" IS DISTINCT FROM NEW."user_low" OR OLD."user_high" IS DISTINCT FROM NEW."user_high") EXECUTE FUNCTION "dm_conversations_pair_frozen"()`,
    );

    await queryRunner.query(
      `CREATE INDEX "login_attempts_lock_expiry" ON "login_attempts" ("locked_until") WHERE "locked_until" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "login_attempts_window_expiry" ON "login_attempts" ("window_started_at") WHERE "locked_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "rate_limits_window_expiry" ON "rate_limits" ("window_started_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."rate_limits_window_expiry"`);
    await queryRunner.query(
      `DROP INDEX "public"."login_attempts_window_expiry"`,
    );
    await queryRunner.query(`DROP INDEX "public"."login_attempts_lock_expiry"`);

    await queryRunner.query(
      `DROP TRIGGER "dm_conversations_pair_frozen" ON "dm_conversations"`,
    );
    await queryRunner.query(`DROP FUNCTION "dm_conversations_pair_frozen"()`);
    for (const [table] of [...MEMBER_TABLES].reverse()) {
      await queryRunner.query(`DROP TRIGGER "${table}_member" ON "${table}"`);
    }
    await queryRunner.query(`DROP FUNCTION "dm_assert_member"()`);
  }
}
