import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  SOCIAL_TERMS_VERSION,
  type SocialCreatePostRequest,
  type SocialEditPostRequest,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { PostPolicy } from "./domain/post.policy.js";
import { rowsOf } from "./domain/rows.js";
import { SOCIAL_EVENTS } from "./events/social.events.js";
import { SocialEventsPublisher } from "./events/social-events.publisher.js";
import { PostAccess } from "./post-access.service.js";
import {
  emptyPost,
  notAllowed,
  photoNotFound,
  postNotFound,
} from "./social.errors.js";
import { keyOf, type SocialActor } from "./social-actor.js";

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION;

// The text or a photo: a post needs one of them.
const isEmpty = (caption: string, hasPhoto: boolean) =>
  caption.trim() === "" && !hasPhoto;

// Writes of posts. Multi-row writes run in one transaction; domain events go
// out after the commit.
@Injectable()
export class PostsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly policy: PostPolicy,
    private readonly access: PostAccess,
    private readonly events: SocialEventsPublisher,
    private readonly clock: Clock,
  ) {}

  // Same Idempotency-Key and same author return the first post: `replayed` is
  // true then and nothing else happens (no second notification either).
  async create(
    actor: SocialActor,
    input: SocialCreatePostRequest,
    idempotencyKey: string | null,
  ): Promise<{ postId: number; replayed: boolean }> {
    const caption = input.caption.trim();

    if (isEmpty(caption, input.photoId !== null)) {
      throw emptyPost();
    }
    if (idempotencyKey) {
      const existing = await this.findByKey(actor, idempotencyKey);

      if (existing !== null) {
        return { postId: existing, replayed: true };
      }
    }
    const now = this.clock.now();
    let postId: number;

    try {
      postId = await this.dataSource.transaction(async (manager) => {
        const rows: { id: number }[] = await manager.query(
          `INSERT INTO social_posts
             (author_kind, author_id, caption, privacy, idempotency_key, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
          [
            actor.kind,
            actor.id,
            caption === "" ? null : caption,
            input.privacy,
            idempotencyKey,
            now,
          ],
        );
        const id = rows[0].id;

        if (input.photoId !== null) {
          // Only the uploader's own pending photo can be attached, once.
          const attached = rowsOf<unknown>(
            await manager.query(
              `UPDATE social_post_photos SET post_id = $1
               WHERE id = $2 AND uploader_key = $3 AND post_id IS NULL RETURNING id`,
              [id, input.photoId, keyOf(actor)],
            ),
          );

          if (attached.length === 0) {
            throw photoNotFound();
          }
          await manager.query(
            `UPDATE social_posts SET photo_id = $1 WHERE id = $2`,
            [input.photoId, id],
          );
        }
        if (actor.kind === "user") {
          await manager.query(
            `UPDATE users SET post_privacy_default = $1 WHERE id = $2`,
            [input.privacy, actor.id],
          );
        }
        return id;
      });
    } catch (error) {
      // Two requests with the same key raced: the loser returns the winner.
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByKey(actor, idempotencyKey);

        if (existing !== null) {
          return { postId: existing, replayed: true };
        }
      }
      throw error;
    }
    await this.events.publish(SOCIAL_EVENTS.POST_PUBLISHED, {
      postId,
      authorKind: actor.kind,
      authorId: actor.id,
      privacy: input.privacy,
      includeHidden: actor.kind === "admin" && actor.revealed,
      at: now,
    });
    return { postId, replayed: false };
  }

  private async findByKey(actor: SocialActor, key: string) {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM social_posts
       WHERE author_kind = $1 AND author_id = $2 AND idempotency_key = $3
         AND deleted_at IS NULL`,
      [actor.kind, actor.id, key],
    );

    return rows[0]?.id ?? null;
  }

  // The author changes caption and privacy, not the photo (R2).
  async edit(actor: SocialActor, postId: number, input: SocialEditPostRequest) {
    const post = await this.access.findLivePost(postId);

    if (!post) {
      throw postNotFound();
    }
    if (!this.policy.canEdit(actor, { kind: post.authorKind, id: post.authorId })) {
      throw notAllowed();
    }
    const caption = input.caption.trim();

    if (isEmpty(caption, post.photoId !== null)) {
      throw emptyPost();
    }
    await this.dataSource.query(
      `UPDATE social_posts SET caption = $2, privacy = $3, updated_at = $4 WHERE id = $1`,
      [post.id, caption === "" ? null : caption, input.privacy, this.clock.now()],
    );
  }

  // The author deletes their post; a super admin deletes any. The photo bytes,
  // reactions, comments and notifications go with it.
  async delete(actor: SocialActor, postId: number) {
    const post = await this.access.findLivePost(postId);

    if (!post) {
      throw postNotFound();
    }
    if (
      !this.policy.canDelete(actor, { kind: post.authorKind, id: post.authorId })
    ) {
      throw notAllowed();
    }
    await this.deleteInTransaction(post.id);
  }

  // Also used by the report resolution.
  async deleteInTransaction(postId: number) {
    const now = this.clock.now();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE social_posts SET deleted_at = $2, updated_at = $2 WHERE id = $1`,
        [postId, now],
      );
      await manager.query(`DELETE FROM social_post_photos WHERE post_id = $1`, [
        postId,
      ]);
      await manager.query(`DELETE FROM social_reactions WHERE post_id = $1`, [
        postId,
      ]);
      await manager.query(`DELETE FROM social_comments WHERE post_id = $1`, [
        postId,
      ]);
      await manager.query(
        `DELETE FROM social_notifications WHERE post_id = $1`,
        [postId],
      );
    });
  }

  // A trainee may use the social features once they accepted the current terms
  // version (a new version asks again, T1).
  async acceptTerms(userId: number) {
    await this.dataSource.query(
      `UPDATE users SET terms_version = $2, terms_accepted_at = $3 WHERE id = $1`,
      [userId, SOCIAL_TERMS_VERSION, this.clock.now()],
    );
  }
}
