import "server-only";

import { eq, inArray, or } from "drizzle-orm";

import type { db } from "@/db";
import {
  socialComments,
  socialNotifications,
  socialReactions,
} from "@/db/schema";

type Executor = Pick<typeof db, "delete">;

// Everything that hangs off posts: reactions, comments and notifications.
// Call when posts are deleted (inside the same transaction).
export const deleteEngagementOfPosts = async (
  executor: Executor,
  postIds: number[],
) => {
  if (postIds.length === 0) {
    return;
  }
  await executor
    .delete(socialReactions)
    .where(inArray(socialReactions.postId, postIds));
  await executor
    .delete(socialComments)
    .where(inArray(socialComments.postId, postIds));
  await executor
    .delete(socialNotifications)
    .where(inArray(socialNotifications.postId, postIds));
};

// What a deleted account leaves behind on other people's posts: its
// reactions and comments, and notifications it received or caused.
export const deleteEngagementOfAccount = async (
  executor: Executor,
  key: string,
) => {
  await executor
    .delete(socialReactions)
    .where(eq(socialReactions.reactorKey, key));
  await executor
    .delete(socialComments)
    .where(eq(socialComments.authorKey, key));
  await executor
    .delete(socialNotifications)
    .where(
      or(
        eq(socialNotifications.recipientKey, key),
        eq(socialNotifications.actorKey, key),
      ),
    );
};
