import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1794454359556 implements MigrationInterface {
  name = "Baseline1794454359556";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Hand-written (not generated): search extensions and the IMMUTABLE
    // wrapper that expression indexes need (unaccent itself is only STABLE).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
            CREATE FUNCTION immutable_unaccent(text) RETURNS text
            LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
            AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$
        `);
    await queryRunner.query(`
            CREATE TABLE "admins" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "username" text NOT NULL,
                "username_key" text NOT NULL,
                "password_hash" text NOT NULL,
                "last_seen_at" TIMESTAMP WITH TIME ZONE,
                "chat_color" text,
                "avatar" text,
                "avatar_updated_at" TIMESTAMP WITH TIME ZONE,
                "passcode_hash" text,
                "passcode_failed_count" integer DEFAULT '0',
                "presence_hidden" boolean DEFAULT false,
                "role" text,
                "verified_at" TIMESTAMP WITH TIME ZONE,
                "bio" text,
                "locale" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_595610478e413dc6efec6fe8c86" UNIQUE ("username_key"),
                CONSTRAINT "CHK_dc033f88b42751abf8302ba115" CHECK ("role" IN ('super_admin', 'pt')),
                CONSTRAINT "PK_e3b38270c97a854c48d2e80874e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "name" text NOT NULL,
                "locale" text,
                "name_key" text NOT NULL,
                "preferred_meal_count" integer,
                "food_note" text,
                "email" text,
                "email_key" text,
                "password_hash" text,
                "password_changed_at" TIMESTAMP WITH TIME ZONE,
                "chat_enabled" boolean,
                "chat_enabled_changed_at" TIMESTAMP WITH TIME ZONE,
                "chat_enabled_by_admin_id" integer,
                "last_seen_at" TIMESTAMP WITH TIME ZONE,
                "chat_color" text,
                "avatar" text,
                "avatar_updated_at" TIMESTAMP WITH TIME ZONE,
                "pt_admin_id" integer,
                "bio" text,
                "terms_version" integer,
                "terms_accepted_at" TIMESTAMP WITH TIME ZONE,
                "post_privacy_default" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_3a7bcf5af4253fa487ece4a73a6" UNIQUE ("name_key"),
                CONSTRAINT "UQ_d87b0da10cbb5c0bdb73164f480" UNIQUE ("email_key"),
                CONSTRAINT "CHK_08fbaf59524c7c76c9df295f47" CHECK (
                    "post_privacy_default" IN ('everyone', 'friends', 'only_me')
                ),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "users_chat_enabled_by_admin_id_idx" ON "users" ("chat_enabled_by_admin_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "users_pt_admin" ON "users" ("pt_admin_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "admin_hidden_users" (
                "admin_id" integer NOT NULL,
                "user_id" integer NOT NULL,
                "hidden_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_2bb16e35b2608d61268e818f55b" PRIMARY KEY ("admin_id", "user_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "admin_hidden_users_user_id_idx" ON "admin_hidden_users" ("user_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "body_profiles" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "sex" text NOT NULL,
                "birth_year" integer NOT NULL,
                "height_cm" double precision NOT NULL,
                "weight_kg" double precision NOT NULL,
                "activity_level" text NOT NULL,
                "goal" text NOT NULL,
                "kcal_adjustment" integer,
                "protein_per_kg" double precision,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_5a44864f020c4a4c60fb42150d8" UNIQUE ("user_id"),
                CONSTRAINT "CHK_d58d00ee5a9c1b6122fbc4b223" CHECK ("goal" IN ('cut', 'maintain', 'bulk')),
                CONSTRAINT "CHK_6466badaa6f9ee54b57c5e32c1" CHECK (
                    "activity_level" IN (
                        'sedentary',
                        'light',
                        'moderate',
                        'active',
                        'very_active'
                    )
                ),
                CONSTRAINT "CHK_0524453c04f56c34fb6beb361d" CHECK ("sex" IN ('male', 'female')),
                CONSTRAINT "PK_e650abca615fd13261cba244a0c" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_photos" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "conversation_id" integer NOT NULL,
                "message_id" integer,
                "uploader_key" text NOT NULL,
                "mime" text NOT NULL,
                "width" integer NOT NULL,
                "height" integer NOT NULL,
                "data" bytea NOT NULL,
                "size" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "CHK_1be0ed402de74a933da7d6fbff" CHECK (
                    "mime" IN ('image/webp', 'image/jpeg', 'image/png')
                ),
                CONSTRAINT "PK_c32540228bfe24a80fde43e7188" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_photos_conversation" ON "chat_photos" ("conversation_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_photos_message" ON "chat_photos" ("message_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "social_post_photos" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "uploader_key" text NOT NULL,
                "post_id" integer,
                "mime" text NOT NULL,
                "width" integer NOT NULL,
                "height" integer NOT NULL,
                "data" bytea NOT NULL,
                "size" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "CHK_4e0193cf679847838a5f23830d" CHECK (
                    "mime" IN ('image/webp', 'image/jpeg', 'image/png')
                ),
                CONSTRAINT "PK_67072e40a725e37e36f4cc48555" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "social_post_photos_post" ON "social_post_photos" ("post_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "social_posts" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "author_kind" text NOT NULL,
                "author_id" integer NOT NULL,
                "caption" text,
                "privacy" text NOT NULL,
                "photo_id" integer,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "CHK_487e5f84414572b7559048b54f" CHECK ("privacy" IN ('everyone', 'friends', 'only_me')),
                CONSTRAINT "CHK_8683495637454781ac685110a3" CHECK ("author_kind" IN ('user', 'admin')),
                CONSTRAINT "PK_2161864ea79f14525b8804bd7ff" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "social_posts_photo_id_idx" ON "social_posts" ("photo_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "social_posts_author" ON "social_posts" ("author_kind", "author_id", "created_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_messages" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "conversation_id" integer NOT NULL,
                "sender_role" text NOT NULL,
                "sender_admin_id" integer,
                "body" text NOT NULL DEFAULT '',
                "attachment_url" text,
                "attachment_meta" text,
                "client_id" text NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "hidden_by_admin_id" integer,
                "reply_to_message_id" integer,
                "sticker_ref" text,
                "sticker_url" text,
                "photo_id" integer,
                "reply_post_id" integer,
                "silent" boolean,
                "edited_at" TIMESTAMP WITH TIME ZONE,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "CHK_d48a42d5fdffc2338f2264cfd4" CHECK ("sender_role" IN ('user', 'admin')),
                CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_messages_reply_post_id_idx" ON "chat_messages" ("reply_post_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_messages_photo_id_idx" ON "chat_messages" ("photo_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_messages_reply_to_message_id_idx" ON "chat_messages" ("reply_to_message_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_messages_hidden_by_admin_id_idx" ON "chat_messages" ("hidden_by_admin_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_messages_sender_admin_id_idx" ON "chat_messages" ("sender_admin_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_messages_conversation_id" ON "chat_messages" ("conversation_id", "id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "chat_messages_conversation_client" ON "chat_messages" ("conversation_id", "client_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_conversations" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "last_message_id" integer,
                "last_message_at" TIMESTAMP WITH TIME ZONE,
                "last_change_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_7f9e5689ad3d7f45172fc156fbf" UNIQUE ("user_id"),
                CONSTRAINT "PK_ff117d9f57807c4f2e3034a39f3" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_conversations_last_message_id_idx" ON "chat_conversations" ("last_message_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_conversations_last_message_at" ON "chat_conversations" ("last_message_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_color_overrides" (
                "conversation_id" integer NOT NULL,
                "admin_id" integer NOT NULL,
                "color" text NOT NULL,
                CONSTRAINT "PK_f85cf9eceb6a08b68328ec8a02b" PRIMARY KEY ("conversation_id", "admin_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_color_overrides_admin_id_idx" ON "chat_color_overrides" ("admin_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_custom_stickers" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "owner_kind" text NOT NULL,
                "owner_id" integer NOT NULL,
                "mime" text NOT NULL,
                "data" bytea NOT NULL,
                "size" integer NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "CHK_cd473f504579dd1ca035d4f837" CHECK ("mime" IN ('image/webp', 'image/png')),
                CONSTRAINT "CHK_5174277f764755797e1f37bffb" CHECK ("owner_kind" IN ('user', 'admin')),
                CONSTRAINT "PK_6a396e6eb19ca3a4f03af48a8ff" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_custom_stickers_owner" ON "chat_custom_stickers" ("owner_kind", "owner_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_hidden_conversations" (
                "admin_id" integer NOT NULL,
                "conversation_id" integer NOT NULL,
                "hidden_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ef8e25ff5a83d08a940d096cc05" PRIMARY KEY ("admin_id", "conversation_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_hidden_conversations_conversation_id_idx" ON "chat_hidden_conversations" ("conversation_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_message_edits" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "message_id" integer NOT NULL,
                "previous_body" text NOT NULL,
                "edited_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_9e6036e7759d3c513a2b0df7147" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_message_edits_message_id" ON "chat_message_edits" ("message_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_nicknames" (
                "conversation_id" integer NOT NULL,
                "target_key" text NOT NULL,
                "nickname" text NOT NULL,
                "set_by_key" text NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_6b970e2c7189c401face1a838e2" PRIMARY KEY ("conversation_id", "target_key")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_reactions" (
                "message_id" integer NOT NULL,
                "reactor_key" text NOT NULL,
                "emoji" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_078fc2c7e60cde4db4feede6194" PRIMARY KEY ("message_id", "reactor_key")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "chat_reads" (
                "conversation_id" integer NOT NULL,
                "reader_key" text NOT NULL,
                "last_read_message_id" integer NOT NULL DEFAULT '0',
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e23a3f28157f64e7cc51c3f87eb" PRIMARY KEY ("conversation_id", "reader_key")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "contact_aliases" (
                "owner_key" text NOT NULL,
                "target_key" text NOT NULL,
                "alias" text NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_cf78b0e8d794c13599b93f93346" PRIMARY KEY ("owner_key", "target_key")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "contact_aliases_owner_key" ON "contact_aliases" ("owner_key")
        `);
    await queryRunner.query(`
            CREATE TABLE "dm_photos" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "conversation_id" integer NOT NULL,
                "message_id" integer,
                "uploader_id" integer NOT NULL,
                "mime" text NOT NULL,
                "width" integer NOT NULL,
                "height" integer NOT NULL,
                "data" bytea NOT NULL,
                "size" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "CHK_3ce1f9e4dc7cfeb7c037483369" CHECK (
                    "mime" IN ('image/webp', 'image/jpeg', 'image/png')
                ),
                CONSTRAINT "PK_570d83db7f737a75426dafd8e26" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_photos_uploader_id_idx" ON "dm_photos" ("uploader_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_photos_conversation" ON "dm_photos" ("conversation_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_photos_message" ON "dm_photos" ("message_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "dm_messages" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "conversation_id" integer NOT NULL,
                "sender_id" integer NOT NULL,
                "body" text,
                "photo_id" integer,
                "reply_post_id" integer,
                "client_id" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_24b287ad446f01f5a364a277627" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_messages_reply_post_id_idx" ON "dm_messages" ("reply_post_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_messages_photo_id_idx" ON "dm_messages" ("photo_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_messages_sender_id_idx" ON "dm_messages" ("sender_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_messages_conversation_id" ON "dm_messages" ("conversation_id", "id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "dm_messages_conversation_client" ON "dm_messages" ("conversation_id", "client_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "dm_conversations" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_low" integer NOT NULL,
                "user_high" integer NOT NULL,
                "last_message_id" integer,
                "last_message_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_7bdbd625ee8afc40e14ec8bb10e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_conversations_last_message_id_idx" ON "dm_conversations" ("last_message_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_conversations_high" ON "dm_conversations" ("user_high")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "dm_conversations_pair" ON "dm_conversations" ("user_low", "user_high")
        `);
    await queryRunner.query(`
            CREATE TABLE "dm_reads" (
                "conversation_id" integer NOT NULL,
                "user_id" integer NOT NULL,
                "last_read_message_id" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_850cb804b956326de19dea5fb8a" PRIMARY KEY ("conversation_id", "user_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "dm_reads_user_id_idx" ON "dm_reads" ("user_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "workout_days" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "date" text NOT NULL,
                "title" text NOT NULL DEFAULT '',
                "note" text NOT NULL DEFAULT '',
                "source" text NOT NULL DEFAULT 'manual',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_c52c144ce44ad81a6c085303e1" CHECK ("source" IN ('manual', 'tdee')),
                CONSTRAINT "PK_bc5724d5cb04625732f1bab0965" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "workout_days_user_date" ON "workout_days" ("user_id", "date")
        `);
    await queryRunner.query(`
            CREATE TABLE "exercises" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "day_id" integer NOT NULL,
                "title" text NOT NULL,
                "description" text NOT NULL DEFAULT '',
                "sets" integer,
                "reps" text NOT NULL DEFAULT '',
                "youtube_id" text NOT NULL,
                "position" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c4c46f5fa89a58ba7c2d894e3c3" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "exercises_day_id_idx" ON "exercises" ("day_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "exercise_completions" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "exercise_id" integer NOT NULL,
                "user_id" integer NOT NULL,
                "completed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "UQ_e7d3448a111825db29bbea4cbcf" UNIQUE ("exercise_id"),
                CONSTRAINT "PK_3d0ea3452d8df8563e8f8a35300" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "exercise_completions_user_id_idx" ON "exercise_completions" ("user_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "exercise_sets" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "exercise_id" integer NOT NULL,
                "user_id" integer NOT NULL,
                "position" integer NOT NULL,
                "weight_kg" double precision,
                "reps" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_113166a6f1f6e3ab3bd47ebf992" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "exercise_sets_user" ON "exercise_sets" ("user_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "exercise_sets_exercise_position" ON "exercise_sets" ("exercise_id", "position")
        `);
    await queryRunner.query(`
            CREATE TABLE "food_entries" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "date" text NOT NULL,
                "meal" text NOT NULL,
                "description" text NOT NULL DEFAULT '',
                "carbs" integer,
                "protein" integer,
                "fat" integer,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_30c4d8be5533eb2142a112f912" CHECK (
                    "meal" IN ('breakfast', 'lunch', 'dinner', 'snack')
                ),
                CONSTRAINT "PK_9ff4018d66bc4142ac2222a3ad0" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "food_entries_user_id_idx" ON "food_entries" ("user_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "foods" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "name" text NOT NULL,
                "name_key" text NOT NULL,
                "name_en" text,
                "name_zh" text,
                "group" text NOT NULL,
                "state" text,
                "kcal" double precision NOT NULL,
                "protein" double precision NOT NULL,
                "carbs" double precision NOT NULL,
                "fat" double precision NOT NULL,
                "fiber" double precision,
                "serving_label" text,
                "serving_grams" double precision,
                "source" text NOT NULL DEFAULT '',
                "archived_at" TIMESTAMP WITH TIME ZONE,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_933897b07235beae457c93b25f" CHECK ("state" IN ('raw', 'cooked')),
                CONSTRAINT "CHK_c0ca17ab46a4b054e2130dea44" CHECK (
                    "group" IN (
                        'meat',
                        'seafood',
                        'egg_dairy',
                        'starch',
                        'vegetable',
                        'fruit',
                        'legume_nut',
                        'fat_oil',
                        'dish',
                        'other'
                    )
                ),
                CONSTRAINT "PK_0cc83421325632f61fa27a52b59" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "foods_active_name_key" ON "foods" ("name_key")
            WHERE "archived_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE TABLE "login_attempts" (
                "key" text NOT NULL,
                "failed_count" integer NOT NULL DEFAULT '0',
                "window_started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "locked_until" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_f90e70c50d5744e4d9f41dd397c" PRIMARY KEY ("key")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "meal_plan_days" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "date" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_944512626bad7b08059af244fb8" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "meal_plan_days_user_date" ON "meal_plan_days" ("user_id", "date")
        `);
    await queryRunner.query(`
            CREATE TABLE "meal_plan_meals" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "day_id" integer NOT NULL,
                "position" integer NOT NULL,
                "name" text NOT NULL,
                "share_percent" double precision,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e1217b8d94a671032e449b16938" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_plan_meals_day" ON "meal_plan_meals" ("day_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "meal_logs" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "meal_id" integer NOT NULL,
                "food_id" integer,
                "custom_name" text,
                "grams" double precision NOT NULL,
                "kcal" double precision,
                "protein" double precision,
                "carbs" double precision,
                "fat" double precision,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ce7e6e4887e80f6a12f0f6a166a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_logs_food_id_idx" ON "meal_logs" ("food_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_logs_user" ON "meal_logs" ("user_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_logs_meal" ON "meal_logs" ("meal_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "meal_marks" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "meal_id" integer NOT NULL,
                "user_id" integer NOT NULL,
                "achieved" boolean NOT NULL DEFAULT false,
                "note" text NOT NULL DEFAULT '',
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_c75921581862e4efdd92cb7968d" UNIQUE ("meal_id"),
                CONSTRAINT "PK_7107a70675ab19fa50768e651b8" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_marks_user_id_idx" ON "meal_marks" ("user_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "meal_mark_items" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "mark_id" integer NOT NULL,
                "meal_id" integer NOT NULL,
                "food_id" integer,
                "grams" double precision NOT NULL,
                "protein" double precision NOT NULL,
                "carbs" double precision NOT NULL,
                "fat" double precision NOT NULL,
                "kcal" double precision NOT NULL,
                CONSTRAINT "PK_7078a181b7126c92eeb7e67c9df" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_mark_items_food_id_idx" ON "meal_mark_items" ("food_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_mark_items_mark_id_idx" ON "meal_mark_items" ("mark_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_mark_items_meal" ON "meal_mark_items" ("meal_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "meal_plan_items" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "meal_id" integer NOT NULL,
                "food_id" integer NOT NULL,
                "grams" double precision NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_0e5334892bf0438597bb4a8e58e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_plan_items_food_id_idx" ON "meal_plan_items" ("food_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "meal_plan_items_meal" ON "meal_plan_items" ("meal_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "nutrition_targets" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "effective_from" text NOT NULL,
                "carbs" integer NOT NULL,
                "protein" integer NOT NULL,
                "fat" integer NOT NULL,
                "note" text NOT NULL DEFAULT '',
                "source" text NOT NULL DEFAULT 'manual',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_7afbfff228b28ad4bc4ed6df85" CHECK ("source" IN ('manual', 'tdee')),
                CONSTRAINT "PK_4b7f2dcfec66a2fd91228463673" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "nutrition_targets_user_from" ON "nutrition_targets" ("user_id", "effective_from")
        `);
    await queryRunner.query(`
            CREATE TABLE "push_subscriptions" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "owner_key" text NOT NULL,
                "endpoint" text NOT NULL,
                "p256dh" text,
                "auth" text,
                "kind" text NOT NULL DEFAULT 'web',
                "user_agent" text NOT NULL DEFAULT '',
                "last_success_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_0008bdfd174e533a3f98bf9af16" UNIQUE ("endpoint"),
                CONSTRAINT "CHK_d68b501559ecdd684306936642" CHECK ("kind" IN ('web', 'expo', 'fcm')),
                CONSTRAINT "PK_757fc8f00c34f66832668dc2e53" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "push_subscriptions_owner_key" ON "push_subscriptions" ("owner_key")
        `);
    await queryRunner.query(`
            CREATE TABLE "rate_limits" (
                "key" text NOT NULL,
                "count" integer NOT NULL DEFAULT '0',
                "window_started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_8cb6aa4831e3e775ccf370521db" PRIMARY KEY ("key")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "sessions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "token_hash" bytea NOT NULL,
                "subject_kind" text NOT NULL,
                "user_id" integer,
                "admin_id" integer,
                "unlocked_until" TIMESTAMP WITH TIME ZONE,
                "revealed_until" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "client_kind" text NOT NULL,
                "client_name" text,
                "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "user_agent" text,
                "ip" text,
                CONSTRAINT "UQ_abaa9e068cdd390bc5210f79884" UNIQUE ("token_hash"),
                CONSTRAINT "CHK_d16f8da57e4b46f0e2714ea269" CHECK (
                    (
                        "subject_kind" = 'user'
                        AND "user_id" IS NOT NULL
                        AND "admin_id" IS NULL
                    )
                    OR (
                        "subject_kind" = 'admin'
                        AND "admin_id" IS NOT NULL
                        AND "user_id" IS NULL
                    )
                ),
                CONSTRAINT "CHK_da5e57bc7b90fa0ab056d4e804" CHECK ("client_kind" IN ('web', 'ios', 'android')),
                CONSTRAINT "CHK_da3cc4a2814430023c87532552" CHECK ("subject_kind" IN ('user', 'admin')),
                CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "sessions_expires_at_idx" ON "sessions" ("expires_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "sessions_admin_id_idx" ON "sessions" ("admin_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "social_blocks" (
                "blocker_id" integer NOT NULL,
                "blocked_id" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_cb53b78ce9aaf3a2fc76beeda70" PRIMARY KEY ("blocker_id", "blocked_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "social_blocks_blocked" ON "social_blocks" ("blocked_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "social_comments" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "post_id" integer NOT NULL,
                "author_key" text NOT NULL,
                "body" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_5969df03850043d5d63567eccbe" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "social_comments_post" ON "social_comments" ("post_id", "created_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "social_friendships" (
                "user_low" integer NOT NULL,
                "user_high" integer NOT NULL,
                "status" text NOT NULL,
                "requested_by" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "accepted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "CHK_f8d8766191ac3ebd0835ac0a7c" CHECK ("status" IN ('pending', 'accepted')),
                CONSTRAINT "PK_c6b15c9c8a364138677ade25a8e" PRIMARY KEY ("user_low", "user_high")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "social_friendships_requested_by_idx" ON "social_friendships" ("requested_by")
        `);
    await queryRunner.query(`
            CREATE INDEX "social_friendships_high" ON "social_friendships" ("user_high")
        `);
    await queryRunner.query(`
            CREATE TABLE "social_notifications" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "recipient_key" text NOT NULL,
                "kind" text NOT NULL,
                "actor_key" text NOT NULL,
                "post_id" integer,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "read_at" TIMESTAMP WITH TIME ZONE,
                "pushed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "CHK_32659b696f88489380f38b83cc" CHECK (
                    "kind" IN (
                        'friend_request',
                        'friend_accepted',
                        'post_reaction',
                        'post_comment',
                        'admin_post'
                    )
                ),
                CONSTRAINT "PK_e59ec1329e2a3eebc1869828758" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "social_notifications_post_id_idx" ON "social_notifications" ("post_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "social_notifications_recipient" ON "social_notifications" ("recipient_key", "created_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "social_reactions" (
                "post_id" integer NOT NULL,
                "reactor_key" text NOT NULL,
                "emoji" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_58c876e395d5d304b079a87aae1" PRIMARY KEY ("post_id", "reactor_key")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "social_reports" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "reporter_key" text NOT NULL,
                "target_kind" text NOT NULL,
                "target_id" integer NOT NULL,
                "reason" text NOT NULL DEFAULT '',
                "status" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "resolved_by" integer,
                "resolved_at" TIMESTAMP WITH TIME ZONE,
                "resolution" text,
                CONSTRAINT "CHK_0f0332f048537e2909f0477d32" CHECK ("resolution" IN ('kept', 'deleted')),
                CONSTRAINT "CHK_69d1c15f5217da755f0b458c9b" CHECK ("status" IN ('open', 'resolved')),
                CONSTRAINT "CHK_c032cbed5f50868af1e9050f9c" CHECK ("target_kind" IN ('post', 'comment', 'user')),
                CONSTRAINT "PK_8ae7c1f6dfc65aa7a592393e206" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "social_reports_resolved_by_idx" ON "social_reports" ("resolved_by")
        `);
    await queryRunner.query(`
            CREATE INDEX "social_reports_status" ON "social_reports" ("status", "created_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "weight_logs" (
                "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                "user_id" integer NOT NULL,
                "date" text NOT NULL,
                "weight_kg" double precision NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_96c8f4d341846b34fef50cf4576" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "weight_logs_user_date" ON "weight_logs" ("user_id", "date")
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_0c8c04a03a3791beab07000cf9a" FOREIGN KEY ("chat_enabled_by_admin_id") REFERENCES "admins"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_a665bb247c45873f606623b6599" FOREIGN KEY ("pt_admin_id") REFERENCES "admins"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "admin_hidden_users"
            ADD CONSTRAINT "FK_99fe68699167c8f7b359f6cea56" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "admin_hidden_users"
            ADD CONSTRAINT "FK_1979e292aed680ccb4bee129914" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "body_profiles"
            ADD CONSTRAINT "FK_5a44864f020c4a4c60fb42150d8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_photos"
            ADD CONSTRAINT "FK_aba09a15ddf26b7f1c2464fa396" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_photos"
            ADD CONSTRAINT "FK_7eb3699a19274f3fddcc68f7862" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_post_photos"
            ADD CONSTRAINT "FK_ee0dd655ef2b674035e242f49ed" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_posts"
            ADD CONSTRAINT "FK_c2f4eb885e6e04039c887dc7223" FOREIGN KEY ("photo_id") REFERENCES "social_post_photos"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages"
            ADD CONSTRAINT "FK_3d623662d4ee1219b23cf61e649" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages"
            ADD CONSTRAINT "FK_577e79bdb0292d4ce02136d3d1a" FOREIGN KEY ("sender_admin_id") REFERENCES "admins"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages"
            ADD CONSTRAINT "FK_4d0fa92ec6ab0484fe00e5da1a1" FOREIGN KEY ("hidden_by_admin_id") REFERENCES "admins"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages"
            ADD CONSTRAINT "FK_686a3bfebb7545534342c5fa272" FOREIGN KEY ("reply_to_message_id") REFERENCES "chat_messages"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages"
            ADD CONSTRAINT "FK_35037bafe2cad5183bdb922158e" FOREIGN KEY ("photo_id") REFERENCES "chat_photos"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages"
            ADD CONSTRAINT "FK_20b09f2c2e3668dcdede58b9a0d" FOREIGN KEY ("reply_post_id") REFERENCES "social_posts"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_conversations"
            ADD CONSTRAINT "FK_7f9e5689ad3d7f45172fc156fbf" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_conversations"
            ADD CONSTRAINT "FK_62f2a55e7ad59ec2830ad3a29fd" FOREIGN KEY ("last_message_id") REFERENCES "chat_messages"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_color_overrides"
            ADD CONSTRAINT "FK_9273aaf282e331804a38af145b1" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_color_overrides"
            ADD CONSTRAINT "FK_ae14fa35136605c6cc70256d89a" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_hidden_conversations"
            ADD CONSTRAINT "FK_931ab3aa73a97af0594d16912db" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_hidden_conversations"
            ADD CONSTRAINT "FK_8b101247a37f7fb8df22381710a" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_message_edits"
            ADD CONSTRAINT "FK_e31ab58312f60d1347efaba1162" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_nicknames"
            ADD CONSTRAINT "FK_81b116608de66734860b4dcd2ef" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_reactions"
            ADD CONSTRAINT "FK_b3409942f1ea185576f1adce065" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_reads"
            ADD CONSTRAINT "FK_08b16e42219a64ea4580021acc3" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_photos"
            ADD CONSTRAINT "FK_b50cc250af4c4dee8ccb742ab0d" FOREIGN KEY ("conversation_id") REFERENCES "dm_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_photos"
            ADD CONSTRAINT "FK_15c5be7038229684679d68a6a15" FOREIGN KEY ("message_id") REFERENCES "dm_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_photos"
            ADD CONSTRAINT "FK_b87610cba94a7cfdf19aa905603" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages"
            ADD CONSTRAINT "FK_8f76ffdc587d479477dd3bd0d0b" FOREIGN KEY ("conversation_id") REFERENCES "dm_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages"
            ADD CONSTRAINT "FK_7e560db5b73e7279b2f81f8012b" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages"
            ADD CONSTRAINT "FK_6977f1d1b3724812a0981a56a99" FOREIGN KEY ("photo_id") REFERENCES "dm_photos"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages"
            ADD CONSTRAINT "FK_7bb4c34c7263f099bd857bd7a87" FOREIGN KEY ("reply_post_id") REFERENCES "social_posts"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_conversations"
            ADD CONSTRAINT "FK_474f6f9b0fba5678bdd50353100" FOREIGN KEY ("user_low") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_conversations"
            ADD CONSTRAINT "FK_78673aa439e0a6e95268460cdcc" FOREIGN KEY ("user_high") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_conversations"
            ADD CONSTRAINT "FK_aacfadeec6165182891b05ffda7" FOREIGN KEY ("last_message_id") REFERENCES "dm_messages"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_reads"
            ADD CONSTRAINT "FK_605f06866631aebdbb9220734a9" FOREIGN KEY ("conversation_id") REFERENCES "dm_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_reads"
            ADD CONSTRAINT "FK_2127cf9393b5a32584760e369a0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "workout_days"
            ADD CONSTRAINT "FK_33c33cdc37139fe8691bb1bac70" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "exercises"
            ADD CONSTRAINT "FK_0aa23eeae74ff072b5916aff9ba" FOREIGN KEY ("day_id") REFERENCES "workout_days"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_completions"
            ADD CONSTRAINT "FK_e7d3448a111825db29bbea4cbcf" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_completions"
            ADD CONSTRAINT "FK_632c339b3c21bc45ef7420d7b03" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_sets"
            ADD CONSTRAINT "FK_4a55381605cbd66540d782388e7" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_sets"
            ADD CONSTRAINT "FK_f2ff55c35b3b8b994b4c14ae7aa" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "food_entries"
            ADD CONSTRAINT "FK_15c73ca44d32c87f529bc60b79f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_days"
            ADD CONSTRAINT "FK_e088d8920b75f990f4f642ed739" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_meals"
            ADD CONSTRAINT "FK_7419493715532800750474faf70" FOREIGN KEY ("day_id") REFERENCES "meal_plan_days"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_logs"
            ADD CONSTRAINT "FK_adb226d72e273cda3b02a80dcaa" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_logs"
            ADD CONSTRAINT "FK_6f778cbda281c94f88cc66d4af2" FOREIGN KEY ("meal_id") REFERENCES "meal_plan_meals"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_logs"
            ADD CONSTRAINT "FK_344e3124923f80f2e4a2e185166" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_marks"
            ADD CONSTRAINT "FK_c75921581862e4efdd92cb7968d" FOREIGN KEY ("meal_id") REFERENCES "meal_plan_meals"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_marks"
            ADD CONSTRAINT "FK_af855211e70c02e1d9045709ba6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_mark_items"
            ADD CONSTRAINT "FK_26918ace9cee4310f4eab5892cc" FOREIGN KEY ("mark_id") REFERENCES "meal_marks"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_mark_items"
            ADD CONSTRAINT "FK_47908850783819c472f40694a2d" FOREIGN KEY ("meal_id") REFERENCES "meal_plan_meals"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_mark_items"
            ADD CONSTRAINT "FK_21b53f18dc34ec733d9840ce932" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_items"
            ADD CONSTRAINT "FK_8bd47bacc8519e7db3204f5f6a6" FOREIGN KEY ("meal_id") REFERENCES "meal_plan_meals"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_items"
            ADD CONSTRAINT "FK_4617f74450b2fea66290b4cfa01" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "nutrition_targets"
            ADD CONSTRAINT "FK_0bfc12486cf0c2fb4d5b32c7936" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD CONSTRAINT "FK_981628d272eb7be19041aea76e4" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_blocks"
            ADD CONSTRAINT "FK_713590a68cb89fa87ff02b32d8d" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_blocks"
            ADD CONSTRAINT "FK_48364f256e6bc2d8da749837300" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_comments"
            ADD CONSTRAINT "FK_96a8f1d2934e7acc55943e516f2" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_friendships"
            ADD CONSTRAINT "FK_404041890490319ef16f4ede02c" FOREIGN KEY ("user_low") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_friendships"
            ADD CONSTRAINT "FK_3d00cb7af20e651863341be4313" FOREIGN KEY ("user_high") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_friendships"
            ADD CONSTRAINT "FK_c16c7aa79aad50ac210967032c4" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_notifications"
            ADD CONSTRAINT "FK_1694d3362bb106904539ce50385" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_reactions"
            ADD CONSTRAINT "FK_1651dfc7d0045ee4d1fe59ca150" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "social_reports"
            ADD CONSTRAINT "FK_fe798842a28f5ee261eca6aa213" FOREIGN KEY ("resolved_by") REFERENCES "admins"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "weight_logs"
            ADD CONSTRAINT "FK_0341010b3956b50d880f4fe15bc" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    // Hand-written: "PG only" GIN trigram indexes the schema diff ignores
    // (declared with synchronize: false on the entities).
    await queryRunner.query(`
            CREATE INDEX "foods_name_key_trgm" ON "foods" USING GIN ("name_key" gin_trgm_ops)
        `);
    await queryRunner.query(`
            CREATE INDEX "chat_messages_body_search_trgm" ON "chat_messages"
            USING GIN ((immutable_unaccent(lower("body"))) gin_trgm_ops)
            WHERE "deleted_at" IS NULL AND "sticker_ref" IS NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."chat_messages_body_search_trgm"`,
    );
    await queryRunner.query(`DROP INDEX "public"."foods_name_key_trgm"`);
    await queryRunner.query(`
            ALTER TABLE "weight_logs" DROP CONSTRAINT "FK_0341010b3956b50d880f4fe15bc"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_reports" DROP CONSTRAINT "FK_fe798842a28f5ee261eca6aa213"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_reactions" DROP CONSTRAINT "FK_1651dfc7d0045ee4d1fe59ca150"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_notifications" DROP CONSTRAINT "FK_1694d3362bb106904539ce50385"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_friendships" DROP CONSTRAINT "FK_c16c7aa79aad50ac210967032c4"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_friendships" DROP CONSTRAINT "FK_3d00cb7af20e651863341be4313"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_friendships" DROP CONSTRAINT "FK_404041890490319ef16f4ede02c"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_comments" DROP CONSTRAINT "FK_96a8f1d2934e7acc55943e516f2"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_blocks" DROP CONSTRAINT "FK_48364f256e6bc2d8da749837300"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_blocks" DROP CONSTRAINT "FK_713590a68cb89fa87ff02b32d8d"
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP CONSTRAINT "FK_981628d272eb7be19041aea76e4"
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19"
        `);
    await queryRunner.query(`
            ALTER TABLE "nutrition_targets" DROP CONSTRAINT "FK_0bfc12486cf0c2fb4d5b32c7936"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_items" DROP CONSTRAINT "FK_4617f74450b2fea66290b4cfa01"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_items" DROP CONSTRAINT "FK_8bd47bacc8519e7db3204f5f6a6"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_mark_items" DROP CONSTRAINT "FK_21b53f18dc34ec733d9840ce932"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_mark_items" DROP CONSTRAINT "FK_47908850783819c472f40694a2d"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_mark_items" DROP CONSTRAINT "FK_26918ace9cee4310f4eab5892cc"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_marks" DROP CONSTRAINT "FK_af855211e70c02e1d9045709ba6"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_marks" DROP CONSTRAINT "FK_c75921581862e4efdd92cb7968d"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_logs" DROP CONSTRAINT "FK_344e3124923f80f2e4a2e185166"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_logs" DROP CONSTRAINT "FK_6f778cbda281c94f88cc66d4af2"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_logs" DROP CONSTRAINT "FK_adb226d72e273cda3b02a80dcaa"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_meals" DROP CONSTRAINT "FK_7419493715532800750474faf70"
        `);
    await queryRunner.query(`
            ALTER TABLE "meal_plan_days" DROP CONSTRAINT "FK_e088d8920b75f990f4f642ed739"
        `);
    await queryRunner.query(`
            ALTER TABLE "food_entries" DROP CONSTRAINT "FK_15c73ca44d32c87f529bc60b79f"
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_sets" DROP CONSTRAINT "FK_f2ff55c35b3b8b994b4c14ae7aa"
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_sets" DROP CONSTRAINT "FK_4a55381605cbd66540d782388e7"
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_completions" DROP CONSTRAINT "FK_632c339b3c21bc45ef7420d7b03"
        `);
    await queryRunner.query(`
            ALTER TABLE "exercise_completions" DROP CONSTRAINT "FK_e7d3448a111825db29bbea4cbcf"
        `);
    await queryRunner.query(`
            ALTER TABLE "exercises" DROP CONSTRAINT "FK_0aa23eeae74ff072b5916aff9ba"
        `);
    await queryRunner.query(`
            ALTER TABLE "workout_days" DROP CONSTRAINT "FK_33c33cdc37139fe8691bb1bac70"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_reads" DROP CONSTRAINT "FK_2127cf9393b5a32584760e369a0"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_reads" DROP CONSTRAINT "FK_605f06866631aebdbb9220734a9"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_conversations" DROP CONSTRAINT "FK_aacfadeec6165182891b05ffda7"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_conversations" DROP CONSTRAINT "FK_78673aa439e0a6e95268460cdcc"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_conversations" DROP CONSTRAINT "FK_474f6f9b0fba5678bdd50353100"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages" DROP CONSTRAINT "FK_7bb4c34c7263f099bd857bd7a87"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages" DROP CONSTRAINT "FK_6977f1d1b3724812a0981a56a99"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages" DROP CONSTRAINT "FK_7e560db5b73e7279b2f81f8012b"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_messages" DROP CONSTRAINT "FK_8f76ffdc587d479477dd3bd0d0b"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_photos" DROP CONSTRAINT "FK_b87610cba94a7cfdf19aa905603"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_photos" DROP CONSTRAINT "FK_15c5be7038229684679d68a6a15"
        `);
    await queryRunner.query(`
            ALTER TABLE "dm_photos" DROP CONSTRAINT "FK_b50cc250af4c4dee8ccb742ab0d"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_reads" DROP CONSTRAINT "FK_08b16e42219a64ea4580021acc3"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_reactions" DROP CONSTRAINT "FK_b3409942f1ea185576f1adce065"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_nicknames" DROP CONSTRAINT "FK_81b116608de66734860b4dcd2ef"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_message_edits" DROP CONSTRAINT "FK_e31ab58312f60d1347efaba1162"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_hidden_conversations" DROP CONSTRAINT "FK_8b101247a37f7fb8df22381710a"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_hidden_conversations" DROP CONSTRAINT "FK_931ab3aa73a97af0594d16912db"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_color_overrides" DROP CONSTRAINT "FK_ae14fa35136605c6cc70256d89a"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_color_overrides" DROP CONSTRAINT "FK_9273aaf282e331804a38af145b1"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_conversations" DROP CONSTRAINT "FK_62f2a55e7ad59ec2830ad3a29fd"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_conversations" DROP CONSTRAINT "FK_7f9e5689ad3d7f45172fc156fbf"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_20b09f2c2e3668dcdede58b9a0d"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_35037bafe2cad5183bdb922158e"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_686a3bfebb7545534342c5fa272"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_4d0fa92ec6ab0484fe00e5da1a1"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_577e79bdb0292d4ce02136d3d1a"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_3d623662d4ee1219b23cf61e649"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_posts" DROP CONSTRAINT "FK_c2f4eb885e6e04039c887dc7223"
        `);
    await queryRunner.query(`
            ALTER TABLE "social_post_photos" DROP CONSTRAINT "FK_ee0dd655ef2b674035e242f49ed"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_photos" DROP CONSTRAINT "FK_7eb3699a19274f3fddcc68f7862"
        `);
    await queryRunner.query(`
            ALTER TABLE "chat_photos" DROP CONSTRAINT "FK_aba09a15ddf26b7f1c2464fa396"
        `);
    await queryRunner.query(`
            ALTER TABLE "body_profiles" DROP CONSTRAINT "FK_5a44864f020c4a4c60fb42150d8"
        `);
    await queryRunner.query(`
            ALTER TABLE "admin_hidden_users" DROP CONSTRAINT "FK_1979e292aed680ccb4bee129914"
        `);
    await queryRunner.query(`
            ALTER TABLE "admin_hidden_users" DROP CONSTRAINT "FK_99fe68699167c8f7b359f6cea56"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "FK_a665bb247c45873f606623b6599"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "FK_0c8c04a03a3791beab07000cf9a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."weight_logs_user_date"
        `);
    await queryRunner.query(`
            DROP TABLE "weight_logs"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_reports_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_reports_resolved_by_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "social_reports"
        `);
    await queryRunner.query(`
            DROP TABLE "social_reactions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_notifications_recipient"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_notifications_post_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "social_notifications"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_friendships_high"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_friendships_requested_by_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "social_friendships"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_comments_post"
        `);
    await queryRunner.query(`
            DROP TABLE "social_comments"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_blocks_blocked"
        `);
    await queryRunner.query(`
            DROP TABLE "social_blocks"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."sessions_user_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."sessions_admin_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."sessions_expires_at_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "sessions"
        `);
    await queryRunner.query(`
            DROP TABLE "rate_limits"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."push_subscriptions_owner_key"
        `);
    await queryRunner.query(`
            DROP TABLE "push_subscriptions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."nutrition_targets_user_from"
        `);
    await queryRunner.query(`
            DROP TABLE "nutrition_targets"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_plan_items_meal"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_plan_items_food_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "meal_plan_items"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_mark_items_meal"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_mark_items_mark_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_mark_items_food_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "meal_mark_items"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_marks_user_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "meal_marks"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_logs_meal"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_logs_user"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_logs_food_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "meal_logs"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_plan_meals_day"
        `);
    await queryRunner.query(`
            DROP TABLE "meal_plan_meals"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."meal_plan_days_user_date"
        `);
    await queryRunner.query(`
            DROP TABLE "meal_plan_days"
        `);
    await queryRunner.query(`
            DROP TABLE "login_attempts"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."foods_active_name_key"
        `);
    await queryRunner.query(`
            DROP TABLE "foods"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."food_entries_user_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "food_entries"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."exercise_sets_exercise_position"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."exercise_sets_user"
        `);
    await queryRunner.query(`
            DROP TABLE "exercise_sets"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."exercise_completions_user_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "exercise_completions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."exercises_day_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "exercises"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."workout_days_user_date"
        `);
    await queryRunner.query(`
            DROP TABLE "workout_days"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_reads_user_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "dm_reads"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_conversations_pair"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_conversations_high"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_conversations_last_message_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "dm_conversations"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_messages_conversation_client"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_messages_conversation_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_messages_sender_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_messages_photo_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_messages_reply_post_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "dm_messages"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_photos_message"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_photos_conversation"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."dm_photos_uploader_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "dm_photos"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."contact_aliases_owner_key"
        `);
    await queryRunner.query(`
            DROP TABLE "contact_aliases"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_reads"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_reactions"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_nicknames"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_message_edits_message_id"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_message_edits"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_hidden_conversations_conversation_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_hidden_conversations"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_custom_stickers_owner"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_custom_stickers"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_color_overrides_admin_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_color_overrides"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_conversations_last_message_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_conversations_last_message_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_conversations"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_messages_conversation_client"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_messages_conversation_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_messages_sender_admin_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_messages_hidden_by_admin_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_messages_reply_to_message_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_messages_photo_id_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_messages_reply_post_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_messages"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_posts_author"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_posts_photo_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "social_posts"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."social_post_photos_post"
        `);
    await queryRunner.query(`
            DROP TABLE "social_post_photos"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_photos_message"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chat_photos_conversation"
        `);
    await queryRunner.query(`
            DROP TABLE "chat_photos"
        `);
    await queryRunner.query(`
            DROP TABLE "body_profiles"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."admin_hidden_users_user_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "admin_hidden_users"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."users_pt_admin"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."users_chat_enabled_by_admin_id_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP TABLE "admins"
        `);
    // The extensions stay installed: other objects may rely on them.
    await queryRunner.query(`DROP FUNCTION "immutable_unaccent"(text)`);
  }
}
