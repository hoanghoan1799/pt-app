import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import { socialPostPhotos, socialPosts } from "@/db/schema";
import {
  deleteEngagementOfAccount,
  deleteEngagementOfPosts,
} from "@/features/social/services/engagement-cleanup";
import { deleteFriendDataOfUser } from "@/features/social/services/friend-mutations";
import { deleteReportsOfUser } from "@/features/social/services/report-mutations";

type Executor = Pick<typeof db, "delete" | "select">;

// Account deletion removes the trainee's posts, photos, reactions, comments,
// notifications, friendships, blocks and reports by or about them (spec A12).
// Call inside the member delete transaction.
export const deleteSocialContentOfUser = async (
  executor: Executor,
  userId: number,
) => {
  const posts = await executor
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(
      and(eq(socialPosts.authorKind, "user"), eq(socialPosts.authorId, userId)),
    );
  const postIds = posts.map((post) => post.id);

  // Reports first: they look up the trainee's posts and comments.
  await deleteReportsOfUser(executor, userId);
  await deleteFriendDataOfUser(executor, userId);
  await deleteEngagementOfPosts(executor, postIds);
  await deleteEngagementOfAccount(executor, `user:${userId}`);
  if (postIds.length > 0) {
    await executor
      .delete(socialPostPhotos)
      .where(inArray(socialPostPhotos.postId, postIds));
  }
  // Uploads that never became a post.
  await executor
    .delete(socialPostPhotos)
    .where(eq(socialPostPhotos.uploaderKey, `user:${userId}`));
  await executor
    .delete(socialPosts)
    .where(
      and(eq(socialPosts.authorKind, "user"), eq(socialPosts.authorId, userId)),
    );
};
