import { Injectable } from "@nestjs/common";
import type { AdminRole, SocialPostPrivacy } from "@pt/contracts";

import {
  type AuthorRef,
  isSameAccount,
  isSuperAdmin,
  type SocialActor,
} from "../social-actor.js";

export type PostFacts = AuthorRef & { privacy: SocialPostPrivacy };

// What the policy needs from the database about viewer and author.
export type VisibilityContext = {
  // Accepted friendship between two trainees.
  areFriends?: boolean;
  // Either side blocked the other (two trainees).
  isBlocked?: boolean;
  // Author is a trainee: the PT they belong to (users.pt_admin_id).
  authorPtAdminId?: number | null;
  // Author is an admin: their role.
  authorRole?: AdminRole;
  // Viewer is a trainee: the PT they belong to.
  viewerPtAdminId?: number | null;
};

const ALL_PRIVACIES: SocialPostPrivacy[] = ["everyone", "friends", "only_me"];

// The single place that decides who sees a post (spec "Visibility rules"),
// ported from features/social/utils/visibility.ts. Pure: friendships, blocks
// and workspaces come in through the context.
@Injectable()
export class PostPolicy {
  canView(
    viewer: SocialActor,
    post: PostFacts,
    ctx: VisibilityContext = {},
  ): boolean {
    if (isSuperAdmin(viewer) || isSameAccount(viewer, post)) {
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
    switch (post.privacy) {
      case "only_me":
        return false;
      case "everyone":
        return true;
      case "friends":
        return (
          Boolean(ctx.areFriends) || this.isDefaultFriend(viewer, post, ctx)
        );
    }
  }

  // The privacy values of `author`'s posts the viewer may see; lets a list
  // query filter in SQL with the very same rules.
  visiblePrivacies(
    viewer: SocialActor,
    author: AuthorRef,
    ctx: VisibilityContext = {},
  ): SocialPostPrivacy[] {
    return ALL_PRIVACIES.filter((privacy) =>
      this.canView(viewer, { ...author, privacy }, ctx),
    );
  }

  // The author edits their own post; the photo never changes (R2).
  canEdit(viewer: SocialActor, author: AuthorRef) {
    return isSameAccount(viewer, author);
  }

  // The author deletes their post; a super admin deletes any.
  canDelete(viewer: SocialActor, author: AuthorRef) {
    return isSameAccount(viewer, author) || isSuperAdmin(viewer);
  }

  // Admins are default friends: a super admin of every trainee, a PT of the
  // trainees of their workspace, staff of each other; and the other way round
  // for admin posts.
  private isDefaultFriend(
    viewer: SocialActor,
    author: AuthorRef,
    ctx: VisibilityContext,
  ) {
    if (viewer.kind === "admin") {
      if (author.kind === "admin") {
        return true;
      }
      return viewer.role === "pt" && ctx.authorPtAdminId === viewer.id;
    }
    return (
      author.kind === "admin" &&
      (ctx.authorRole === "super_admin" ||
        (ctx.authorRole === "pt" && ctx.viewerPtAdminId === author.id))
    );
  }
}
