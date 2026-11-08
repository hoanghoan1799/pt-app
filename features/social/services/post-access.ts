import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { socialPosts } from "@/db/schema";
import { loadVisibilityContext } from "@/features/social/services/post-context";
import type { SocialActor } from "@/features/social/types/social";
import { canSeePost } from "@/features/social/utils/visibility";
import { canAdminAccessUser } from "@/services/hidden-users";

// The live post if (and only if) the actor may see it: canSeePost, plus the
// admin scope and hidden-trainee rules the admin pages apply. Every reaction,
// comment and detail read goes through here; null means "treat as missing".
export const loadVisiblePost = async (actor: SocialActor, postId: number) => {
  const [post] = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, postId), isNull(socialPosts.deletedAt)))
    .limit(1);

  if (!post) {
    return null;
  }
  const author = { kind: post.authorKind, id: post.authorId };
  const ctx = await loadVisibilityContext(actor, author);

  if (!canSeePost(actor, { ...author, privacy: post.privacy }, ctx)) {
    return null;
  }
  if (
    actor.kind === "admin" &&
    post.authorKind === "user" &&
    !(await canAdminAccessUser(actor.id, post.authorId))
  ) {
    return null;
  }
  return post;
};
