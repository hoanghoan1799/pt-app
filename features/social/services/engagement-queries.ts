import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { socialComments, socialReactions } from "@/db/schema";
import {
  DELETED_ACCOUNT_NAME,
  loadAccounts,
} from "@/features/social/services/account-lookup";
import { loadVisiblePost } from "@/features/social/services/post-access";
import type {
  CommentView,
  ReactionSummary,
  ReactorView,
  SocialActor,
} from "@/features/social/types/social";
import {
  canDeleteComment,
  canEditComment,
  parseActorKey,
  summarizeReactions,
} from "@/features/social/utils/engagement-rules";
import {
  actorKey,
  adminProfilePath,
  profilePath,
} from "@/features/social/utils/post-rules";

export interface PostEngagement {
  reactions: ReactionSummary;
  commentCount: number;
}

const EMPTY_SUMMARY: ReactionSummary = { counts: [], total: 0, mine: null };

// Reaction summary and comment count for a page of posts, in two queries.
export const loadEngagement = async (
  postIds: number[],
  viewer: SocialActor,
): Promise<Map<number, PostEngagement>> => {
  const result = new Map<number, PostEngagement>();

  if (postIds.length === 0) {
    return result;
  }
  const [reactionRows, commentRows] = await Promise.all([
    db
      .select({
        postId: socialReactions.postId,
        reactorKey: socialReactions.reactorKey,
        emoji: socialReactions.emoji,
      })
      .from(socialReactions)
      .where(inArray(socialReactions.postId, postIds)),
    db
      .select({
        postId: socialComments.postId,
        count: sql<number>`count(*)`,
      })
      .from(socialComments)
      .where(
        and(
          inArray(socialComments.postId, postIds),
          isNull(socialComments.deletedAt),
        ),
      )
      .groupBy(socialComments.postId),
  ]);
  const myKey = actorKey(viewer);
  const commentCounts = new Map(
    commentRows.map((row) => [row.postId, Number(row.count)]),
  );

  for (const postId of postIds) {
    const rows = reactionRows.filter((row) => row.postId === postId);

    result.set(postId, {
      reactions: rows.length ? summarizeReactions(rows, myKey) : EMPTY_SUMMARY,
      commentCount: commentCounts.get(postId) ?? 0,
    });
  }
  return result;
};

export const emptyEngagement = (): PostEngagement => ({
  reactions: EMPTY_SUMMARY,
  commentCount: 0,
});

// Who reacted with what; only for a post the actor can see.
export const listReactors = async (
  actor: SocialActor,
  postId: number,
): Promise<ReactorView[] | null> => {
  if (!(await loadVisiblePost(actor, postId))) {
    return null;
  }
  const rows = await db
    .select()
    .from(socialReactions)
    .where(eq(socialReactions.postId, postId))
    .orderBy(asc(socialReactions.createdAt));
  const accounts = await loadAccounts(rows.map((row) => row.reactorKey));
  const myKey = actorKey(actor);

  return rows.map((row) => ({
    name: accounts.get(row.reactorKey)?.name ?? DELETED_ACCOUNT_NAME,
    emoji: row.emoji,
    isMe: row.reactorKey === myKey,
  }));
};

// Oldest first; only for a post the actor can see.
export const listComments = async (
  actor: SocialActor,
  postId: number,
  mode: "user" | "admin",
): Promise<CommentView[] | null> => {
  const post = await loadVisiblePost(actor, postId);

  if (!post) {
    return null;
  }
  const rows = await db
    .select()
    .from(socialComments)
    .where(
      and(eq(socialComments.postId, postId), isNull(socialComments.deletedAt)),
    )
    .orderBy(asc(socialComments.createdAt), asc(socialComments.id));
  const accounts = await loadAccounts(rows.map((row) => row.authorKey));
  const postRef = { kind: post.authorKind, id: post.authorId };
  const toPath = mode === "admin" ? adminProfilePath : profilePath;

  return rows.map((row) => {
    const account = accounts.get(row.authorKey);
    const ref = parseActorKey(row.authorKey);

    return {
      id: row.id,
      authorName: account?.name ?? DELETED_ACCOUNT_NAME,
      authorAvatarUrl: account?.avatarUrl ?? null,
      authorVerified: account?.verified ?? false,
      authorHref: ref && account ? toPath(ref.kind, ref.id) : "",
      body: row.body,
      createdAt: row.createdAt.getTime(),
      edited: row.updatedAt !== null,
      canEdit: canEditComment(actor, row.authorKey),
      canDelete: canDeleteComment(actor, row, postRef),
    };
  });
};
