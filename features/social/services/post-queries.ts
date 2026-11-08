import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import { admins, socialPostPhotos, socialPosts, users } from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { POSTS_PAGE_SIZE } from "@/features/social/constants/social";
import {
  emptyEngagement,
  loadEngagement,
} from "@/features/social/services/engagement-queries";
import { loadVisiblePost } from "@/features/social/services/post-access";
import { loadVisibilityContext } from "@/features/social/services/post-context";
import type {
  PostAuthorRef,
  PostPage,
  PostView,
  SocialActor,
} from "@/features/social/types/social";
import {
  canDeletePost,
  canEditPost,
  socialPhotoUrl,
} from "@/features/social/utils/post-rules";
import { visiblePrivacies } from "@/features/social/utils/visibility";
import { canSeeHiddenUsers } from "@/services/admin-lock";
import { hiddenUserIdsOf } from "@/services/hidden-users";

const live = isNull(socialPosts.deletedAt);

const SUPER_ADMIN_IDS = sql`(select id from admins where role is null or role = 'super_admin')`;

const withCursor = (cursor: number | null): SQL | undefined =>
  cursor === null ? undefined : lt(socialPosts.id, cursor);

// Turns post rows into card data: author names/avatars/ticks, photo sizes and
// what the viewer may do with each post.
const toPostViews = async (
  rows: {
    post: typeof socialPosts.$inferSelect;
    photo: { width: number; height: number } | null;
  }[],
  viewer: SocialActor,
): Promise<PostView[]> => {
  const userIds = rows
    .filter((row) => row.post.authorKind === "user")
    .map((row) => row.post.authorId);
  const adminIds = rows
    .filter((row) => row.post.authorKind === "admin")
    .map((row) => row.post.authorId);
  const [userRows, adminRows] = await Promise.all([
    userIds.length
      ? db
          .select({
            id: users.id,
            name: users.name,
            avatarUpdatedAt: users.avatarUpdatedAt,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : [],
    adminIds.length
      ? db
          .select({
            id: admins.id,
            name: admins.username,
            avatarUpdatedAt: admins.avatarUpdatedAt,
            verifiedAt: admins.verifiedAt,
          })
          .from(admins)
          .where(inArray(admins.id, adminIds))
      : [],
  ]);
  const engagement = await loadEngagement(
    rows.map((row) => row.post.id),
    viewer,
  );
  const usersById = new Map(userRows.map((row) => [row.id, row]));
  const adminsById = new Map(adminRows.map((row) => [row.id, row]));

  return rows.map(({ post, photo }) => {
    const isAdmin = post.authorKind === "admin";
    const admin = adminsById.get(post.authorId);
    const author = isAdmin ? admin : usersById.get(post.authorId);
    const ref: PostAuthorRef = { kind: post.authorKind, id: post.authorId };

    return {
      id: post.id,
      authorKind: post.authorKind,
      authorId: post.authorId,
      authorName: author?.name ?? "Đã xóa",
      authorAvatarUrl: author
        ? avatarUrl(post.authorKind, post.authorId, author.avatarUpdatedAt)
        : null,
      authorVerified: Boolean(admin?.verifiedAt),
      caption: post.caption ?? "",
      privacy: post.privacy,
      photo:
        post.photoId !== null && photo
          ? {
              id: post.photoId,
              url: socialPhotoUrl(post.photoId),
              width: photo.width,
              height: photo.height,
            }
          : null,
      createdAt: post.createdAt.getTime(),
      edited: post.updatedAt.getTime() > post.createdAt.getTime(),
      canEdit: canEditPost(viewer, ref),
      canDelete: canDeletePost(viewer, ref),
      ...(engagement.get(post.id) ?? emptyEngagement()),
    };
  });
};

const runPage = async (
  where: SQL | undefined,
  viewer: SocialActor,
  cursor: number | null,
): Promise<PostPage> => {
  const rows = await db
    .select({
      post: socialPosts,
      photo: { width: socialPostPhotos.width, height: socialPostPhotos.height },
    })
    .from(socialPosts)
    .leftJoin(socialPostPhotos, eq(socialPostPhotos.id, socialPosts.photoId))
    .where(and(live, withCursor(cursor), where))
    .orderBy(desc(socialPosts.id))
    .limit(POSTS_PAGE_SIZE + 1);
  const hasMore = rows.length > POSTS_PAGE_SIZE;
  const pageRows = rows.slice(0, POSTS_PAGE_SIZE);
  const posts = await toPostViews(
    pageRows.map((row) => ({
      post: row.post,
      photo: row.photo?.width ? row.photo : null,
    })),
    viewer,
  );

  return {
    posts,
    nextCursor: hasMore
      ? (pageRows[pageRows.length - 1]?.post.id ?? null)
      : null,
  };
};

// One person's posts, filtered with the very rules of canSeePost.
export const listProfilePosts = async (
  viewer: SocialActor,
  author: PostAuthorRef,
  cursor: number | null = null,
): Promise<PostPage> => {
  const ctx = await loadVisibilityContext(viewer, author);
  const privacies = visiblePrivacies(viewer, author, ctx);

  if (privacies.length === 0) {
    return { posts: [], nextCursor: null };
  }
  return runPage(
    and(
      eq(socialPosts.authorKind, author.kind),
      eq(socialPosts.authorId, author.id),
      inArray(socialPosts.privacy, privacies),
    ),
    viewer,
    cursor,
  );
};

// Home feed of a trainee (spec R6): own posts, admins' posts that reach them
// (A1) and, from P4, their friends' posts (`friendIds`).
export const listUserFeed = async (
  userId: number,
  cursor: number | null = null,
  friendIds: number[] = [],
): Promise<PostPage> => {
  const [me] = await db
    .select({ ptAdminId: users.ptAdminId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const ptAdminId = me?.ptAdminId ?? null;
  const reachableAdmin = ptAdminId
    ? or(
        sql`${socialPosts.authorId} in ${SUPER_ADMIN_IDS}`,
        eq(socialPosts.authorId, ptAdminId),
      )
    : sql`${socialPosts.authorId} in ${SUPER_ADMIN_IDS}`;

  return runPage(
    or(
      and(eq(socialPosts.authorKind, "user"), eq(socialPosts.authorId, userId)),
      and(
        eq(socialPosts.authorKind, "admin"),
        eq(socialPosts.privacy, "everyone"),
      ),
      and(
        eq(socialPosts.authorKind, "admin"),
        eq(socialPosts.privacy, "friends"),
        reachableAdmin,
      ),
      friendIds.length
        ? and(
            eq(socialPosts.authorKind, "user"),
            inArray(socialPosts.authorId, friendIds),
            inArray(socialPosts.privacy, ["everyone", "friends"]),
          )
        : undefined,
    ),
    { kind: "user", id: userId },
    cursor,
  );
};

// Everything an admin may see (spec A1): a super admin all posts, a PT their
// trainees' posts and the admins' posts. Trainees the admin hid stay out
// unless the passcode reveal is active.
export const listAdminFeed = async (
  admin: { id: number; role: "super_admin" | "pt" },
  cursor: number | null = null,
): Promise<PostPage> => {
  const viewer: SocialActor = { kind: "admin", id: admin.id, role: admin.role };
  const revealed = await canSeeHiddenUsers(admin.id);
  const notHidden = revealed
    ? undefined
    : or(
        eq(socialPosts.authorKind, "admin"),
        notInArray(socialPosts.authorId, hiddenUserIdsOf(admin.id)),
      );

  if (admin.role === "super_admin") {
    return runPage(notHidden, viewer, cursor);
  }
  return runPage(
    and(
      notHidden,
      or(
        and(
          eq(socialPosts.authorKind, "user"),
          inArray(
            socialPosts.authorId,
            db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.ptAdminId, admin.id)),
          ),
        ),
        and(
          eq(socialPosts.authorKind, "admin"),
          or(
            eq(socialPosts.authorId, admin.id),
            inArray(socialPosts.privacy, ["everyone", "friends"]),
          ),
        ),
      ),
    ),
    viewer,
    cursor,
  );
};

// One post for its detail page; null unless the viewer may see it.
export const getPostView = async (
  viewer: SocialActor,
  postId: number,
): Promise<PostView | null> => {
  const visible = await loadVisiblePost(viewer, postId);

  if (!visible) {
    return null;
  }
  const [row] = await db
    .select({
      post: socialPosts,
      photo: { width: socialPostPhotos.width, height: socialPostPhotos.height },
    })
    .from(socialPosts)
    .leftJoin(socialPostPhotos, eq(socialPostPhotos.id, socialPosts.photoId))
    .where(eq(socialPosts.id, postId))
    .limit(1);

  if (!row) {
    return null;
  }
  const [view] = await toPostViews(
    [{ post: row.post, photo: row.photo?.width ? row.photo : null }],
    viewer,
  );

  return view ?? null;
};
