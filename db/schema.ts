import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const admins = sqliteTable("admins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  // Lower-cased username used for login lookups.
  usernameKey: text("username_key").notNull().unique(),
  // scrypt hash, see services/password.ts.
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // Lower-cased, whitespace-collapsed name used for login lookups.
  nameKey: text("name_key").notNull().unique(),
  createdAt: createdAt(),
});

export const workoutDays = sqliteTable(
  "workout_days",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Calendar date in Asia/Ho_Chi_Minh, formatted YYYY-MM-DD.
    date: text("date").notNull(),
    title: text("title").notNull().default(""),
    note: text("note").notNull().default(""),
    // "tdee": computed from the body profile, recomputed when it changes;
    // "manual": typed by the admin, never overwritten automatically.
    source: text("source", { enum: ["manual", "tdee"] })
      .notNull()
      .default("manual"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("workout_days_user_date").on(table.userId, table.date),
  ],
);

export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dayId: integer("day_id")
    .notNull()
    .references(() => workoutDays.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  sets: integer("sets"),
  reps: text("reps").notNull().default(""),
  youtubeId: text("youtube_id").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

export const exerciseCompletions = sqliteTable("exercise_completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // One completion per exercise: exercises already belong to one user's day.
  exerciseId: integer("exercise_id")
    .notNull()
    .unique()
    .references(() => exercises.id, { onDelete: "cascade" }),
  // Denormalized from the exercise's day so dashboards can group by user.
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
});

// Daily macro targets set by the admin. A target applies from `effectiveFrom`
// until a later one replaces it, so past days keep the target they had.
export const nutritionTargets = sqliteTable(
  "nutrition_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: text("effective_from").notNull(),
    // Grams per day.
    carbs: integer("carbs").notNull(),
    protein: integer("protein").notNull(),
    fat: integer("fat").notNull(),
    note: text("note").notNull().default(""),
    // "tdee": computed from the body profile, recomputed when it changes;
    // "manual": typed by the admin, never overwritten automatically.
    source: text("source", { enum: ["manual", "tdee"] })
      .notNull()
      .default("manual"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("nutrition_targets_user_from").on(
      table.userId,
      table.effectiveFrom,
    ),
  ],
);

// What a user ate, one row per meal they logged.
export const foodEntries = sqliteTable("food_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  meal: text("meal", {
    enum: ["breakfast", "lunch", "dinner", "snack"],
  }).notNull(),
  description: text("description").notNull().default(""),
  // Grams; null when the user didn't estimate that macro.
  carbs: integer("carbs"),
  protein: integer("protein"),
  fat: integer("fat"),
  createdAt: createdAt(),
});

// Body measurements the admin enters to compute the user's TDEE.
export const bodyProfiles = sqliteTable("body_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  sex: text("sex", { enum: ["male", "female"] }).notNull(),
  // Stored instead of age so the age stays right in later years.
  birthYear: integer("birth_year").notNull(),
  heightCm: real("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  activityLevel: text("activity_level", {
    enum: ["sedentary", "light", "moderate", "active", "very_active"],
  }).notNull(),
  goal: text("goal", { enum: ["cut", "maintain", "bulk"] }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// One weigh-in per user per day; the latest also updates the body profile.
export const weightLogs = sqliteTable(
  "weight_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    weightKg: real("weight_kg").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("weight_logs_user_date").on(table.userId, table.date),
  ],
);
