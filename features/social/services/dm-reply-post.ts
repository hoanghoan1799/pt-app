import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { admins, socialPostPhotos, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { loadAliases } from "@/features/contact-aliases/services/contact-aliases";
import { overlayName } from "@/features/contact-aliases/utils/alias-rules";
import { loadVisiblePost } from "@/features/social/services/post-access";
import type { DmReplyPostView } from "@/features/social/types/dm";
import type { SocialActor } from "@/features/social/types/social";
import { actorKey, socialPhotoUrl } from "@/features/social/utils/post-rules";

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
  const idsOfKind = (kind: "user" | "admin") => [
    ...new Set(
      posts.flatMap((post) =>
        post?.authorKind === kind ? [post.authorId] : [],
      ),
    ),
  ];
  const authorIds = idsOfKind("user");
  // The coach chat quotes posts written by a PT or the super admin.
  const adminIds = idsOfKind("admin");
  const photoIds = posts.flatMap((post) =>
    post?.photoId == null ? [] : [post.photoId],
  );
  const [people, adminPeople, photoRows] = await Promise.all([
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
    adminIds.length === 0
      ? []
      : db
          .select({
            id: admins.id,
            name: admins.username,
            avatarUpdatedAt: admins.avatarUpdatedAt,
          })
          .from(admins)
          .where(inArray(admins.id, adminIds)),
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
  const adminNames = new Map(adminPeople.map((row) => [row.id, row]));
  const photos = new Map(photoRows.map((row) => [row.id, row]));
  // The viewer's own nicknames for the quoted authors, nobody else's.
  const viewerKey = actorKey(viewer);
  const aliases = await loadAliases(
    viewerKey,
    posts.flatMap((post) =>
      post ? [actorKey({ kind: post.authorKind, id: post.authorId })] : [],
    ),
  );

  ids.forEach((id, index) => {
    const post = posts[index];
    const author = post
      ? (post.authorKind === "user" ? names : adminNames).get(post.authorId)
      : undefined;
    const photo = post?.photoId == null ? undefined : photos.get(post.photoId);

    result.set(
      id,
      post && author
        ? {
            id,
            available: true,
            authorName:
              actorKey({ kind: post.authorKind, id: author.id }) === viewerKey
                ? author.name
                : overlayName(
                    aliases,
                    actorKey({ kind: post.authorKind, id: author.id }),
                    author.name,
                  ),
            authorAvatarUrl: avatarUrl(
              post.authorKind,
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
