import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { FOOD_GROUP_VALUES } from "@/features/foods/constants/food-groups";

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
  // Presence heartbeat (KAN-128): last time the PT had the app open and
  // visible. Throttled to one write a minute; null = never seen.
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // Lower-cased, whitespace-collapsed name used for login lookups.
  nameKey: text("name_key").notNull().unique(),
  // The trainee's meal plan request (KAN-69, Q1): meals per day (2-6) and
  // foods they like or avoid. Null = no request.
  preferredMealCount: integer("preferred_meal_count"),
  foodNote: text("food_note"),
  // Email + password login (KAN-82). All nullable so trainees created before
  // it stay valid until the admin sets their login.
  email: text("email"),
  // Trimmed, lower-cased email used for login lookups; unique when set.
  emailKey: text("email_key").unique(),
  // scrypt hash, see services/password.ts.
  passwordHash: text("password_hash"),
  // Sessions issued before this moment are rejected (whole seconds).
  passwordChangedAt: integer("password_changed_at", { mode: "timestamp" }),
  // Realtime chat permission (KAN-97, S1). Null or false = locked; only the
  // admin switch sets it. Audit: who changed it and when (admins.id, not
  // enforced, D10).
  chatEnabled: integer("chat_enabled", { mode: "boolean" }),
  chatEnabledChangedAt: integer("chat_enabled_changed_at", {
    mode: "timestamp",
  }),
  chatEnabledByAdminId: integer("chat_enabled_by_admin_id"),
  // Presence heartbeat (KAN-128), see admins.lastSeenAt.
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

// Failed-login counters shared by all serverless instances (KAN-82, D9).
// Key: "user:<email_key>" or "admin:<username_key>".
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  windowStartedAt: integer("window_started_at", {
    mode: "timestamp",
  }).notNull(),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
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

// Weight and reps the user actually lifted, one row per set (KAN-25).
// Delete paths remove these rows by hand before the parent rows: PRAGMA
// foreign_keys is never enabled, so onDelete cascade does not fire (D10).
export const exerciseSets = sqliteTable(
  "exercise_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    // Denormalized from the exercise's day so history queries skip the joins.
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 0-based order of the set within the exercise.
    position: integer("position").notNull(),
    // Kilograms; null means bodyweight.
    weightKg: real("weight_kg"),
    reps: integer("reps").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exercise_sets_exercise_position").on(
      table.exerciseId,
      table.position,
    ),
    index("exercise_sets_user").on(table.userId),
  ],
);

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
  // Legacy: no longer used for maths once kcalAdjustment is set.
  goal: text("goal", { enum: ["cut", "maintain", "bulk"] }).notNull(),
  // PT-set daily kcal on top of the TDEE (negative = deficit). Null keeps the
  // legacy goal factor so existing members' targets don't change on deploy.
  kcalAdjustment: integer("kcal_adjustment"),
  // PT-set protein g per kg of body weight. Null keeps the legacy goal value.
  proteinPerKg: real("protein_per_kg"),
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

// Food library (KAN-65): shared by every user, edited by admins. All numbers
// are per 100 g. "Xóa" archives a row (archivedAt) instead of deleting it so
// later meal plans keep their numbers.
export const foods = sqliteTable(
  "foods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Accent-free lower-cased name (utils/name.ts), used for search and for
    // the uniqueness check among active foods.
    nameKey: text("name_key").notNull(),
    group: text("group", {
      enum: FOOD_GROUP_VALUES,
    }).notNull(),
    // Null for prepared dishes and foods without a raw/cooked distinction.
    state: text("state", { enum: ["raw", "cooked"] }),
    kcal: real("kcal").notNull(),
    protein: real("protein").notNull(),
    carbs: real("carbs").notNull(),
    fat: real("fat").notNull(),
    fiber: real("fiber"),
    // Optional household portion, e.g. "1 tô" = 500 g; both or neither.
    servingLabel: text("serving_label"),
    servingGrams: real("serving_grams"),
    // Where the numbers come from, e.g. "USDA FDC 171477".
    source: text("source").notNull().default(""),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    // A name is unique among active foods; archived rows may share it.
    uniqueIndex("foods_active_name_key")
      .on(table.nameKey)
      .where(sql`${table.archivedAt} IS NULL`),
  ],
);

// Meal plan builder (KAN-69). A day with a plan has meals, a meal has foods
// with grams. Delete paths remove the children by hand (foreign keys are not
// enforced, D10).
export const mealPlanDays = sqliteTable(
  "meal_plan_days",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Calendar date in Asia/Ho_Chi_Minh, formatted YYYY-MM-DD.
    date: text("date").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("meal_plan_days_user_date").on(table.userId, table.date),
  ],
);

export const mealPlanMeals = sqliteTable(
  "meal_plan_meals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dayId: integer("day_id")
      .notNull()
      .references(() => mealPlanDays.id, { onDelete: "cascade" }),
    // 0-based order of the meal within the day.
    position: integer("position").notNull(),
    name: text("name").notNull(),
    // Share of the day target in percent; null = equal split (Q4). Either
    // every meal of a day has one (total 100) or none does.
    sharePercent: real("share_percent"),
    createdAt: createdAt(),
  },
  (table) => [index("meal_plan_meals_day").on(table.dayId)],
);

export const mealPlanItems = sqliteTable(
  "meal_plan_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mealId: integer("meal_id")
      .notNull()
      .references(() => mealPlanMeals.id, { onDelete: "cascade" }),
    // May point at an archived food: plans keep showing it.
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id),
    grams: real("grams").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("meal_plan_items_meal").on(table.mealId)],
);

// Trainee meal log (KAN-71). What the trainee ate in a planned meal: a library
// food with grams, or a free food typed by name (macros optional). Logs and
// marks belong to the plan meal: the delete paths in meal-plan-store remove
// them together with the meal (a deleted or overwritten plan day takes its
// logs with it; foreign keys are not enforced, D10).
export const mealLogs = sqliteTable(
  "meal_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mealId: integer("meal_id")
      .notNull()
      .references(() => mealPlanMeals.id, { onDelete: "cascade" }),
    // Set for a library food (may be archived later); null for a free food.
    foodId: integer("food_id").references(() => foods.id),
    // The name of a free food; null for a library food.
    customName: text("custom_name"),
    // 0 = unknown amount (free foods only).
    grams: real("grams").notNull(),
    // Free foods: what the trainee typed. Library foods: the numbers computed
    // when the log was added or edited (KAN-93), so editing the food later
    // does not change them; all four null = logged before KAN-93, read live.
    kcal: real("kcal"),
    protein: real("protein"),
    carbs: real("carbs"),
    fat: real("fat"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("meal_logs_meal").on(table.mealId),
    index("meal_logs_user").on(table.userId),
  ],
);

// One mark per meal: "Đạt" and/or a note about what was short or over (S4).
export const mealMarks = sqliteTable("meal_marks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealId: integer("meal_id")
    .notNull()
    .unique()
    .references(() => mealPlanMeals.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  achieved: integer("achieved", { mode: "boolean" }).notNull().default(false),
  note: text("note").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Snapshot of a meal's planned items, taken when the trainee marks it "Đạt"
// (KAN-93): the PT editing the plan or a food's macros later does not change
// what counted as eaten. Deleted with the mark (un-mark) or with the meal.
export const mealMarkItems = sqliteTable(
  "meal_mark_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    markId: integer("mark_id")
      .notNull()
      .references(() => mealMarks.id, { onDelete: "cascade" }),
    mealId: integer("meal_id")
      .notNull()
      .references(() => mealPlanMeals.id, { onDelete: "cascade" }),
    // Always the planned item's food; nullable only for safety.
    foodId: integer("food_id").references(() => foods.id),
    grams: real("grams").notNull(),
    protein: real("protein").notNull(),
    carbs: real("carbs").notNull(),
    fat: real("fat").notNull(),
    kcal: real("kcal").notNull(),
  },
  (table) => [index("meal_mark_items_meal").on(table.mealId)],
);

// Realtime chat (KAN-97). One conversation per trainee, shared by all admins.
// Foreign keys are not enforced (D10), so member delete removes these by hand.
export const chatConversations = sqliteTable(
  "chat_conversations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    // Denormalised for the inbox sort and preview.
    lastMessageId: integer("last_message_id"),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    // KAN-138: bumped (strictly increasing) by every edit, unsend and
    // reaction; the change cursor of the polling client.
    lastChangeAt: integer("last_change_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("chat_conversations_last_message_at").on(table.lastMessageAt),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    // Monotonic: doubles as the poll cursor.
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => chatConversations.id),
    senderRole: text("sender_role", { enum: ["user", "admin"] }).notNull(),
    // admins.id; null when the sender is the trainee. Deliberately no
    // reference: deleting an admin keeps their messages.
    senderAdminId: integer("sender_admin_id"),
    body: text("body").notNull().default(""),
    // Phase 3 (photos).
    attachmentUrl: text("attachment_url"),
    attachmentMeta: text("attachment_meta"),
    // Client-generated uuid so a retried send is a no-op.
    clientId: text("client_id").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    hiddenByAdminId: integer("hidden_by_admin_id"),
    // KAN-138: quoted message (same conversation, checked in the action).
    replyToMessageId: integer("reply_to_message_id"),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    // Null until the first edit, unsend or reaction.
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("chat_messages_conversation_client").on(
      table.conversationId,
      table.clientId,
    ),
    index("chat_messages_conversation_id").on(table.conversationId, table.id),
  ],
);

// One reaction per reactor per message (KAN-138). reactorKey is "user" or
// "admin:<id>", the same format as chat_reads.reader_key.
export const chatReactions = sqliteTable(
  "chat_reactions",
  {
    messageId: integer("message_id").notNull(),
    reactorKey: text("reactor_key").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.reactorKey] })],
);

// Every previous body of an edited message (KAN-138, spec C4).
export const chatMessageEdits = sqliteTable(
  "chat_message_edits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: integer("message_id").notNull(),
    previousBody: text("previous_body").notNull(),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("chat_message_edits_message_id").on(table.messageId)],
);

// Read cursor per reader. readerKey is "user" or "admin:<id>".
export const chatReads = sqliteTable(
  "chat_reads",
  {
    conversationId: integer("conversation_id").notNull(),
    readerKey: text("reader_key").notNull(),
    lastReadMessageId: integer("last_read_message_id").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.readerKey] })],
);

// Web Push subscriptions (KAN-103). ownerKey is "user:<id>" or "admin:<id>"; no
// foreign key, member delete removes them by hand. endpoint is unique so a
// browser that re-subscribes (or a shared device) just changes owner.
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKey: text("owner_key").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: createdAt(),
    lastSuccessAt: integer("last_success_at", { mode: "timestamp" }),
  },
  (table) => [index("push_subscriptions_owner_key").on(table.ownerKey)],
);

// Fixed-window counters shared by all serverless instances. login_attempts
// keeps its own lock semantics.
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStartedAt: integer("window_started_at", {
    mode: "timestamp_ms",
  }).notNull(),
});
