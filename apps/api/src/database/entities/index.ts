import { Admin } from "./admin.entity.js";
import { AdminAvatar } from "./admin-avatar.entity.js";
import { AdminHiddenUser } from "./admin-hidden-user.entity.js";
import { BodyProfile } from "./body-profile.entity.js";
import { ChatColorOverride } from "./chat-color-override.entity.js";
import { ChatConversation } from "./chat-conversation.entity.js";
import { ChatCustomSticker } from "./chat-custom-sticker.entity.js";
import { ChatHiddenConversation } from "./chat-hidden-conversation.entity.js";
import { ChatMessage } from "./chat-message.entity.js";
import { ChatMessageEdit } from "./chat-message-edit.entity.js";
import { ChatNickname } from "./chat-nickname.entity.js";
import { ChatPhoto } from "./chat-photo.entity.js";
import { ChatReaction } from "./chat-reaction.entity.js";
import { ChatRead } from "./chat-read.entity.js";
import { ContactAlias } from "./contact-alias.entity.js";
import { DmConversation } from "./dm-conversation.entity.js";
import { DmMessage } from "./dm-message.entity.js";
import { DmPhoto } from "./dm-photo.entity.js";
import { DmRead } from "./dm-read.entity.js";
import { Exercise } from "./exercise.entity.js";
import { ExerciseCompletion } from "./exercise-completion.entity.js";
import { ExerciseSet } from "./exercise-set.entity.js";
import { Food } from "./food.entity.js";
import { FoodEntry } from "./food-entry.entity.js";
import { LoginAttempt } from "./login-attempt.entity.js";
import { MealLog } from "./meal-log.entity.js";
import { MealMark } from "./meal-mark.entity.js";
import { MealMarkItem } from "./meal-mark-item.entity.js";
import { MealPlanDay } from "./meal-plan-day.entity.js";
import { MealPlanItem } from "./meal-plan-item.entity.js";
import { MealPlanMeal } from "./meal-plan-meal.entity.js";
import { NutritionTarget } from "./nutrition-target.entity.js";
import { PushSubscription } from "./push-subscription.entity.js";
import { RateLimit } from "./rate-limit.entity.js";
import { Session } from "./session.entity.js";
import { SocialBlock } from "./social-block.entity.js";
import { SocialComment } from "./social-comment.entity.js";
import { SocialFriendship } from "./social-friendship.entity.js";
import { SocialNotification } from "./social-notification.entity.js";
import { SocialPost } from "./social-post.entity.js";
import { SocialPostPhoto } from "./social-post-photo.entity.js";
import { SocialReaction } from "./social-reaction.entity.js";
import { SocialReport } from "./social-report.entity.js";
import { User } from "./user.entity.js";
import { UserAvatar } from "./user-avatar.entity.js";
import { WeightLog } from "./weight-log.entity.js";
import { WorkoutDay } from "./workout-day.entity.js";

// Every entity registered with TypeORM: the app, the CLI data source and the tests share this list.
export const entities = [
  AdminAvatar,
  AdminHiddenUser,
  Admin,
  BodyProfile,
  ChatColorOverride,
  ChatConversation,
  ChatCustomSticker,
  ChatHiddenConversation,
  ChatMessageEdit,
  ChatMessage,
  ChatNickname,
  ChatPhoto,
  ChatReaction,
  ChatRead,
  ContactAlias,
  DmConversation,
  DmMessage,
  DmPhoto,
  DmRead,
  ExerciseCompletion,
  ExerciseSet,
  Exercise,
  FoodEntry,
  Food,
  LoginAttempt,
  MealLog,
  MealMarkItem,
  MealMark,
  MealPlanDay,
  MealPlanItem,
  MealPlanMeal,
  NutritionTarget,
  PushSubscription,
  RateLimit,
  Session,
  SocialBlock,
  SocialComment,
  SocialFriendship,
  SocialNotification,
  SocialPostPhoto,
  SocialPost,
  SocialReaction,
  SocialReport,
  User,
  UserAvatar,
  WeightLog,
  WorkoutDay,
];

export {
  Admin,
  AdminAvatar,
  AdminHiddenUser,
  BodyProfile,
  ChatColorOverride,
  ChatConversation,
  ChatCustomSticker,
  ChatHiddenConversation,
  ChatMessage,
  ChatMessageEdit,
  ChatNickname,
  ChatPhoto,
  ChatReaction,
  ChatRead,
  ContactAlias,
  DmConversation,
  DmMessage,
  DmPhoto,
  DmRead,
  Exercise,
  ExerciseCompletion,
  ExerciseSet,
  Food,
  FoodEntry,
  LoginAttempt,
  MealLog,
  MealMark,
  MealMarkItem,
  MealPlanDay,
  MealPlanItem,
  MealPlanMeal,
  NutritionTarget,
  PushSubscription,
  RateLimit,
  Session,
  SocialBlock,
  SocialComment,
  SocialFriendship,
  SocialNotification,
  SocialPost,
  SocialPostPhoto,
  SocialReaction,
  SocialReport,
  User,
  UserAvatar,
  WeightLog,
  WorkoutDay,
};
