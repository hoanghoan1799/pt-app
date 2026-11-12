import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { socialComments, socialPosts, socialReactions } from "@/db/schema";
import { loadVisiblePost } from "@/features/social/services/post-access";
import {
  createNotification,
  removeReactionNotification,
  upsertReactionNotification,
} from "@/features/social/services/social-notifications";
import type { SocialActor } from "@/features/social/types/social";
import {
  canDeleteComment,
  canEditComment,
} from "@/features/social/utils/engagement-rules";
import { actorKey } from "@/features/social/utils/post-rules";

export type EngagementError = "not_found" | "forbidden";

type Outcome<T = object> =
  ({ ok: true } & T) | { ok: false; error: EngagementError };

const failure = (error: EngagementError) => ({ ok: false as const, error });

// Set, change (same call) or remove (emoji null) my one reaction to a post.
// `notificationId` is the row to push for, null when nobody is notified
// (removal, or a reaction to my own post).
export const reactToPost = async (
  actor: SocialActor,
  postId: number,
  emoji: string | null,
  now = new Date(),
): Promise<Outcome<{ notificationId: number | null }>> => {
  const post = await loadVisiblePost(actor, postId);

  if (!post) {
    return failure("not_found");
  }
  const reactorKey = actorKey(actor);
  const recipientKey = `${post.authorKind}:${post.authorId}`;
  const notification = { recipientKey, actorKey: reactorKey, postId };

  if (emoji === null) {
    await db
      .delete(socialReactions)
      .where(
        and(
          eq(socialReactions.postId, postId),
          eq(socialReactions.reactorKey, reactorKey),
        ),
      );
    await removeReactionNotification(notification);
    return { ok: true, notificationId: null };
  }
  await db
    .insert(socialReactions)
    .values({ postId, reactorKey, emoji, createdAt: now })
    .onConflictDoUpdate({
      target: [socialReactions.postId, socialReactions.reactorKey],
      set: { emoji },
    });
  if (recipientKey === reactorKey) {
    return { ok: true, notificationId: null };
  }
  return {
    ok: true,
    notificationId: await upsertReactionNotification(notification, now),
  };
};

export const addComment = async (
  actor: SocialActor,
  postId: number,
  body: string,
  now = new Date(),
): Promise<Outcome<{ commentId: number; notificationId: number | null }>> => {
  const post = await loadVisiblePost(actor, postId);

  if (!post) {
    return failure("not_found");
  }
  const authorKey = actorKey(actor);
  const [comment] = await db
    .insert(socialComments)
    .values({ postId, authorKey, body: body.trim(), createdAt: now })
    .returning({ id: socialComments.id });
  const recipientKey = `${post.authorKind}:${post.authorId}`;
  const notificationId =
    recipientKey === authorKey
      ? null
      : await createNotification({
          recipientKey,
          kind: "post_comment",
          actorKey: authorKey,
          postId,
          now,
        });

  return { ok: true, commentId: comment.id, notificationId };
};

const findLiveComment = async (commentId: number) => {
  const [comment] = await db
    .select()
    .from(socialComments)
    .where(
      and(eq(socialComments.id, commentId), isNull(socialComments.deletedAt)),
    )
    .limit(1);

  return comment ?? null;
};

export const editComment = async (
  actor: SocialActor,
  commentId: number,
  body: string,
  now = new Date(),
): Promise<Outcome> => {
  const comment = await findLiveComment(commentId);

  // The post must still be visible to the editor.
  if (!comment || !(await loadVisiblePost(actor, comment.postId))) {
    return failure("not_found");
  }
  if (!canEditComment(actor, comment.authorKey)) {
    return failure("forbidden");
  }
  await db
    .update(socialComments)
    .set({ body: body.trim(), updatedAt: now })
    .where(eq(socialComments.id, comment.id));
  return { ok: true };
};

// The commenter, the post's author and a super admin may delete. The text is
// emptied, the row stays as a tombstone.
export const deleteComment = async (
  actor: SocialActor,
  commentId: number,
  now = new Date(),
): Promise<Outcome> => {
  const comment = await findLiveComment(commentId);

  if (!comment) {
    return failure("not_found");
  }
  const [post] = await db
    .select({ kind: socialPosts.authorKind, id: socialPosts.authorId })
    .from(socialPosts)
    .where(eq(socialPosts.id, comment.postId))
    .limit(1);

  if (!post) {
    return failure("not_found");
  }
  if (!canDeleteComment(actor, comment, post)) {
    return failure("forbidden");
  }
  await db
    .update(socialComments)
    .set({ deletedAt: now, body: "" })
    .where(eq(socialComments.id, comment.id));
  return { ok: true };
};
