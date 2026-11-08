import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { socialPostPhotos, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { loadVisiblePost } from "@/features/social/services/post-access";
import type { DmReplyPostView } from "@/features/social/types/dm";
import type { SocialActor } from "@/features/social/types/social";
import { socialPhotoUrl } from "@/features/social/utils/post-rules";

// The quoted-post previews of a chat, computed per viewer: a post the viewer
// may no longer see (deleted, privacy changed, block) comes back as
// `available: false` and nothing else about it.
export const loadReplyPostViews = async (
  viewer: SocialActor,
  postIds: number[],
): Promise<Map<number, DmReplyPostView>> => {
  const result = new Map<number, DmReplyPostView>();
  const ids = [...new Set(postIds)];
  const posts = await Promise.all(ids.map((id) => loadVisiblePost(viewer, id)));
  const authorIds = [
    ...new Set(
      posts.flatMap((post) =>
        post?.authorKind === "user" ? [post.authorId] : [],
      ),
    ),
  ];
  const photoIds = posts.flatMap((post) =>
    post?.photoId == null ? [] : [post.photoId],
  );
  const [people, photoRows] = await Promise.all([
    authorIds.length === 0
      ? []
      : db
          .select({
            id: users.id,
            name: users.name,
            avatarUpdatedAt: users.avatarUpdatedAt,
          })
          .from(users)
          .where(inArray(users.id, authorIds)),
    photoIds.length === 0
      ? []
      : db
          .select({
            id: socialPostPhotos.id,
            width: socialPostPhotos.width,
            height: socialPostPhotos.height,
          })
          .from(socialPostPhotos)
          .where(inArray(socialPostPhotos.id, photoIds)),
  ]);
  const names = new Map(people.map((row) => [row.id, row]));
  const photos = new Map(photoRows.map((row) => [row.id, row]));

  ids.forEach((id, index) => {
    const post = posts[index];
    const author =
      post?.authorKind === "user" ? names.get(post.authorId) : undefined;
    const photo = post?.photoId == null ? undefined : photos.get(post.photoId);

    result.set(
      id,
      post && author
        ? {
            id,
            available: true,
            authorName: author.name,
            authorAvatarUrl: avatarUrl(
              "user",
              author.id,
              author.avatarUpdatedAt,
            ),
            caption: post.caption ?? "",
            photo:
              post.photoId !== null && photo
                ? {
                    url: socialPhotoUrl(post.photoId),
                    width: photo.width,
                    height: photo.height,
                  }
                : null,
          }
        : { id, available: false },
    );
  });
  return result;
};

// The preview for the "reply" bar of a freshly opened chat: only a post the
// viewer sees that was written by the other member, else null.
export const loadReplyPostFor = async (
  viewer: SocialActor,
  postId: number,
  otherId: number,
) => {
  const post = await loadVisiblePost(viewer, postId);

  if (!post || post.authorKind !== "user" || post.authorId !== otherId) {
    return null;
  }
  const view = (await loadReplyPostViews(viewer, [postId])).get(postId);

  return view?.available ? view : null;
};
