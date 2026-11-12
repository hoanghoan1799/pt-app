import { Injectable } from "@nestjs/common";

import {
  type AuthorRef,
  isSameAccount,
  isSuperAdmin,
  keyOf,
  type SocialActor,
} from "../social-actor.js";

@Injectable()
export class CommentPolicy {
  // The comment's author edits their own comment, nobody else.
  canEdit(viewer: SocialActor, comment: { authorKey: string }) {
    return keyOf(viewer) === comment.authorKey;
  }

  // The comment's author, the author of the post and a super admin delete it.
  canDelete(
    viewer: SocialActor,
    comment: { authorKey: string },
    post: AuthorRef,
  ) {
    return (
      keyOf(viewer) === comment.authorKey ||
      isSameAccount(viewer, post) ||
      isSuperAdmin(viewer)
    );
  }
}
