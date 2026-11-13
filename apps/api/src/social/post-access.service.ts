import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type SocialAuthorKind,
  type SocialPostPrivacy,
  toAdminRole,
} from "@pt/contracts";
import { DataSource, EntityManager } from "typeorm";

import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { PostPolicy, type VisibilityContext } from "./domain/post.policy.js";
import { RelationshipQueries } from "./relationships.queries.js";
import type { AuthorRef, SocialActor } from "./social-actor.js";

export type PostRow = {
  id: number;
  authorKind: SocialAuthorKind;
  authorId: number;
  caption: string | null;
  privacy: SocialPostPrivacy;
  photoId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type RawPost = {
  id: number;
  author_kind: SocialAuthorKind;
  author_id: number;
  caption: string | null;
  privacy: SocialPostPrivacy;
  photo_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export const POST_COLUMNS = `p.id, p.author_kind, p.author_id, p.caption, p.privacy,
  p.photo_id, p.created_at, p.updated_at`;

export const toPostRow = (raw: RawPost): PostRow => ({
  id: raw.id,
  authorKind: raw.author_kind,
  authorId: raw.author_id,
  caption: raw.caption,
  privacy: raw.privacy,
  photoId: raw.photo_id,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
});

// Postgres integer ids: a bigger number can only be a missing row.
export const MAX_ID = 2_147_483_647;

// Who may see what, in one place: PostPolicy plus the data it needs, plus the
// admin scope rules (PT workspace, hidden trainees) the admin pages apply.
@Injectable()
export class PostAccess {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly policy: PostPolicy,
    private readonly relationships: RelationshipQueries,
    private readonly scope: PtScopePolicy,
    private readonly scopeQueries: TraineeScopeQueries,
  ) {}

  // What PostPolicy needs from the database about viewer and author.
  async visibilityContext(
    viewer: SocialActor,
    author: AuthorRef,
  ): Promise<VisibilityContext> {
    const ctx: VisibilityContext = { areFriends: false, isBlocked: false };

    if (author.kind === "user") {
      const rows: { pt_admin_id: number | null }[] =
        await this.dataSource.query(
          `SELECT pt_admin_id FROM users WHERE id = $1`,
          [author.id],
        );

      ctx.authorPtAdminId = rows[0]?.pt_admin_id ?? null;
    } else {
      const rows: { role: string | null }[] = await this.dataSource.query(
        `SELECT role FROM admins WHERE id = $1`,
        [author.id],
      );

      ctx.authorRole = toAdminRole(rows[0]?.role);
    }
    if (viewer.kind === "user") {
      if (author.kind === "user") {
        Object.assign(
          ctx,
          await this.relationships.pairState(viewer.id, author.id),
        );
      }
      const rows: { pt_admin_id: number | null }[] =
        await this.dataSource.query(
          `SELECT pt_admin_id FROM users WHERE id = $1`,
          [viewer.id],
        );

      ctx.viewerPtAdminId = rows[0]?.pt_admin_id ?? null;
    }
    return ctx;
  }

  // A trainee outside a PT's workspace is "not found", and so is one the admin
  // hid unless they revealed hidden trainees (canAdminAccessUser).
  async adminCanAccessUser(
    viewer: Extract<SocialActor, { kind: "admin" }>,
    userId: number,
  ): Promise<boolean> {
    const facts = await this.scopeQueries.findByUserId(viewer.id, userId);

    return (
      facts !== null &&
      this.scope.isInWorkspace(viewer, facts) &&
      (!facts.hidden || viewer.revealed)
    );
  }

  // Whether the viewer may see a post whose author and privacy are known.
  async canSee(
    viewer: SocialActor,
    post: AuthorRef & { privacy: SocialPostPrivacy },
  ) {
    const ctx = await this.visibilityContext(viewer, post);

    if (!this.policy.canView(viewer, post, ctx)) {
      return false;
    }
    return !(
      viewer.kind === "admin" &&
      post.kind === "user" &&
      !(await this.adminCanAccessUser(viewer, post.id))
    );
  }

  async findLivePost(
    postId: number,
    manager?: EntityManager,
  ): Promise<PostRow | null> {
    if (!Number.isInteger(postId) || postId < 1 || postId > MAX_ID) {
      return null;
    }
    const rows: RawPost[] = await (manager ?? this.dataSource).query(
      `SELECT ${POST_COLUMNS} FROM social_posts p
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [postId],
    );

    return rows[0] ? toPostRow(rows[0]) : null;
  }

  // The live post if (and only if) the actor may see it. Every reaction,
  // comment and detail read goes through here; null means "treat as missing".
  async loadVisiblePost(
    viewer: SocialActor,
    postId: number,
  ): Promise<PostRow | null> {
    const post = await this.findLivePost(postId);

    if (!post) {
      return null;
    }
    const visible = await this.canSee(viewer, {
      kind: post.authorKind,
      id: post.authorId,
      privacy: post.privacy,
    });

    return visible ? post : null;
  }
}
