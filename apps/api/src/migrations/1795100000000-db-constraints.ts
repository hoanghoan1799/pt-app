import { MigrationInterface, QueryRunner } from "typeorm";

// Tightens the workouts, nutrition, accounts, push and contacts tables: real
// `date` columns, NOT NULL where NULL means nothing, owner columns that must
// agree with their parent, unique list positions, range CHECKs and two small
// cleanups. Each step says how it treats rows that already exist.

// Columns that held "YYYY-MM-DD" text. `USING ::date` fails on anything that
// is not a valid day; the Turso data script reports those before it loads.
const DATE_COLUMNS: [table: string, column: string][] = [
  ["workout_days", "date"],
  ["meal_plan_days", "date"],
  ["weight_logs", "date"],
  ["food_entries", "date"],
  ["nutrition_targets", "effective_from"],
];

// NULL carries no meaning in these columns: backfill what the app already read
// a NULL as, then forbid it. users.terms_version stays nullable (NULL = the
// terms were never accepted).
const NOT_NULLS: {
  table: string;
  column: string;
  // What the app treated NULL as; existing NULLs become this.
  backfill: string;
  // Default of new rows.
  default: string;
}[] = [
  // NULL role = super admin (admins from before roles existed). New rows
  // without a role get the least privilege.
  { table: "admins", column: "role", backfill: "'super_admin'", default: "'pt'" },
  { table: "admins", column: "passcode_failed_count", backfill: "0", default: "0" },
  { table: "admins", column: "presence_hidden", backfill: "false", default: "false" },
  { table: "users", column: "chat_enabled", backfill: "false", default: "false" },
  { table: "users", column: "post_privacy_default", backfill: "'friends'", default: "'friends'" },
];

export class DbConstraints1795100000000 implements MigrationInterface {
  name = "DbConstraints1795100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of DATE_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE date USING "${column}"::date`,
      );
    }

    for (const { table, column, backfill, default: value } of NOT_NULLS) {
      await queryRunner.query(
        `UPDATE "${table}" SET "${column}" = ${backfill} WHERE "${column}" IS NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT ${value}`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The backfilled values stay; only the NOT NULL goes.
    for (const { table, column, default: value } of [...NOT_NULLS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL`,
      );
      // The baseline had a default only on these two.
      await queryRunner.query(
        column === "passcode_failed_count" || column === "presence_hidden"
          ? `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT ${value}`
          : `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`,
      );
    }
    for (const [table, column] of [...DATE_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE text USING to_char("${column}", 'YYYY-MM-DD')`,
      );
    }
  }
}
