import "server-only";

import { and, eq, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { socialPostPhotos, socialPosts } from "@/db/schema";
import { PHOTO_PENDING_TTL_MS } from "@/features/chat/utils/photo-rules";
import { loadVisibilityContext } from "@/features/social/services/post-context";
import type {
  PostAuthorRef,
  SocialActor,
} from "@/features/social/types/social";
import { canSeePost } from "@/features/social/utils/visibility";

// Photos of posts: storage and access. The uploader comes from the session.

export const uploaderKeyOf = (who: PostAuthorRef) => `${who.kind}:${who.id}`;

// Uploads that never became a post are dropped when the next upload arrives.
const purgeStalePending = (now: Date) =>
  db
    .delete(socialPostPhotos)
    .where(
      and(
        isNull(socialPostPhotos.postId),
        lt(
          socialPostPhotos.createdAt,
          new Date(now.getTime() - PHOTO_PENDING_TTL_MS),
        ),
      ),
    );

export const createPendingPostPhoto = async (
  input: {
    uploaderKey: string;
    mime: "image/webp" | "image/jpeg" | "image/png";
    width: number;
    height: number;
    bytes: Uint8Array;
  },
  now = new Date(),
) => {
  await purgeStalePending(now);
  const [row] = await db
    .insert(socialPostPhotos)
    .values({
      uploaderKey: input.uploaderKey,
      mime: input.mime,
      width: input.width,
      height: input.height,
      data: Buffer.from(input.bytes),
      size: input.bytes.length,
      createdAt: now,
    })
    .returning({ id: socialPostPhotos.id });

  return row.id;
};

// The photo bytes, only when the photo belongs to a live post the viewer may
// see (canSeePost). A pending upload or a deleted post is visible to no one.
export const findPostPhotoForViewer = async (
  photoId: number,
  viewer: SocialActor,
) => {
  const [row] = await db
    .select({
      mime: socialPostPhotos.mime,
      data: socialPostPhotos.data,
      authorKind: socialPosts.authorKind,
      authorId: socialPosts.authorId,
      privacy: socialPosts.privacy,
    })
    .from(socialPostPhotos)
    .innerJoin(socialPosts, eq(socialPosts.id, socialPostPhotos.postId))
    .where(and(eq(socialPostPhotos.id, photoId), isNull(socialPosts.deletedAt)))
    .limit(1);

  if (!row) {
    return null;
  }
  const ctx = await loadVisibilityContext(viewer, {
    kind: row.authorKind,
    id: row.authorId,
  });
  const post = {
    kind: row.authorKind,
    id: row.authorId,
    privacy: row.privacy,
  };

  return canSeePost(viewer, post, ctx)
    ? { mime: row.mime, data: row.data }
    : null;
};
