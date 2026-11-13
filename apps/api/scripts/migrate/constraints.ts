import { LIMITS } from "../../src/migrations/1795100000000-DbConstraints.js";
import type { SourceValue } from "./convert.js";
import type { OrphanMode, OrphanResolution } from "./plan.js";

// Everything the data script knows about the db-constraints migration: which
// NULLs it backfills, which column it derives, and which source rows would
// break a new constraint. SQLite never enforced any of it, so the rows are
// checked before anything is written (the dry run prints the report).
//
// The state lives in this module because the script is one run per process:
// `resetConstraintState()` starts a run, `applyDefaults` is called on every row
// read, `visitRow` on every row of the analysis pass.

type Row = Record<string, SourceValue>;

// --- NULLs the migration backfills ---------------------------------------

// Same values as the migration (SQLite form: booleans are 0/1). A NULL in the
// source becomes this before validation, loading and checksums, so both sides
// of the verification agree.
export const NULL_DEFAULTS: Record<string, Record<string, SourceValue>> = {
  admins: { role: "super_admin", passcode_failed_count: 0, presence_hidden: 0 },
  users: { chat_enabled: 0, post_privacy_default: "friends" },
};

export type Backfill = {
  table: string;
  column: string;
  value: string | number;
  count: number;
  sampleKeys: string[];
};

// PostgreSQL columns the SQLite schema never had: the owner of the row's
// parent day, set from the parent while loading.
export const DERIVED_COLUMNS: Record<string, string[]> = {
  exercises: ["user_id"],
  meal_plan_meals: ["user_id"],
};

// --- what a row may hold --------------------------------------------------

export type ViolationGroup = {
  table: string;
  column: string;
  // The constraint of the migration it would break.
  rule: string;
  count: number;
  sampleKeys: string[];
};

type Violation = { table: string; key: string; column: string; rule: string };

const DATE_COLUMNS: [table: string, column: string][] = [
  ["workout_days", "date"],
  ["meal_plan_days", "date"],
  ["weight_logs", "date"],
  ["food_entries", "date"],
  ["nutrition_targets", "effective_from"],
];

type Range = {
  table: string;
  column: string;
  rule: string;
  min?: number;
  max?: number;
  // true: the value must be greater than `min`, not equal to it.
  above?: boolean;
};

const macro = { min: 0, max: LIMITS.nutritionGrams.max };

// The numeric CHECKs of the migration, one entry per column. A NULL passes
// (the NOT NULL columns were already checked).
const RANGES: Range[] = [
  {
    table: "exercises",
    column: "sets",
    rule: "exercises_sets_range",
    ...LIMITS.exerciseSets,
  },
  {
    table: "exercise_sets",
    column: "reps",
    rule: "exercise_sets_reps_range",
    ...LIMITS.setReps,
  },
  {
    table: "exercise_sets",
    column: "weight_kg",
    rule: "exercise_sets_weight_range",
    ...LIMITS.setWeightKg,
  },
  {
    table: "meal_plan_items",
    column: "grams",
    rule: "meal_plan_items_grams_range",
    min: 0,
    above: true,
    max: LIMITS.mealGrams.max,
  },
  {
    table: "meal_plan_meals",
    column: "share_percent",
    rule: "meal_plan_meals_share_range",
    ...LIMITS.sharePercent,
  },
  {
    table: "meal_logs",
    column: "grams",
    rule: "meal_logs_grams_range",
    min: 0,
    max: LIMITS.mealGrams.max,
  },
  ...["kcal", "protein", "carbs", "fat"].map((column) => ({
    table: "meal_logs",
    column,
    rule: "meal_logs_numbers_range",
    min: 0,
  })),
  ...["grams", "protein", "carbs", "fat", "kcal"].map((column) => ({
    table: "meal_mark_items",
    column,
    rule: "meal_mark_items_numbers_range",
    min: 0,
  })),
  ...["carbs", "protein", "fat"].map((column) => ({
    table: "food_entries",
    column,
    rule: "food_entries_grams_range",
    ...macro,
  })),
  ...["carbs", "protein", "fat"].map((column) => ({
    table: "nutrition_targets",
    column,
    rule: "nutrition_targets_grams_range",
    ...macro,
  })),
  {
    table: "body_profiles",
    column: "birth_year",
    rule: "body_profiles_birth_year_range",
    ...LIMITS.birthYear,
  },
  {
    table: "body_profiles",
    column: "height_cm",
    rule: "body_profiles_height_range",
    ...LIMITS.heightCm,
  },
  {
    table: "body_profiles",
    column: "weight_kg",
    rule: "body_profiles_weight_range",
    ...LIMITS.weightKg,
  },
  {
    table: "body_profiles",
    column: "kcal_adjustment",
    rule: "body_profiles_kcal_adjustment_range",
    ...LIMITS.kcalAdjustment,
  },
  {
    table: "body_profiles",
    column: "protein_per_kg",
    rule: "body_profiles_protein_per_kg_range",
    ...LIMITS.proteinPerKg,
  },
  {
    table: "weight_logs",
    column: "weight_kg",
    rule: "weight_logs_weight_range",
    ...LIMITS.weightKg,
  },
];

const rangesByTable = new Map<string, Range[]>();

for (const range of RANGES) {
  rangesByTable.set(range.table, [
    ...(rangesByTable.get(range.table) ?? []),
    range,
  ]);
}

const datesByTable = new Map<string, string[]>();

for (const [table, column] of DATE_COLUMNS) {
  datesByTable.set(table, [...(datesByTable.get(table) ?? []), column]);
}

// "2026-02-30" and "2026-2-3" are not days PostgreSQL's `date` column (or the
// API, which sends YYYY-MM-DD) would accept.
export const isCalendarDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const outOfRange = (value: number, range: Range) =>
  (range.min !== undefined &&
    (range.above ? value <= range.min : value < range.min)) ||
  (range.max !== undefined && value > range.max);

// --- run state ------------------------------------------------------------

type State = {
  backfilled: Map<string, Backfill & { keys: Set<string> }>;
  violations: Violation[];
  // Facts for the checks that compare two rows.
  workoutDayOwner: Map<number, number>;
  planDayOwner: Map<number, number>;
  exerciseDay: Map<number, number>;
  mealDay: Map<number, number>;
  markMeal: Map<number, number>;
  // Rows whose owner or meal must match their parent's.
  ownedChildren: {
    table: string;
    key: string;
    parentId: number;
    owner: number;
  }[];
  markItems: { key: string; markId: number; mealId: number }[];
  // (table, day, position) -> ids, to find two rows at one position.
  positions: Map<string, { id: number; key: string }[]>;
  // meal_logs without a custom name: nulling their food would leave neither.
  logsWithoutName: Set<string>;
};

const freshState = (): State => ({
  backfilled: new Map(),
  violations: [],
  workoutDayOwner: new Map(),
  planDayOwner: new Map(),
  exerciseDay: new Map(),
  mealDay: new Map(),
  markMeal: new Map(),
  ownedChildren: [],
  markItems: [],
  positions: new Map(),
  logsWithoutName: new Set(),
});

let state = freshState();

export const resetConstraintState = () => {
  state = freshState();
};

const keyOfRow = (row: Row) => String(row.id);

// Replaces a NULL the migration backfills by its default. Idempotent: the
// script reads each table several times and counts every row once.
export const applyDefaults = (table: string, row: Row): Row => {
  const defaults = NULL_DEFAULTS[table];

  if (!defaults) {
    return row;
  }

  let result = row;

  for (const [column, value] of Object.entries(defaults)) {
    if (row[column] !== null) {
      continue;
    }

    result = { ...result, [column]: value };

    const id = `${table}.${column}`;
    const entry = state.backfilled.get(id) ?? {
      table,
      column,
      value: value as string | number,
      count: 0,
      sampleKeys: [],
      keys: new Set<string>(),
    };
    const key = keyOfRow(row);

    if (!entry.keys.has(key)) {
      entry.keys.add(key);
      entry.count += 1;

      if (entry.sampleKeys.length < 10) {
        entry.sampleKeys.push(key);
      }
    }

    state.backfilled.set(id, entry);
  }

  return result;
};

export const backfills = (): Backfill[] =>
  [...state.backfilled.values()].map((entry) => ({
    table: entry.table,
    column: entry.column,
    value: entry.value,
    count: entry.count,
    sampleKeys: entry.sampleKeys,
  }));

const num = (value: SourceValue) => (typeof value === "number" ? value : null);

// Called once per row in the analysis pass (after defaults were applied).
export const visitRow = (table: string, key: string, row: Row) => {
  const flag = (column: string, rule: string) =>
    state.violations.push({ table, key, column, rule });

  for (const column of datesByTable.get(table) ?? []) {
    const value = row[column];

    if (typeof value !== "string" || !isCalendarDay(value)) {
      flag(column, "date");
    }
  }

  for (const range of rangesByTable.get(table) ?? []) {
    const value = num(row[range.column]);

    if (value !== null && outOfRange(value, range)) {
      flag(range.column, range.rule);
    }
  }

  const id = num(row.id);

  switch (table) {
    case "workout_days":
      if (id !== null && num(row.user_id) !== null) {
        state.workoutDayOwner.set(id, row.user_id as number);
      }
      break;
    case "meal_plan_days":
      if (id !== null && num(row.user_id) !== null) {
        state.planDayOwner.set(id, row.user_id as number);
      }
      break;
    case "exercises":
    case "meal_plan_meals": {
      const day = num(row.day_id);
      const position = num(row.position);

      if (id !== null && day !== null) {
        (table === "exercises" ? state.exerciseDay : state.mealDay).set(
          id,
          day,
        );

        if (position !== null) {
          const slot = `${table}|${day}|${position}`;

          state.positions.set(slot, [
            ...(state.positions.get(slot) ?? []),
            { id, key },
          ]);
        }
      }
      break;
    }
    case "meal_marks":
      if (id !== null && num(row.meal_id) !== null) {
        state.markMeal.set(id, row.meal_id as number);
      }
      break;
    default:
  }

  if (
    [
      "exercise_sets",
      "exercise_completions",
      "meal_logs",
      "meal_marks",
    ].includes(table)
  ) {
    const parent = num(
      table.startsWith("exercise") ? row.exercise_id : row.meal_id,
    );
    const owner = num(row.user_id);

    if (parent !== null && owner !== null) {
      state.ownedChildren.push({ table, key, parentId: parent, owner });
    }
  }

  if (table === "meal_mark_items") {
    const markId = num(row.mark_id);
    const mealId = num(row.meal_id);

    if (markId !== null && mealId !== null) {
      state.markItems.push({ key, markId, mealId });
    }
  }

  if (table === "meal_logs") {
    if (row.food_id === null && row.custom_name === null) {
      flag("food_id", "meal_logs_food_or_name");
    }

    if (row.custom_name === null) {
      state.logsWithoutName.add(key);
    }
  }
};

// The values of the derived columns of `table`, in DERIVED_COLUMNS order.
export const derivedValues = (table: string, row: Row): unknown[] => {
  if (table === "exercises") {
    return [state.workoutDayOwner.get(row.day_id as number) ?? null];
  }

  if (table === "meal_plan_meals") {
    return [state.planDayOwner.get(row.day_id as number) ?? null];
  }

  return [];
};

// The owner of the day a child row points at, through its exercise or meal.
const ownerOf = (table: string, parentId: number) => {
  if (table.startsWith("exercise")) {
    const day = state.exerciseDay.get(parentId);

    return day === undefined ? undefined : state.workoutDayOwner.get(day);
  }

  const day = state.mealDay.get(parentId);

  return day === undefined ? undefined : state.planDayOwner.get(day);
};

// Rows that break a rule only a comparison can see: another owner than the
// parent's, a mark item for another meal than its mark's, two rows at one
// position of a day (the later row, by id, is the one reported).
const compared = (): Violation[] => {
  const found: Violation[] = [];

  for (const child of state.ownedChildren) {
    const owner = ownerOf(child.table, child.parentId);

    // A missing parent is an orphan, reported by the foreign key scan.
    if (owner !== undefined && owner !== child.owner) {
      found.push({
        table: child.table,
        key: child.key,
        column: "user_id",
        rule: `${child.table}_${child.table.startsWith("exercise") ? "exercise" : "meal"}_owner_fkey`,
      });
    }
  }

  for (const item of state.markItems) {
    const meal = state.markMeal.get(item.markId);

    if (meal !== undefined && meal !== item.mealId) {
      found.push({
        table: "meal_mark_items",
        key: item.key,
        column: "meal_id",
        rule: "meal_mark_items_mark_meal_fkey",
      });
    }
  }

  for (const [slot, rows] of state.positions) {
    if (rows.length < 2) {
      continue;
    }

    const [table] = slot.split("|");
    const [, ...later] = [...rows].sort((a, b) => a.id - b.id);

    for (const row of later) {
      found.push({
        table,
        key: row.key,
        column: "position",
        rule:
          table === "exercises"
            ? "exercises_day_position_key"
            : "meal_plan_meals_day_position_key",
      });
    }
  }

  return found;
};

const SAMPLE_SIZE = 10;

const group = (violations: Violation[]): ViolationGroup[] => {
  const groups = new Map<string, ViolationGroup>();

  for (const violation of violations) {
    const id = `${violation.table}|${violation.column}|${violation.rule}`;
    const entry = groups.get(id) ?? {
      table: violation.table,
      column: violation.column,
      rule: violation.rule,
      count: 0,
      sampleKeys: [],
    };

    entry.count += 1;

    if (entry.sampleKeys.length < SAMPLE_SIZE) {
      entry.sampleKeys.push(violation.key);
    }

    groups.set(id, entry);
  }

  return [...groups.values()];
};

export type ViolationResolution = {
  groups: ViolationGroup[];
  // table -> primary keys of the rows that will not be copied (skip mode).
  skipped: Record<string, string[]>;
  // What stops the run, or null.
  blocker: string | null;
};

// Applies the --orphans mode to the rows that would break a constraint:
// report lists them and stops, skip drops them (their children follow through
// the foreign key scan, which runs next on the rows left), null cannot repair
// a value and stops.
export const resolveViolations = (mode: OrphanMode): ViolationResolution => {
  const all = [...state.violations, ...compared()];
  const groups = group(all);

  if (all.length === 0) {
    return { groups, skipped: {}, blocker: null };
  }

  if (mode === "skip") {
    const skipped: Record<string, Set<string>> = {};

    for (const violation of all) {
      (skipped[violation.table] ??= new Set()).add(violation.key);
    }

    return {
      groups,
      skipped: Object.fromEntries(
        Object.entries(skipped).map(([table, keys]) => [table, [...keys]]),
      ),
      blocker: null,
    };
  }

  return {
    groups,
    skipped: {},
    blocker:
      mode === "null"
        ? "--orphans=null cannot repair a value that breaks a constraint (listed above); use --orphans=skip to leave those rows out, or fix the SQLite copy"
        : "The source has rows that break the new constraints (listed above). Nothing was written. Re-run with --orphans=skip to leave those rows (and rows that depend on them) out, or fix the SQLite copy",
  };
};

// --orphans=null clears a food_id that points at no food. A meal log without a
// custom name would then have neither: that row breaks meal_logs_food_or_name.
export const nullingConflicts = (resolution: OrphanResolution) => {
  const keys = resolution.nulled.meal_logs?.food_id ?? [];
  const conflicts = keys.filter((key) => state.logsWithoutName.has(key));

  return conflicts.length === 0
    ? []
    : group(
        conflicts.map((key) => ({
          table: "meal_logs",
          key,
          column: "food_id",
          rule: "meal_logs_food_or_name",
        })),
      );
};

// Rows of `rows` (table -> RowRef-like with key) without the skipped keys.
export const withoutSkipped = <T extends { key: string }>(
  rows: Record<string, T[]>,
  skipped: Record<string, string[]>,
) =>
  Object.fromEntries(
    Object.entries(rows).map(([table, list]) => {
      const drop = new Set(skipped[table] ?? []);

      return [
        table,
        drop.size === 0 ? list : list.filter((row) => !drop.has(row.key)),
      ];
    }),
  );
