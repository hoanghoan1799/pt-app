-- FROZEN. The SQLite (Turso) schema the production database had when the web
-- app moved to the NestJS API + PostgreSQL. Generated once from the retired
-- Drizzle schema (apps/web/db/schema.ts) with drizzle-kit's SQLite generator
-- against an empty database, never against a remote URL. Do not edit it: it only
-- feeds the one-time data script's test fixture (test/support/turso-fixture.ts)
-- and the check in scripts/turso-columns.test.ts. Statements are separated by
-- the breakpoint marker lines drizzle-kit writes.
CREATE TABLE `admin_hidden_users` (
	`admin_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`hidden_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`admin_id`, `user_id`)
);

--> statement-breakpoint
CREATE TABLE `admins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`username_key` text NOT NULL,
	`password_hash` text NOT NULL,
	`last_seen_at` integer,
	`chat_color` text,
	`avatar` text,
	`avatar_updated_at` integer,
	`passcode_hash` text,
	`passcode_failed_count` integer DEFAULT 0,
	`presence_hidden` integer DEFAULT false,
	`role` text,
	`verified_at` integer,
	`bio` text,
	`locale` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `admins_username_key_unique` ON `admins` (`username_key`);
--> statement-breakpoint
CREATE TABLE `body_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`sex` text NOT NULL,
	`birth_year` integer NOT NULL,
	`height_cm` real NOT NULL,
	`weight_kg` real NOT NULL,
	`activity_level` text NOT NULL,
	`goal` text NOT NULL,
	`kcal_adjustment` integer,
	`protein_per_kg` real,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `body_profiles_user_id_unique` ON `body_profiles` (`user_id`);
--> statement-breakpoint
CREATE TABLE `chat_color_overrides` (
	`conversation_id` integer NOT NULL,
	`admin_id` integer NOT NULL,
	`color` text NOT NULL,
	PRIMARY KEY(`conversation_id`, `admin_id`)
);

--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`last_message_id` integer,
	`last_message_at` integer,
	`last_change_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX `chat_conversations_user_id_unique` ON `chat_conversations` (`user_id`);
--> statement-breakpoint
CREATE INDEX `chat_conversations_last_message_at` ON `chat_conversations` (`last_message_at`);
--> statement-breakpoint
CREATE TABLE `chat_custom_stickers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` integer NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`size` integer NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `chat_custom_stickers_owner` ON `chat_custom_stickers` (`owner_kind`,`owner_id`);
--> statement-breakpoint
CREATE TABLE `chat_hidden_conversations` (
	`admin_id` integer NOT NULL,
	`conversation_id` integer NOT NULL,
	`hidden_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`admin_id`, `conversation_id`)
);

--> statement-breakpoint
CREATE TABLE `chat_message_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`previous_body` text NOT NULL,
	`edited_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `chat_message_edits_message_id` ON `chat_message_edits` (`message_id`);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`sender_role` text NOT NULL,
	`sender_admin_id` integer,
	`body` text DEFAULT '' NOT NULL,
	`attachment_url` text,
	`attachment_meta` text,
	`client_id` text NOT NULL,
	`deleted_at` integer,
	`hidden_by_admin_id` integer,
	`reply_to_message_id` integer,
	`sticker_ref` text,
	`sticker_url` text,
	`photo_id` integer,
	`reply_post_id` integer,
	`silent` integer,
	`edited_at` integer,
	`updated_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_conversation_client` ON `chat_messages` (`conversation_id`,`client_id`);
--> statement-breakpoint
CREATE INDEX `chat_messages_conversation_id` ON `chat_messages` (`conversation_id`,`id`);
--> statement-breakpoint
CREATE TABLE `chat_nicknames` (
	`conversation_id` integer NOT NULL,
	`target_key` text NOT NULL,
	`nickname` text NOT NULL,
	`set_by_key` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `target_key`)
);

--> statement-breakpoint
CREATE TABLE `chat_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`message_id` integer,
	`uploader_key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`data` blob NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `chat_photos_message` ON `chat_photos` (`message_id`);
--> statement-breakpoint
CREATE INDEX `chat_photos_conversation` ON `chat_photos` (`conversation_id`);
--> statement-breakpoint
CREATE TABLE `chat_reactions` (
	`message_id` integer NOT NULL,
	`reactor_key` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `reactor_key`)
);

--> statement-breakpoint
CREATE TABLE `chat_reads` (
	`conversation_id` integer NOT NULL,
	`reader_key` text NOT NULL,
	`last_read_message_id` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`conversation_id`, `reader_key`)
);

--> statement-breakpoint
CREATE TABLE `contact_aliases` (
	`owner_key` text NOT NULL,
	`target_key` text NOT NULL,
	`alias` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_key`, `target_key`)
);

--> statement-breakpoint
CREATE INDEX `contact_aliases_owner_key` ON `contact_aliases` (`owner_key`);
--> statement-breakpoint
CREATE TABLE `dm_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_low` integer NOT NULL,
	`user_high` integer NOT NULL,
	`last_message_id` integer,
	`last_message_at` integer,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `dm_conversations_pair` ON `dm_conversations` (`user_low`,`user_high`);
--> statement-breakpoint
CREATE INDEX `dm_conversations_high` ON `dm_conversations` (`user_high`);
--> statement-breakpoint
CREATE TABLE `dm_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`sender_id` integer NOT NULL,
	`body` text,
	`photo_id` integer,
	`reply_post_id` integer,
	`client_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);

--> statement-breakpoint
CREATE UNIQUE INDEX `dm_messages_conversation_client` ON `dm_messages` (`conversation_id`,`client_id`);
--> statement-breakpoint
CREATE INDEX `dm_messages_conversation_id` ON `dm_messages` (`conversation_id`,`id`);
--> statement-breakpoint
CREATE TABLE `dm_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`message_id` integer,
	`uploader_id` integer NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`data` blob NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `dm_photos_message` ON `dm_photos` (`message_id`);
--> statement-breakpoint
CREATE INDEX `dm_photos_conversation` ON `dm_photos` (`conversation_id`);
--> statement-breakpoint
CREATE TABLE `dm_reads` (
	`conversation_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`last_read_message_id` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`conversation_id`, `user_id`)
);

--> statement-breakpoint
CREATE TABLE `exercise_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_completions_exercise_id_unique` ON `exercise_completions` (`exercise_id`);
--> statement-breakpoint
CREATE TABLE `exercise_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`position` integer NOT NULL,
	`weight_kg` real,
	`reps` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_sets_exercise_position` ON `exercise_sets` (`exercise_id`,`position`);
--> statement-breakpoint
CREATE INDEX `exercise_sets_user` ON `exercise_sets` (`user_id`);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sets` integer,
	`reps` text DEFAULT '' NOT NULL,
	`youtube_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `workout_days`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE TABLE `food_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`meal` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`carbs` integer,
	`protein` integer,
	`fat` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE TABLE `foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`name_en` text,
	`name_zh` text,
	`group` text NOT NULL,
	`state` text,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`serving_label` text,
	`serving_grams` real,
	`source` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `foods_active_name_key` ON `foods` (`name_key`) WHERE "foods"."archived_at" IS NULL;
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL,
	`locked_until` integer
);

--> statement-breakpoint
CREATE TABLE `meal_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`meal_id` integer NOT NULL,
	`food_id` integer,
	`custom_name` text,
	`grams` real NOT NULL,
	`kcal` real,
	`protein` real,
	`carbs` real,
	`fat` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal_plan_meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE INDEX `meal_logs_meal` ON `meal_logs` (`meal_id`);
--> statement-breakpoint
CREATE INDEX `meal_logs_user` ON `meal_logs` (`user_id`);
--> statement-breakpoint
CREATE TABLE `meal_mark_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mark_id` integer NOT NULL,
	`meal_id` integer NOT NULL,
	`food_id` integer,
	`grams` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`kcal` real NOT NULL,
	FOREIGN KEY (`mark_id`) REFERENCES `meal_marks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal_plan_meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE INDEX `meal_mark_items_meal` ON `meal_mark_items` (`meal_id`);
--> statement-breakpoint
CREATE TABLE `meal_marks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`achieved` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meal_plan_meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `meal_marks_meal_id_unique` ON `meal_marks` (`meal_id`);
--> statement-breakpoint
CREATE TABLE `meal_plan_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_days_user_date` ON `meal_plan_days` (`user_id`,`date`);
--> statement-breakpoint
CREATE TABLE `meal_plan_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`food_id` integer NOT NULL,
	`grams` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meal_plan_meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE INDEX `meal_plan_items_meal` ON `meal_plan_items` (`meal_id`);
--> statement-breakpoint
CREATE TABLE `meal_plan_meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_id` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`share_percent` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `meal_plan_days`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX `meal_plan_meals_day` ON `meal_plan_meals` (`day_id`);
--> statement-breakpoint
CREATE TABLE `nutrition_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`effective_from` text NOT NULL,
	`carbs` integer NOT NULL,
	`protein` integer NOT NULL,
	`fat` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_targets_user_from` ON `nutrition_targets` (`user_id`,`effective_from`);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_success_at` integer
);

--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_owner_key` ON `push_subscriptions` (`owner_key`);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `social_blocks` (
	`blocker_id` integer NOT NULL,
	`blocked_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`)
);

--> statement-breakpoint
CREATE INDEX `social_blocks_blocked` ON `social_blocks` (`blocked_id`);
--> statement-breakpoint
CREATE TABLE `social_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`author_key` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);

--> statement-breakpoint
CREATE INDEX `social_comments_post` ON `social_comments` (`post_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `social_friendships` (
	`user_low` integer NOT NULL,
	`user_high` integer NOT NULL,
	`status` text NOT NULL,
	`requested_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	PRIMARY KEY(`user_low`, `user_high`)
);

--> statement-breakpoint
CREATE INDEX `social_friendships_high` ON `social_friendships` (`user_high`);
--> statement-breakpoint
CREATE TABLE `social_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_key` text NOT NULL,
	`kind` text NOT NULL,
	`actor_key` text NOT NULL,
	`post_id` integer,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`pushed_at` integer
);

--> statement-breakpoint
CREATE INDEX `social_notifications_recipient` ON `social_notifications` (`recipient_key`,`created_at`);
--> statement-breakpoint
CREATE TABLE `social_post_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uploader_key` text NOT NULL,
	`post_id` integer,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`data` blob NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `social_post_photos_post` ON `social_post_photos` (`post_id`);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_kind` text NOT NULL,
	`author_id` integer NOT NULL,
	`caption` text,
	`privacy` text NOT NULL,
	`photo_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);

--> statement-breakpoint
CREATE INDEX `social_posts_author` ON `social_posts` (`author_kind`,`author_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `social_reactions` (
	`post_id` integer NOT NULL,
	`reactor_key` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `reactor_key`)
);

--> statement-breakpoint
CREATE TABLE `social_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_key` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_by` integer,
	`resolved_at` integer,
	`resolution` text
);

--> statement-breakpoint
CREATE INDEX `social_reports_status` ON `social_reports` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`locale` text,
	`name_key` text NOT NULL,
	`preferred_meal_count` integer,
	`food_note` text,
	`email` text,
	`email_key` text,
	`password_hash` text,
	`password_changed_at` integer,
	`chat_enabled` integer,
	`chat_enabled_changed_at` integer,
	`chat_enabled_by_admin_id` integer,
	`last_seen_at` integer,
	`chat_color` text,
	`avatar` text,
	`avatar_updated_at` integer,
	`pt_admin_id` integer,
	`bio` text,
	`terms_version` integer,
	`terms_accepted_at` integer,
	`post_privacy_default` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_key_unique` ON `users` (`name_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_key_unique` ON `users` (`email_key`);
--> statement-breakpoint
CREATE INDEX `users_pt_admin` ON `users` (`pt_admin_id`);
--> statement-breakpoint
CREATE TABLE `weight_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `weight_logs_user_date` ON `weight_logs` (`user_id`,`date`);
--> statement-breakpoint
CREATE TABLE `workout_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `workout_days_user_date` ON `workout_days` (`user_id`,`date`);
