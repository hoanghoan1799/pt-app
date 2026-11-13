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
  {
    table: "admins",
    column: "role",
    backfill: "'super_admin'",
    default: "'pt'",
  },
  {
    table: "admins",
    column: "passcode_failed_count",
    backfill: "0",
    default: "0",
  },
  {
    table: "admins",
    column: "presence_hidden",
    backfill: "false",
    default: "false",
  },
  {
    table: "users",
    column: "chat_enabled",
    backfill: "false",
    default: "false",
  },
  {
    table: "users",
    column: "post_privacy_default",
    backfill: "'friends'",
    default: "'friends'",
  },
];

// A child row repeats the owner of its parent (sets, completions, meal logs and
// marks carry user_id; exercises and meals now do too, copied from their day).
// A composite foreign key makes the database refuse a row whose owner differs
// from its parent's. The parent gets UNIQUE (id, <owner>) as the target; the
// plain foreign key on the parent id is replaced by the composite one.
const OWNER_LINKS: {
  table: string;
  oldFk: string;
  fk: string;
  columns: [string, string];
  parent: string;
  parentColumns: [string, string];
}[] = [
  {
    table: "exercises",
    oldFk: "FK_0aa23eeae74ff072b5916aff9ba",
    fk: "exercises_day_owner_fkey",
    columns: ["day_id", "user_id"],
    parent: "workout_days",
    parentColumns: ["id", "user_id"],
  },
  {
    table: "exercise_sets",
    oldFk: "FK_4a55381605cbd66540d782388e7",
    fk: "exercise_sets_exercise_owner_fkey",
    columns: ["exercise_id", "user_id"],
    parent: "exercises",
    parentColumns: ["id", "user_id"],
  },
  {
    table: "exercise_completions",
    oldFk: "FK_e7d3448a111825db29bbea4cbcf",
    fk: "exercise_completions_exercise_owner_fkey",
    columns: ["exercise_id", "user_id"],
    parent: "exercises",
    parentColumns: ["id", "user_id"],
  },
  {
    table: "meal_plan_meals",
    oldFk: "FK_7419493715532800750474faf70",
    fk: "meal_plan_meals_day_owner_fkey",
    columns: ["day_id", "user_id"],
    parent: "meal_plan_days",
    parentColumns: ["id", "user_id"],
  },
  {
    table: "meal_logs",
    oldFk: "FK_6f778cbda281c94f88cc66d4af2",
    fk: "meal_logs_meal_owner_fkey",
    columns: ["meal_id", "user_id"],
    parent: "meal_plan_meals",
    parentColumns: ["id", "user_id"],
  },
  {
    table: "meal_marks",
    oldFk: "FK_c75921581862e4efdd92cb7968d",
    fk: "meal_marks_meal_owner_fkey",
    columns: ["meal_id", "user_id"],
    parent: "meal_plan_meals",
    parentColumns: ["id", "user_id"],
  },
  // The item names the same meal as its mark.
  {
    table: "meal_mark_items",
    oldFk: "FK_26918ace9cee4310f4eab5892cc",
    fk: "meal_mark_items_mark_meal_fkey",
    columns: ["mark_id", "meal_id"],
    parent: "meal_marks",
    parentColumns: ["id", "meal_id"],
  },
];

// Targets of the composite foreign keys, in creation order.
const OWNER_KEYS: [table: string, name: string, columns: string][] = [
  ["workout_days", "workout_days_id_user_key", `"id", "user_id"`],
  ["exercises", "exercises_id_user_key", `"id", "user_id"`],
  ["meal_plan_days", "meal_plan_days_id_user_key", `"id", "user_id"`],
  ["meal_plan_meals", "meal_plan_meals_id_user_key", `"id", "user_id"`],
  ["meal_marks", "meal_marks_id_meal_key", `"id", "meal_id"`],
];

// Lists whose order is a position. Duplicates are renumbered 0..n-1 within
// their parent (keeping the order the app showed: position, then id) before
// the constraint goes on. Deferred, so a reorder inside a transaction may pass
// through a duplicate.
const POSITIONS: {
  table: string;
  parent: string;
  name: string;
  oldIndex: string;
}[] = [
  {
    table: "exercises",
    parent: "day_id",
    name: "exercises_day_position_key",
    oldIndex: "exercises_day_id_idx",
  },
  {
    table: "meal_plan_meals",
    parent: "day_id",
    name: "meal_plan_meals_day_position_key",
    oldIndex: "meal_plan_meals_day",
  },
];

// The numbers of the range CHECKs: copies of the limits the API validates in
// packages/contracts (a migration never imports them, so it stays what it was
// when it ran). src/migrations/db-constraints.test.ts fails when a copy and
// its contract constant drift apart.
export const LIMITS = {
  // SET_LIMITS
  setReps: { min: 1, max: 100 },
  setWeightKg: { min: 0.5, max: 500 },
  // EXERCISE_LIMITS.MAX_SETS (the min is the schema's "at least 1")
  exerciseSets: { min: 1, max: 50 },
  // MEAL_PLAN_LIMITS.MAX_GRAMS
  mealGrams: { max: 3000 },
  // NUTRITION_LIMITS.MAX_GRAMS
  nutritionGrams: { max: 2000 },
  // BODY_LIMITS
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 30, max: 250 },
  // No contract constant: the form takes an age (BODY_LIMITS.AGE) and stores
  // the year. These bounds only have to hold every year that age can give.
  birthYear: { min: 1900, max: 2100 },
  // KCAL_ADJUSTMENT_LIMITS and PROTEIN_PER_KG_LIMITS
  kcalAdjustment: { min: -1500, max: 1500 },
  proteinPerKg: { min: 1, max: 3 },
  // A share of the day's target, in percent.
  sharePercent: { min: 0, max: 100 },
} as const;

const between = (column: string, { min, max }: { min: number; max: number }) =>
  `"${column}" BETWEEN ${min} AND ${max}`;

// A column that may be NULL, and is in range otherwise.
const orNull = (column: string, range: { min: number; max: number }) =>
  `"${column}" IS NULL OR ${between(column, range)}`;

const nonNegative = (columns: string[], nullable: boolean) =>
  columns
    .map((column) =>
      nullable
        ? `("${column}" IS NULL OR "${column}" >= 0)`
        : `"${column}" >= 0`,
    )
    .join(" AND ");

// [table, constraint name, expression]. The names are the ones the entities
// declare with @Check, so the schema builder sees no difference.
const CHECKS: [table: string, name: string, expression: string][] = [
  ["exercises", "exercises_sets_range", orNull("sets", LIMITS.exerciseSets)],
  [
    "exercise_sets",
    "exercise_sets_reps_range",
    between("reps", LIMITS.setReps),
  ],
  [
    "exercise_sets",
    "exercise_sets_weight_range",
    orNull("weight_kg", LIMITS.setWeightKg),
  ],
  // A planned food needs an amount (0 g showed the trainee a blank).
  [
    "meal_plan_items",
    "meal_plan_items_grams_range",
    `"grams" > 0 AND "grams" <= ${LIMITS.mealGrams.max}`,
  ],
  [
    "meal_plan_meals",
    "meal_plan_meals_share_range",
    orNull("share_percent", LIMITS.sharePercent),
  ],
  // A free food may be logged with 0 g.
  [
    "meal_logs",
    "meal_logs_grams_range",
    `"grams" >= 0 AND "grams" <= ${LIMITS.mealGrams.max}`,
  ],
  // No upper bound: a library food logged at 3000 g may exceed what a typed
  // number may.
  [
    "meal_logs",
    "meal_logs_numbers_range",
    nonNegative(["kcal", "protein", "carbs", "fat"], true),
  ],
  [
    "meal_logs",
    "meal_logs_food_or_name",
    `"food_id" IS NOT NULL OR "custom_name" IS NOT NULL`,
  ],
  [
    "meal_mark_items",
    "meal_mark_items_numbers_range",
    nonNegative(["grams", "protein", "carbs", "fat", "kcal"], false),
  ],
  [
    "food_entries",
    "food_entries_grams_range",
    ["carbs", "protein", "fat"]
      .map((c) => `(${orNull(c, { min: 0, max: LIMITS.nutritionGrams.max })})`)
      .join(" AND "),
  ],
  [
    "nutrition_targets",
    "nutrition_targets_grams_range",
    ["carbs", "protein", "fat"]
      .map((c) => between(c, { min: 0, max: LIMITS.nutritionGrams.max }))
      .join(" AND "),
  ],
  [
    "body_profiles",
    "body_profiles_birth_year_range",
    between("birth_year", LIMITS.birthYear),
  ],
  [
    "body_profiles",
    "body_profiles_height_range",
    between("height_cm", LIMITS.heightCm),
  ],
  [
    "body_profiles",
    "body_profiles_weight_range",
    between("weight_kg", LIMITS.weightKg),
  ],
  [
    "body_profiles",
    "body_profiles_kcal_adjustment_range",
    orNull("kcal_adjustment", LIMITS.kcalAdjustment),
  ],
  [
    "body_profiles",
    "body_profiles_protein_per_kg_range",
    orNull("protein_per_kg", LIMITS.proteinPerKg),
  ],
  [
    "weight_logs",
    "weight_logs_weight_range",
    between("weight_kg", LIMITS.weightKg),
  ],
  // A web push subscription is useless without its keys (expo/fcm rows keep
  // the device token in `endpoint` and have none).
  [
    "push_subscriptions",
    "push_subscriptions_web_keys",
    `"kind" <> 'web' OR ("p256dh" IS NOT NULL AND "auth" IS NOT NULL)`,
  ],
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

    // Exercises and meals take the owner of their day.
    for (const [table, parent] of [
      ["exercises", "workout_days"],
      ["meal_plan_meals", "meal_plan_days"],
    ]) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "user_id" integer`);
      await queryRunner.query(
        `UPDATE "${table}" t SET "user_id" = p."user_id" FROM "${parent}" p WHERE p."id" = t."day_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "user_id" SET NOT NULL`,
      );
    }

    for (const { table, parent, name, oldIndex } of POSITIONS) {
      await queryRunner.query(
        `UPDATE "${table}" t SET "position" = r.n - 1
           FROM (SELECT "id", row_number() OVER (PARTITION BY "${parent}" ORDER BY "position", "id") AS n
                   FROM "${table}") r
          WHERE t."id" = r."id"
            AND t."${parent}" IN (SELECT "${parent}" FROM "${table}" GROUP BY "${parent}", "position" HAVING count(*) > 1)`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" UNIQUE ("${parent}", "position") DEFERRABLE INITIALLY DEFERRED`,
      );
      // The unique constraint's index starts with the parent column.
      await queryRunner.query(`DROP INDEX "public"."${oldIndex}"`);
    }

    for (const [table, name, columns] of OWNER_KEYS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" UNIQUE (${columns})`,
      );
    }

    for (const [table, name, expression] of CHECKS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`,
      );
    }

    // contact_aliases' primary key (owner_key, target_key) already serves every
    // lookup by owner_key.
    await queryRunner.query(`DROP INDEX "public"."contact_aliases_owner_key"`);

    for (const link of OWNER_LINKS) {
      const [child1, child2] = link.columns;
      const [parent1, parent2] = link.parentColumns;

      await queryRunner.query(
        `ALTER TABLE "${link.table}" DROP CONSTRAINT "${link.oldFk}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${link.table}" ADD CONSTRAINT "${link.fk}"
           FOREIGN KEY ("${child1}", "${child2}") REFERENCES "${link.parent}" ("${parent1}", "${parent2}") ON DELETE CASCADE`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "contact_aliases_owner_key" ON "contact_aliases" ("owner_key")`,
    );

    for (const [table, name] of [...CHECKS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`,
      );
    }

    for (const link of [...OWNER_LINKS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${link.table}" DROP CONSTRAINT "${link.fk}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${link.table}" ADD CONSTRAINT "${link.oldFk}"
           FOREIGN KEY ("${link.columns[0]}") REFERENCES "${link.parent}" ("id") ON DELETE CASCADE`,
      );
    }

    for (const [table, name] of [...OWNER_KEYS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`,
      );
    }

    for (const { table, parent, name, oldIndex } of [...POSITIONS].reverse()) {
      await queryRunner.query(
        `CREATE INDEX "${oldIndex}" ON "${table}" ("${parent}")`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "meal_plan_meals" DROP COLUMN "user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "exercises" DROP COLUMN "user_id"`);

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
