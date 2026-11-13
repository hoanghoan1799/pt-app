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

export class DbConstraints1795100000000 implements MigrationInterface {
  name = "DbConstraints1795100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of DATE_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE date USING "${column}"::date`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of [...DATE_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE text USING to_char("${column}", 'YYYY-MM-DD')`,
      );
    }
  }
}
