import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminHiddenUser } from "../src/database/entities/admin-hidden-user.entity.js";
import { BodyProfile } from "../src/database/entities/body-profile.entity.js";
import { ChatColorOverride } from "../src/database/entities/chat-color-override.entity.js";
import { ChatConversation } from "../src/database/entities/chat-conversation.entity.js";
import { ChatCustomSticker } from "../src/database/entities/chat-custom-sticker.entity.js";
import { ChatHiddenConversation } from "../src/database/entities/chat-hidden-conversation.entity.js";
import { ChatMessage } from "../src/database/entities/chat-message.entity.js";
import { ChatMessageEdit } from "../src/database/entities/chat-message-edit.entity.js";
import { ChatNickname } from "../src/database/entities/chat-nickname.entity.js";
import { ChatPhoto } from "../src/database/entities/chat-photo.entity.js";
import { ChatReaction } from "../src/database/entities/chat-reaction.entity.js";
import { ChatRead } from "../src/database/entities/chat-read.entity.js";
import { ContactAlias } from "../src/database/entities/contact-alias.entity.js";
import { DmConversation } from "../src/database/entities/dm-conversation.entity.js";
import { DmMessage } from "../src/database/entities/dm-message.entity.js";
import { DmPhoto } from "../src/database/entities/dm-photo.entity.js";
import { DmRead } from "../src/database/entities/dm-read.entity.js";
import { Exercise } from "../src/database/entities/exercise.entity.js";
import { ExerciseCompletion } from "../src/database/entities/exercise-completion.entity.js";
import { ExerciseSet } from "../src/database/entities/exercise-set.entity.js";
import { Food } from "../src/database/entities/food.entity.js";
import { FoodEntry } from "../src/database/entities/food-entry.entity.js";
import { MealLog } from "../src/database/entities/meal-log.entity.js";
import { MealMark } from "../src/database/entities/meal-mark.entity.js";
import { MealMarkItem } from "../src/database/entities/meal-mark-item.entity.js";
import { MealPlanDay } from "../src/database/entities/meal-plan-day.entity.js";
import { MealPlanItem } from "../src/database/entities/meal-plan-item.entity.js";
import { MealPlanMeal } from "../src/database/entities/meal-plan-meal.entity.js";
import { NutritionTarget } from "../src/database/entities/nutrition-target.entity.js";
import { PushSubscription } from "../src/database/entities/push-subscription.entity.js";
import { SocialBlock } from "../src/database/entities/social-block.entity.js";
import { SocialComment } from "../src/database/entities/social-comment.entity.js";
import { SocialFriendship } from "../src/database/entities/social-friendship.entity.js";
import { SocialNotification } from "../src/database/entities/social-notification.entity.js";
import { SocialPost } from "../src/database/entities/social-post.entity.js";
import { SocialPostPhoto } from "../src/database/entities/social-post-photo.entity.js";
import { SocialReaction } from "../src/database/entities/social-reaction.entity.js";
import { SocialReport } from "../src/database/entities/social-report.entity.js";
import { UserAvatar } from "../src/database/entities/user-avatar.entity.js";
import { WeightLog } from "../src/database/entities/weight-log.entity.js";
import { WorkoutDay } from "../src/database/entities/workout-day.entity.js";
import { createTestApp } from "./support/app.js";
import { bearer, seedAdmin, seedUser, tokenOf } from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { countAllTables, diffCounts, insertRow } from "./support/rows.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  app = await createTestApp({ databaseUrl: db.url, nodeEnv: "test" });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

type Cast = {
  userId: number;
  // Another trainee that survives, and a PT.
  otherId: number;
  adminId: number;
  foodId: number;
};

// One row in every table that hangs off a trainee, in every way it can: by
// foreign key (cascade) and by text key (cleaned by the service).
const seedGraph = async ({ userId, otherId, adminId, foodId }: Cast) => {
  const key = `user:${userId}`;
  const otherKey = `user:${otherId}`;
  const now = new Date();

  await insertRow(ds, AdminHiddenUser, { adminId, userId });
  await insertRow(ds, UserAvatar, {
    userId,
    mime: "image/png",
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    size: 8,
    updatedAt: now,
  });
  // Chat
  const conversationId = await insertRow(ds, ChatConversation, { userId });
  const messageId = await insertRow(ds, ChatMessage, {
    conversationId,
    senderRole: "user",
    createdAt: now,
  });
  await insertRow(ds, ChatReaction, { messageId, reactorKey: key });
  await insertRow(ds, ChatMessageEdit, { messageId });
  await insertRow(ds, ChatRead, { conversationId, readerKey: key });
  await insertRow(ds, ChatColorOverride, { conversationId, adminId });
  await insertRow(ds, ChatNickname, {
    conversationId,
    targetKey: "pt",
    setByKey: "user",
  });
  await insertRow(ds, ChatPhoto, {
    conversationId,
    uploaderKey: key,
    mime: "image/png",
  });
  await insertRow(ds, ChatHiddenConversation, { adminId, conversationId });
  await insertRow(ds, ChatCustomSticker, {
    ownerKind: "user",
    ownerId: userId,
    mime: "image/png",
  });
  // Text-keyed rows
  await insertRow(ds, ContactAlias, {
    ownerKey: key,
    targetKey: "pt",
    alias: "Coach",
  });
  await insertRow(ds, ContactAlias, {
    ownerKey: `admin:${adminId}`,
    targetKey: key,
    alias: "Student",
  });
  await insertRow(ds, PushSubscription, { ownerKey: key });
  // Workouts
  const dayId = await insertRow(ds, WorkoutDay, { userId });
  const exerciseId = await insertRow(ds, Exercise, { dayId });
  await insertRow(ds, ExerciseSet, { exerciseId, userId });
  await insertRow(ds, ExerciseCompletion, { exerciseId, userId });
  // Nutrition
  await insertRow(ds, FoodEntry, { userId, meal: "breakfast" });
  await insertRow(ds, NutritionTarget, { userId });
  await insertRow(ds, BodyProfile, {
    userId,
    sex: "male",
    activityLevel: "light",
    goal: "cut",
  });
  await insertRow(ds, WeightLog, { userId });
  const planDayId = await insertRow(ds, MealPlanDay, { userId });
  const mealId = await insertRow(ds, MealPlanMeal, { dayId: planDayId });
  await insertRow(ds, MealPlanItem, { mealId, foodId });
  await insertRow(ds, MealLog, { userId, mealId, foodId });
  const markId = await insertRow(ds, MealMark, { mealId, userId });
  await insertRow(ds, MealMarkItem, { markId, mealId, foodId });
  // Direct messages and friends with the other trainee
  const [low, high] = userId < otherId ? [userId, otherId] : [otherId, userId];
  const dmId = await insertRow(ds, DmConversation, {
    userLow: low,
    userHigh: high,
  });
  const dmMessageId = await insertRow(ds, DmMessage, {
    conversationId: dmId,
    senderId: userId,
  });
  await insertRow(ds, DmPhoto, {
    conversationId: dmId,
    uploaderId: userId,
    mime: "image/png",
  });
  await insertRow(ds, DmRead, { conversationId: dmId, userId });
  await insertRow(ds, SocialFriendship, {
    userLow: low,
    userHigh: high,
    status: "accepted",
    requestedBy: userId,
  });
  await insertRow(ds, SocialBlock, { blockerId: userId, blockedId: otherId });
  // Social content: own post with a photo, a reaction, a comment and a
  // notification from the other trainee; a post of the other trainee with this
  // trainee's reaction, comment and notifications; a pending upload; a report.
  const postId = await insertRow(ds, SocialPost, {
    authorKind: "user",
    authorId: userId,
    privacy: "everyone",
  });
  await insertRow(ds, SocialPostPhoto, {
    uploaderKey: key,
    postId,
    mime: "image/png",
  });
  await insertRow(ds, SocialPostPhoto, { uploaderKey: key, mime: "image/png" });
  await insertRow(ds, SocialReaction, { postId, reactorKey: otherKey });
  const ownPostCommentId = await insertRow(ds, SocialComment, {
    postId,
    authorKey: otherKey,
  });
  await insertRow(ds, SocialNotification, {
    recipientKey: key,
    actorKey: otherKey,
    kind: "post_reaction",
    postId,
  });
  const otherPostId = await insertRow(ds, SocialPost, {
    authorKind: "user",
    authorId: otherId,
    privacy: "everyone",
  });
  await insertRow(ds, SocialReaction, { postId: otherPostId, reactorKey: key });
  const commentId = await insertRow(ds, SocialComment, {
    postId: otherPostId,
    authorKey: key,
  });
  await insertRow(ds, SocialNotification, {
    recipientKey: otherKey,
    actorKey: key,
    kind: "post_comment",
    postId: otherPostId,
  });
  await insertRow(ds, SocialReport, {
    reporterKey: key,
    targetKind: "post",
    targetId: otherPostId,
    status: "open",
  });
  await insertRow(ds, SocialReport, {
    reporterKey: otherKey,
    targetKind: "user",
    targetId: userId,
    status: "open",
  });
  await insertRow(ds, SocialReport, {
    reporterKey: otherKey,
    targetKind: "post",
    targetId: postId,
    status: "open",
  });
  await insertRow(ds, SocialReport, {
    reporterKey: otherKey,
    targetKind: "comment",
    targetId: commentId,
    status: "open",
  });
  await insertRow(ds, SocialReport, {
    reporterKey: otherKey,
    targetKind: "comment",
    targetId: ownPostCommentId,
    status: "open",
  });
  void dmMessageId;
};

describe("DELETE /v1/trainees/:userId removes exactly the trainee's data", () => {
  it("deletes every dependent row of the trainee and nothing else", async () => {
    const pt = await seedAdmin(ds, { role: "pt" });
    const superAdmin = await seedAdmin(ds, { role: "super_admin" });
    const gone = await seedUser(ds, { ptAdminId: pt.id });
    const kept = await seedUser(ds, { ptAdminId: pt.id });
    const other = await seedUser(ds, { ptAdminId: pt.id });
    const foodId = await insertRow(ds, Food, {
      group: "meat",
      kcal: 100,
      protein: 1,
      carbs: 1,
      fat: 1,
    });

    // The kept trainee has the same graph, tied to the same "other" trainee.
    await seedGraph({
      userId: kept.id,
      otherId: other.id,
      adminId: superAdmin.id,
      foodId,
    });
    // The trainee signs in: a session row.
    await tokenOf(app, { kind: "user", ...gone });
    const token = await tokenOf(app, { kind: "admin", ...superAdmin });
    const before = await countAllTables(ds);

    await seedGraph({
      userId: gone.id,
      otherId: other.id,
      adminId: superAdmin.id,
      foodId,
    });
    const withGone = await countAllTables(ds);
    const added = diffCounts(withGone, before);

    // Every table below got at least one row for the trainee, so the test really
    // exercises it (the full list is checked, not just a sample).
    expect(Object.keys(added).sort()).toEqual(
      [
        "admin_hidden_users",
        "body_profiles",
        "chat_color_overrides",
        "chat_conversations",
        "chat_custom_stickers",
        "chat_hidden_conversations",
        "chat_message_edits",
        "chat_messages",
        "chat_nicknames",
        "chat_photos",
        "chat_reactions",
        "chat_reads",
        "contact_aliases",
        "dm_conversations",
        "dm_messages",
        "dm_photos",
        "dm_reads",
        "exercise_completions",
        "exercise_sets",
        "exercises",
        "food_entries",
        "meal_logs",
        "meal_mark_items",
        "meal_marks",
        "meal_plan_days",
        "meal_plan_items",
        "meal_plan_meals",
        "nutrition_targets",
        "push_subscriptions",
        "social_blocks",
        "social_comments",
        "social_friendships",
        "social_notifications",
        "social_post_photos",
        "social_posts",
        "social_reactions",
        "social_reports",
        "user_avatars",
        "weight_logs",
        "workout_days",
      ].sort(),
    );
    expect(added.contact_aliases).toBe(2);
    expect(added.social_post_photos).toBe(2);
    expect(added.social_reports).toBe(5);

    const response = await request(app.getHttpServer())
      .delete(`/v1/trainees/${gone.id}`)
      .set(bearer(token));

    expect(response.status).toBe(204);

    const after = await countAllTables(ds);

    // Back to the snapshot taken before the trainee's data existed, except the
    // trainee row itself, their login session, and the one post the seeding
    // gave to the surviving trainee (their own content is not touched).
    expect(diffCounts(after, before)).toEqual({
      users: -1,
      sessions: -1,
      social_posts: 1,
    });
    // The kept trainee's own rows are all still there.
    expect(after.chat_conversations).toBe(before.chat_conversations);
    expect(after.contact_aliases).toBe(2);
    expect(after.social_reports).toBe(5);
  });

  it("deletes a trainee who has nothing but an account", async () => {
    const admin = await seedAdmin(ds, { role: "super_admin" });
    const lonely = await seedUser(ds);
    const token = await tokenOf(app, { kind: "admin", ...admin });
    const before = await countAllTables(ds);
    const response = await request(app.getHttpServer())
      .delete(`/v1/trainees/${lonely.id}`)
      .set(bearer(token));

    expect(response.status).toBe(204);
    expect(diffCounts(await countAllTables(ds), before)).toEqual({ users: -1 });
  });
});
