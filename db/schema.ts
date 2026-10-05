import { sql } from "drizzle-orm";
import {
  integer,
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
