import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { socialPairOf } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { PostPolicy } from "./domain/post.policy.js";
import { PostAccess } from "./post-access.service.js";
import { RelationshipQueries } from "./relationships.queries.js";
import { toSocialActor } from "./social-actor.js";

// Who may fetch a trainee's profile photo. Composed from the rules that
// already decide who sees that trainee elsewhere; nothing new is invented:
//  - the trainee, and a super admin;
//  - a PT: PtScopePolicy.canAccessTrainee (workspace, and hidden trainees
//    only on a revealed session; a locked session gets nothing);
//  - another trainee: not blocked either way (RelationshipQueries), and
//    either an accepted friend, a direct-message partner, or the author of a
//    live post that PostPolicy lets them see (PostAccess.visibilityContext
//    + PostPolicy.visiblePrivacies, the same rules the feed filters with).
@Injectable()
export class AvatarAccess {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: PtScopePolicy,
    private readonly scopeQueries: TraineeScopeQueries,
    private readonly relationships: RelationshipQueries,
    private readonly postAccess: PostAccess,
    private readonly postPolicy: PostPolicy,
  ) {}

  async canViewUserAvatar(actor: AuthActor, userId: number) {
    if (actor.kind === "admin") {
      if (actor.role === "super_admin") {
        return true;
      }
      const facts = await this.scopeQueries.findByUserId(actor.id, userId);

      return facts !== null && this.scope.canAccessTrainee(actor, facts);
    }
    if (actor.id === userId) {
      return true;
    }
    const { areFriends, isBlocked } = await this.relationships.pairState(
      actor.id,
      userId,
    );

    if (isBlocked) {
      return false;
    }
    return (
      areFriends ||
      (await this.hasDirectMessages(actor.id, userId)) ||
      (await this.authoredVisiblePost(actor, userId))
    );
  }

  private async hasDirectMessages(a: number, b: number) {
    const { low, high } = socialPairOf(a, b);
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM dm_conversations WHERE user_low = $1 AND user_high = $2`,
      [low, high],
    );

    return rows.length > 0;
  }

  private async authoredVisiblePost(actor: AuthActor, authorId: number) {
    const viewer = toSocialActor(actor);
    const author = { kind: "user" as const, id: authorId };
    const privacies = this.postPolicy.visiblePrivacies(
      viewer,
      author,
      await this.postAccess.visibilityContext(viewer, author),
    );

    if (privacies.length === 0) {
      return false;
    }
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM social_posts
       WHERE author_kind = 'user' AND author_id = $1
         AND deleted_at IS NULL AND privacy = ANY($2::text[]) LIMIT 1`,
      [authorId, privacies],
    );

    return rows.length > 0;
  }
}
