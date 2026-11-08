import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { socialComments, socialPosts, socialReports, users } from "@/db/schema";
import {
  deleteComment,
  type EngagementError,
} from "@/features/social/services/engagement-mutations";
import { loadVisiblePost } from "@/features/social/services/post-access";
import { deletePost } from "@/features/social/services/post-mutations";
import { isBlockedBetween } from "@/features/social/services/relationships";
import type { SocialActor } from "@/features/social/types/social";
import type { ReportTargetKind } from "@/features/social/utils/friend-rules";
import { actorKey } from "@/features/social/utils/post-rules";
import { canAdminAccessUser } from "@/services/hidden-users";

export type ReportError = "not_found" | "forbidden";

type Outcome<T = object> =
  ({ ok: true } & T) | { ok: false; error: ReportError };

const failure = (error: ReportError) => ({ ok: false as const, error });

// Can this actor see (and so report) the target? Never your own content.
const canReport = async (
  actor: SocialActor,
  kind: ReportTargetKind,
  targetId: number,
): Promise<boolean> => {
  const mine = actorKey(actor);

  if (kind === "post") {
    const post = await loadVisiblePost(actor, targetId);

    return Boolean(post) && `${post?.authorKind}:${post?.authorId}` !== mine;
  }
  if (kind === "comment") {
    const [comment] = await db
      .select()
      .from(socialComments)
      .where(
        and(eq(socialComments.id, targetId), isNull(socialComments.deletedAt)),
      )
      .limit(1);

    return (
      Boolean(comment) &&
      comment.authorKey !== mine &&
      Boolean(await loadVisiblePost(actor, comment.postId))
    );
  }
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target || (actor.kind === "user" && actor.id === targetId)) {
    return false;
  }
  if (actor.kind === "user") {
    return !(await isBlockedBetween(actor.id, targetId));
  }
  return canAdminAccessUser(actor.id, targetId);
};

// Files a report; an open report by the same person on the same target is
// kept as it is (no duplicates, no error).
export const createReport = async (
  actor: SocialActor,
  input: { targetKind: ReportTargetKind; targetId: number; reason: string },
  now = new Date(),
): Promise<Outcome> => {
  if (!(await canReport(actor, input.targetKind, input.targetId))) {
    return failure("not_found");
  }
  const reporterKey = actorKey(actor);
  const [existing] = await db
    .select({ id: socialReports.id })
    .from(socialReports)
    .where(
      and(
        eq(socialReports.reporterKey, reporterKey),
        eq(socialReports.targetKind, input.targetKind),
        eq(socialReports.targetId, input.targetId),
        eq(socialReports.status, "open"),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(socialReports).values({
      reporterKey,
      targetKind: input.targetKind,
      targetId: input.targetId,
      reason: input.reason.trim(),
      status: "open",
      createdAt: now,
    });
  }
  return { ok: true };
};

const isMissing = (error: EngagementError | string) => error === "not_found";

// Super admin only (spec A14). "kept" leaves the content alone; "deleted"
// removes the post or comment with the existing mutations (a user target has
// nothing to delete and is just closed as kept). Every open report on the
// same target is closed with it.
export const resolveReport = async (
  actor: SocialActor,
  reportId: number,
  resolution: "kept" | "deleted",
  now = new Date(),
): Promise<Outcome> => {
  if (actor.kind !== "admin" || actor.role !== "super_admin") {
    return failure("forbidden");
  }
  const [report] = await db
    .select()
    .from(socialReports)
    .where(
      and(eq(socialReports.id, reportId), eq(socialReports.status, "open")),
    )
    .limit(1);

  if (!report) {
    return failure("not_found");
  }
  let applied = resolution;

  if (report.targetKind === "user") {
    applied = "kept";
  } else if (resolution === "deleted") {
    // Already gone counts as done.
    const result =
      report.targetKind === "post"
        ? await deletePost(actor, report.targetId, now)
        : await deleteComment(actor, report.targetId, now);

    if (!result.ok && !isMissing(result.error)) {
      return failure("forbidden");
    }
  }
  await db
    .update(socialReports)
    .set({
      status: "resolved",
      resolution: applied,
      resolvedBy: actor.id,
      resolvedAt: now,
    })
    .where(
      and(
        eq(socialReports.targetKind, report.targetKind),
        eq(socialReports.targetId, report.targetId),
        eq(socialReports.status, "open"),
      ),
    );
  return { ok: true };
};

// Member delete: reports filed by the trainee, about the trainee, and about
// the posts and comments that go with the account.
export const deleteReportsOfUser = async (
  executor: Pick<typeof db, "delete" | "select">,
  userId: number,
) => {
  const posts = await executor
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(
      and(eq(socialPosts.authorKind, "user"), eq(socialPosts.authorId, userId)),
    );
  const postIds = posts.map((post) => post.id);
  const comments = await executor
    .select({ id: socialComments.id })
    .from(socialComments)
    .where(
      postIds.length > 0
        ? or(
            eq(socialComments.authorKey, `user:${userId}`),
            inArray(socialComments.postId, postIds),
          )
        : eq(socialComments.authorKey, `user:${userId}`),
    );
  const clauses = [
    eq(socialReports.reporterKey, `user:${userId}`),
    and(
      eq(socialReports.targetKind, "user"),
      eq(socialReports.targetId, userId),
    ),
  ];

  if (posts.length > 0) {
    clauses.push(
      and(
        eq(socialReports.targetKind, "post"),
        inArray(socialReports.targetId, postIds),
      ),
    );
  }
  if (comments.length > 0) {
    clauses.push(
      and(
        eq(socialReports.targetKind, "comment"),
        inArray(
          socialReports.targetId,
          comments.map((comment) => comment.id),
        ),
      ),
    );
  }
  await executor.delete(socialReports).where(or(...clauses));
};
