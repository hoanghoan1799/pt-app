import type {
  AdminRoleName,
  PostAuthorRef,
  PostPrivacy,
  SocialActor,
} from "@/features/social/types/social";

// The single place that decides who may see a post (spec "Visibility rules").
// Pure: whatever needs the database (friendships, blocks, workspaces) comes in
// through `ctx`, so P4 only has to fill the two booleans.

export interface VisibilityPost extends PostAuthorRef {
  privacy: PostPrivacy;
}

export interface VisibilityContext {
  // Accepted friendship between viewer and author (P4; false until then).
  areFriends?: boolean;
  // Either side blocked the other (P4).
  isBlocked?: boolean;
  // Author is a trainee: the PT they belong to (users.pt_admin_id).
  authorPtAdminId?: number | null;
  // Author is an admin: their role.
  authorRole?: AdminRoleName;
  // Viewer is a trainee: the PT they belong to.
  viewerPtAdminId?: number | null;
}

const isSameAccount = (viewer: SocialActor, author: PostAuthorRef) =>
  viewer.kind === author.kind && viewer.id === author.id;

// Admins are default friends: a super admin of every trainee, a PT of the
// trainees of their workspace; and the other way round for admin posts.
const isDefaultFriend = (
  viewer: SocialActor,
  author: PostAuthorRef,
  ctx: VisibilityContext,
) => {
  if (viewer.kind === "admin") {
    if (author.kind === "admin") {
      // Staff see each other's posts.
      return true;
    }
    return viewer.role === "pt" && ctx.authorPtAdminId === viewer.id;
  }
  // A trainee viewing an admin's post: super admin posts reach all trainees,
  // a PT's posts reach their own trainees.
  return (
    author.kind === "admin" &&
    (ctx.authorRole === "super_admin" ||
      (ctx.authorRole === "pt" && ctx.viewerPtAdminId === author.id))
  );
};

export const canSeePost = (
  viewer: SocialActor,
  post: VisibilityPost,
  ctx: VisibilityContext = {},
): boolean => {
  if (viewer.kind === "admin" && viewer.role === "super_admin") {
    return true;
  }
  if (isSameAccount(viewer, post)) {
    return true;
  }
  if (ctx.isBlocked) {
    return false;
  }
  // A PT has admin rights over the trainees of their workspace.
  if (
    viewer.kind === "admin" &&
    viewer.role === "pt" &&
    post.kind === "user" &&
    ctx.authorPtAdminId === viewer.id
  ) {
    return true;
  }
  if (post.privacy === "only_me") {
    return false;
  }
  if (post.privacy === "everyone") {
    return true;
  }
  return Boolean(ctx.areFriends) || isDefaultFriend(viewer, post, ctx);
};
