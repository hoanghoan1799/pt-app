import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { socialComments, socialPosts, socialReports } from "@/db/schema";

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
