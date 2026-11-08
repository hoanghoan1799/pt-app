import "server-only";

import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { socialComments, socialPosts, socialReports, users } from "@/db/schema";
import {
  DELETED_ACCOUNT_NAME,
  loadAccounts,
} from "@/features/social/services/account-lookup";
import type { ReportView } from "@/features/social/types/social";
import { adminPostPath } from "@/features/social/utils/engagement-rules";
import { adminProfilePath } from "@/features/social/utils/post-rules";

const PREVIEW_LENGTH = 140;

const snippet = (text: string | null, fallback: string) => {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();

  if (flat === "") {
    return fallback;
  }
  return flat.length > PREVIEW_LENGTH
    ? `${flat.slice(0, PREVIEW_LENGTH)}…`
    : flat;
};

export const countOpenReports = async () => {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(socialReports)
    .where(eq(socialReports.status, "open"));

  return Number(row?.count ?? 0);
};

// Open reports, oldest first, each with a preview of what was reported.
export const listOpenReports = async (): Promise<ReportView[]> => {
  const reports = await db
    .select()
    .from(socialReports)
    .where(eq(socialReports.status, "open"))
    .orderBy(asc(socialReports.createdAt), asc(socialReports.id));
  const postIds = reports
    .filter((report) => report.targetKind === "post")
    .map((report) => report.targetId);
  const commentIds = reports
    .filter((report) => report.targetKind === "comment")
    .map((report) => report.targetId);
  const userIds = reports
    .filter((report) => report.targetKind === "user")
    .map((report) => report.targetId);
  const [posts, comments, targetUsers] = await Promise.all([
    postIds.length
      ? db.select().from(socialPosts).where(inArray(socialPosts.id, postIds))
      : [],
    commentIds.length
      ? db
          .select()
          .from(socialComments)
          .where(inArray(socialComments.id, commentIds))
      : [],
    userIds.length
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : [],
  ]);
  const accounts = await loadAccounts([
    ...reports.map((report) => report.reporterKey),
    ...posts.map((post) => `${post.authorKind}:${post.authorId}`),
    ...comments.map((comment) => comment.authorKey),
  ]);
  const nameOf = (key: string) =>
    accounts.get(key)?.name ?? DELETED_ACCOUNT_NAME;
  const postById = new Map(posts.map((post) => [post.id, post]));
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const userById = new Map(targetUsers.map((user) => [user.id, user]));

  return reports.map((report): ReportView => {
    const base = {
      id: report.id,
      targetKind: report.targetKind,
      targetId: report.targetId,
      reporterName: nameOf(report.reporterKey),
      reason: report.reason,
      createdAt: report.createdAt.getTime(),
    };

    if (report.targetKind === "post") {
      const post = postById.get(report.targetId);

      return post && post.deletedAt === null
        ? {
            ...base,
            preview: snippet(post.caption, "(Bài viết chỉ có ảnh)"),
            targetName: nameOf(`${post.authorKind}:${post.authorId}`),
            href: adminPostPath(post.id),
          }
        : { ...base, preview: null, targetName: null, href: null };
    }
    if (report.targetKind === "comment") {
      const comment = commentById.get(report.targetId);

      if (!comment || comment.deletedAt !== null) {
        return { ...base, preview: null, targetName: null, href: null };
      }
      return {
        ...base,
        preview: snippet(comment.body, ""),
        targetName: nameOf(comment.authorKey),
        href: adminPostPath(comment.postId),
      };
    }
    const target = userById.get(report.targetId);

    return target
      ? {
          ...base,
          preview: null,
          targetName: target.name,
          href: adminProfilePath("user", target.id),
        }
      : { ...base, preview: null, targetName: null, href: null };
  });
};
