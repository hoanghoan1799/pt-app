import { sql } from "drizzle-orm";
import {
  blob,
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
  // Chat bubble colour (KAN-141): a key of chat-palette.ts; null = default.
  chatColor: text("chat_color"),
  // Profile photo (KAN-157): a 256x256 WebP/JPEG/PNG data URL resized in the
  // browser, validated on write. Null = initials. `avatarUpdatedAt` is set
  // whenever `avatar` is, and versions the /api/avatar URL.
  avatar: text("avatar"),
  avatarUpdatedAt: integer("avatar_updated_at", { mode: "timestamp" }),
  // Admin passcode (KAN-160): scrypt hash of a 4-digit code, see
  // services/password.ts. Null = no passcode, no lock.
  passcodeHash: text("passcode_hash"),
  // Wrong passcodes in a row; the 5th signs the admin out and resets it.
  // Nullable on purpose (null = 0): drizzle-kit push treats a NOT NULL column
  // added to a non-empty table as data loss and the Vercel build skipped it.
  passcodeFailedCount: integer("passcode_failed_count").default(0),
  // "Trạng thái hoạt động" switch: true hides this admin's online status
  // from trainees. Nullable for the same reason (null = shown).
  presenceHidden: integer("presence_hidden", { mode: "boolean" }).default(
    false,
  ),
  // Social roles (P1): null = super_admin, so every admin that existed before
  // roles keeps full rights. Nullable on purpose, see passcodeFailedCount.
  role: text("role", { enum: ["super_admin", "pt"] }),
  // Blue tick (P1): set by the super admin; null = not verified.
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
  // Profile bio (P2), up to 150 characters; null = none.
  bio: text("bio"),
  // Preferred UI language (i18n): "vi" or "en", validated on write. Nullable
  // on purpose (null = not chosen, use the device cookie or the default).
  locale: text("locale"),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Preferred UI language (i18n): "vi" or "en", validated on write. Nullable
    // on purpose (null = not chosen, use the device cookie or the default).
    locale: text("locale"),
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
    // Chat bubble colour (KAN-141), see admins.chatColor.
    chatColor: text("chat_color"),
    // Profile photo (KAN-157), see admins.avatar.
    avatar: text("avatar"),
    avatarUpdatedAt: integer("avatar_updated_at", { mode: "timestamp" }),
    // PT workspace (P1): the PT admin responsible for this trainee (admins.id,
    // not enforced). Null = only super admins manage the trainee.
    ptAdminId: integer("pt_admin_id"),
    // Social profile (P2). All nullable: columns added to existing tables must
    // not be NOT NULL. Bio up to 150 characters.
    bio: text("bio"),
    // Version of the terms the trainee accepted and when; null = never.
    termsVersion: integer("terms_version"),
    termsAcceptedAt: integer("terms_accepted_at", { mode: "timestamp" }),
    // The privacy the composer starts with (the last one chosen); null = friends.
    postPrivacyDefault: text("post_privacy_default", {
      enum: ["everyone", "friends", "only_me"],
    }),
    createdAt: createdAt(),
  },
  (table) => [index("users_pt_admin").on(table.ptAdminId)],
);

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
    // Optional translations; null falls back to the starter-food map, then to
    // `name` (features/foods/utils/food-locale.ts).
    nameEn: text("name_en"),
    nameZh: text("name_zh"),
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
    // KAN-144: a sticker message has an empty body. Ref is "pack:<id>" or
    // "giphy:<id>"; the URL is a bundled path or a GIPHY media URL.
    stickerRef: text("sticker_ref"),
    stickerUrl: text("sticker_url"),
    // KAN-160: a photo message points at its chat_photos row. Nullable on
    // purpose (production incident #121: new columns on existing tables must
    // not be notNull).
    photoId: integer("photo_id"),
    // The social post this message replies to ("Trả lời qua tin nhắn"). Nullable
    // like every new column; cleared when the message is unsent.
    replyPostId: integer("reply_post_id"),
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

// Personal stickers (KAN-158): an image the owner picked and the browser
// re-encoded (WebP or PNG, <= 150 KB). The owner is a trainee ("user") or a PT
// ("admin"); no foreign key because the id lives in one of two tables. A
// sticker already sent in a message is only hidden (deletedAt) when its owner
// removes it, so the chat history keeps working.
export const chatCustomStickers = sqliteTable(
  "chat_custom_stickers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKind: text("owner_kind", { enum: ["user", "admin"] }).notNull(),
    ownerId: integer("owner_id").notNull(),
    mime: text("mime", { enum: ["image/webp", "image/png"] }).notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    size: integer("size").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("chat_custom_stickers_owner").on(table.ownerKind, table.ownerId),
  ],
);

// Photos sent in chat (KAN-160): the browser resized and re-encoded the image
// (WebP, long side <= 1600 px); the bytes live here like avatars. A row is
// pending (messageId null) from the upload until the message that carries it
// is stored. Unsending the message deletes the row, bytes included.
export const chatPhotos = sqliteTable(
  "chat_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id").notNull(),
    messageId: integer("message_id"),
    // Who uploaded it: "user" or "admin:<id>" (same format as reader keys).
    uploaderKey: text("uploader_key").notNull(),
    mime: text("mime", {
      enum: ["image/webp", "image/jpeg", "image/png"],
    }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("chat_photos_message").on(table.messageId),
    index("chat_photos_conversation").on(table.conversationId),
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

// Legacy (KAN-141): shared nicknames per conversation, replaced by the private
// contact_aliases. App code no longer reads or writes it; the setup script
// copies its rows into contactAliases once. A member's removal still clears
// the rows of their conversation.
export const chatNicknames = sqliteTable(
  "chat_nicknames",
  {
    conversationId: integer("conversation_id").notNull(),
    targetKey: text("target_key").notNull(),
    nickname: text("nickname").notNull(),
    setByKey: text("set_by_key").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.targetKey] })],
);

// Private nicknames (Zalo style): owner_key renamed target_key for the owner's
// own eyes only. Both are actor keys "user:<id>" / "admin:<id>"; the target
// "pt" (a trainee owner only) means the PT side as a whole in the trainee's
// chat header. A cleared alias deletes the row.
export const contactAliases = sqliteTable(
  "contact_aliases",
  {
    ownerKey: text("owner_key").notNull(),
    targetKey: text("target_key").notNull(),
    alias: text("alias").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerKey, table.targetKey] }),
    index("contact_aliases_owner_key").on(table.ownerKey),
  ],
);

// An admin's bubble colour for one conversation only (KAN-141, Q7); it wins
// over admins.chat_color there.
export const chatColorOverrides = sqliteTable(
  "chat_color_overrides",
  {
    conversationId: integer("conversation_id").notNull(),
    adminId: integer("admin_id").notNull(),
    color: text("color").notNull(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.adminId] })],
);

// Legacy (KAN-160 round 1): per-conversation hiding. App code no longer reads or
// writes it; scripts/setup-database.ts moves its rows into adminHiddenUsers.
export const chatHiddenConversations = sqliteTable(
  "chat_hidden_conversations",
  {
    adminId: integer("admin_id").notNull(),
    conversationId: integer("conversation_id").notNull(),
    hiddenAt: integer("hidden_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.adminId, table.conversationId] })],
);

// Trainees an admin hid behind their passcode (KAN-163). Per admin: other
// admins and the trainee see no change. No foreign keys, like the tables above.
export const adminHiddenUsers = sqliteTable(
  "admin_hidden_users",
  {
    adminId: integer("admin_id").notNull(),
    userId: integer("user_id").notNull(),
    hiddenAt: integer("hidden_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.adminId, table.userId] })],
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

// Social posts (P2). The author is a trainee or an admin (author_kind +
// author_id, not enforced). Deleting sets deleted_at and drops the photo.
export const socialPosts = sqliteTable(
  "social_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    authorKind: text("author_kind", { enum: ["user", "admin"] }).notNull(),
    authorId: integer("author_id").notNull(),
    caption: text("caption"),
    privacy: text("privacy", {
      enum: ["everyone", "friends", "only_me"],
    }).notNull(),
    photoId: integer("photo_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("social_posts_author").on(
      table.authorKind,
      table.authorId,
      table.createdAt,
    ),
  ],
);

// One photo per post, stored like chat_photos. post_id null = uploaded but not
// posted yet (dropped after a day).
export const socialPostPhotos = sqliteTable(
  "social_post_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // "user:<id>" or "admin:<id>".
    uploaderKey: text("uploader_key").notNull(),
    postId: integer("post_id"),
    mime: text("mime", {
      enum: ["image/webp", "image/jpeg", "image/png"],
    }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("social_post_photos_post").on(table.postId)],
);

// One reaction per person per post (P3). reactor_key is "user:<id>" or
// "admin:<id>".
export const socialReactions = sqliteTable(
  "social_reactions",
  {
    postId: integer("post_id").notNull(),
    reactorKey: text("reactor_key").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.reactorKey] })],
);

// Flat, text-only comments (P3). Deleting sets deleted_at and empties body.
export const socialComments = sqliteTable(
  "social_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id").notNull(),
    authorKey: text("author_key").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("social_comments_post").on(table.postId, table.createdAt)],
);

// What the notifications page lists (P3). pushed_at is when a push for this
// row went out; it throttles reaction pushes to one per post per hour.
export const socialNotifications = sqliteTable(
  "social_notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipientKey: text("recipient_key").notNull(),
    kind: text("kind", {
      enum: [
        "friend_request",
        "friend_accepted",
        "post_reaction",
        "post_comment",
      ],
    }).notNull(),
    actorKey: text("actor_key").notNull(),
    postId: integer("post_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    pushedAt: integer("pushed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("social_notifications_recipient").on(
      table.recipientKey,
      table.createdAt,
    ),
  ],
);

// Friendships between two trainees (P4). One row per pair: user_low < user_high.
// requested_by is the one who sent the request; accepted_at is null while
// pending. Declining, cancelling and unfriending delete the row.
export const socialFriendships = sqliteTable(
  "social_friendships",
  {
    userLow: integer("user_low").notNull(),
    userHigh: integer("user_high").notNull(),
    status: text("status", { enum: ["pending", "accepted"] }).notNull(),
    requestedBy: integer("requested_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    primaryKey({ columns: [table.userLow, table.userHigh] }),
    index("social_friendships_high").on(table.userHigh),
  ],
);

// blocker_id blocked blocked_id (trainees, P4).
export const socialBlocks = sqliteTable(
  "social_blocks",
  {
    blockerId: integer("blocker_id").notNull(),
    blockedId: integer("blocked_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    index("social_blocks_blocked").on(table.blockedId),
  ],
);

// Reports on a post, comment or user (P4). reporter_key is "user:<id>" or
// "admin:<id>"; target_id is the id of the post, comment or trainee.
export const socialReports = sqliteTable(
  "social_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reporterKey: text("reporter_key").notNull(),
    targetKind: text("target_kind", {
      enum: ["post", "comment", "user"],
    }).notNull(),
    targetId: integer("target_id").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status", { enum: ["open", "resolved"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    resolvedBy: integer("resolved_by"),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    resolution: text("resolution", { enum: ["kept", "deleted"] }),
  },
  (table) => [index("social_reports_status").on(table.status, table.createdAt)],
);

// Trainee-to-trainee chat (P5). One conversation per pair (user_low <
// user_high, same ordering as social_friendships). No foreign keys, member
// delete removes these by hand.
export const dmConversations = sqliteTable(
  "dm_conversations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userLow: integer("user_low").notNull(),
    userHigh: integer("user_high").notNull(),
    // Denormalised for the inbox sort and preview.
    lastMessageId: integer("last_message_id"),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("dm_conversations_pair").on(table.userLow, table.userHigh),
    index("dm_conversations_high").on(table.userHigh),
  ],
);

// Text and/or one photo. Unsend soft-deletes (deletedAt) and drops the text
// and the photo bytes.
export const dmMessages = sqliteTable(
  "dm_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id").notNull(),
    senderId: integer("sender_id").notNull(),
    body: text("body"),
    photoId: integer("photo_id"),
    // The post this message replies to (story-reply style); null otherwise.
    replyPostId: integer("reply_post_id"),
    // Client-generated uuid so a retried send is a no-op.
    clientId: text("client_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("dm_messages_conversation_client").on(
      table.conversationId,
      table.clientId,
    ),
    index("dm_messages_conversation_id").on(table.conversationId, table.id),
  ],
);

// Like chat_photos: pending (messageId null) from the upload until a message
// carries it.
export const dmPhotos = sqliteTable(
  "dm_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id").notNull(),
    messageId: integer("message_id"),
    uploaderId: integer("uploader_id").notNull(),
    mime: text("mime", {
      enum: ["image/webp", "image/jpeg", "image/png"],
    }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("dm_photos_message").on(table.messageId),
    index("dm_photos_conversation").on(table.conversationId),
  ],
);

export const dmReads = sqliteTable(
  "dm_reads",
  {
    conversationId: integer("conversation_id").notNull(),
    userId: integer("user_id").notNull(),
    lastReadMessageId: integer("last_read_message_id").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] })],
);
