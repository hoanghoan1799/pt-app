import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { parseSocialActorKey } from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { AccountDirectory } from "../users/account-directory.service.js";
import { CommentPolicy } from "./domain/comment.policy.js";
import { decodeTimeCursor, timeCursor } from "./domain/cursor.js";
import { SOCIAL_EVENTS } from "./events/social.events.js";
import { SocialEventsPublisher } from "./events/social-events.publisher.js";
import { deletedAccountName } from "./notifications/notification-content.js";
import { MAX_ID, PostAccess, type PostRow } from "./post-access.service.js";
import { PostQueries } from "./posts.queries.js";
import { commentNotFound, notAllowed, postNotFound } from "./social.errors.js";
import { keyOf, type SocialActor } from "./social-actor.js";

export type CommentView = {
  id: number;
  authorKind: "user" | "admin";
  authorId: number;
  authorName: string;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  body: string;
  createdAt: Date;
  edited: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type CommentRow = {
  id: number;
  post_id: number;
  author_key: string;
  body: string;
  created_at: Date;
  updated_at: Date | null;
};

const recipientOf = (post: PostRow) => `${post.authorKind}:${post.authorId}`;

// Reactions and comments on posts the actor can see.
@Injectable()
export class EngagementService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: PostAccess,
    private readonly accounts: AccountDirectory,
    private readonly posts: PostQueries,
    private readonly commentPolicy: CommentPolicy,
    private readonly events: SocialEventsPublisher,
    private readonly clock: Clock,
  ) {}

  private async visiblePost(actor: SocialActor, postId: number) {
    const post = await this.access.loadVisiblePost(actor, postId);

    if (!post) {
      throw postNotFound();
    }
    return post;
  }

  // Set or change (same call) my one reaction to a post.
  async react(actor: SocialActor, postId: number, emoji: string) {
    const post = await this.visiblePost(actor, postId);
    const now = this.clock.now();

    await this.dataSource.query(
      `INSERT INTO social_reactions (post_id, reactor_key, emoji, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (post_id, reactor_key) DO UPDATE SET emoji = EXCLUDED.emoji`,
      [postId, keyOf(actor), emoji, now],
    );
    await this.events.publish(SOCIAL_EVENTS.POST_REACTED, {
      postId,
      reactorKey: keyOf(actor),
      recipientKey: recipientOf(post),
      emoji,
      at: now,
    });
  }

  async removeReaction(actor: SocialActor, postId: number) {
    const post = await this.visiblePost(actor, postId);

    await this.dataSource.query(
      `DELETE FROM social_reactions WHERE post_id = $1 AND reactor_key = $2`,
      [postId, keyOf(actor)],
    );
    await this.events.publish(SOCIAL_EVENTS.REACTION_REMOVED, {
      postId,
      reactorKey: keyOf(actor),
      recipientKey: recipientOf(post),
    });
  }

  // Who reacted with what, oldest first.
  async listReactors(actor: SocialActor, postId: number) {
    await this.visiblePost(actor, postId);
    const rows: { reactor_key: string; emoji: string }[] =
      await this.dataSource.query(
        `SELECT reactor_key, emoji FROM social_reactions
         WHERE post_id = $1 ORDER BY created_at, reactor_key`,
        [postId],
      );
    const myKey = keyOf(actor);
    // The viewer's own nicknames for the reactors, nobody else's.
    const accounts = await this.accounts.loadAccounts(
      rows.map((row) => row.reactor_key),
      myKey,
    );

    return rows.map((row) => ({
      name:
        accounts.get(row.reactor_key)?.name ??
        deletedAccountName(actor.locale ?? "vi"),
      emoji: row.emoji,
      isMe: row.reactor_key === myKey,
    }));
  }

  // Oldest first, keyset on (created_at, id); comments of people blocked
  // either way are left out (M1).
  async listComments(
    actor: SocialActor,
    postId: number,
    cursor: string | undefined,
    limit: number,
  ) {
    const post = await this.visiblePost(actor, postId);
    const blocked = await this.posts.blockedAuthorKeys(actor);
    const after = cursor ? decodeTimeCursor(cursor) : null;
    const rows: CommentRow[] = await this.dataSource.query(
      `SELECT id, post_id, author_key, body, created_at, updated_at
       FROM social_comments
       WHERE post_id = $1 AND deleted_at IS NULL
         AND NOT (author_key = ANY($2::text[]))
         AND ($3::timestamptz IS NULL OR (created_at, id) > ($3::timestamptz, $4::int))
       ORDER BY created_at, id LIMIT $5`,
      [postId, blocked, after?.at ?? null, after?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    const accounts = await this.accounts.loadAccounts(
      page.map((row) => row.author_key),
      keyOf(actor),
    );
    const postRef = { kind: post.authorKind, id: post.authorId };
    const items: CommentView[] = page.map((row) => {
      const account = accounts.get(row.author_key);
      const ref = parseSocialActorKey(row.author_key);

      return {
        id: row.id,
        authorKind: ref?.kind ?? "user",
        authorId: ref?.id ?? 0,
        authorName: account?.name ?? deletedAccountName(actor.locale ?? "vi"),
        authorAvatarUrl: account?.avatarUrl ?? null,
        authorVerified: account?.verified ?? false,
        body: row.body,
        createdAt: row.created_at,
        edited: row.updated_at !== null,
        canEdit: this.commentPolicy.canEdit(actor, {
          authorKey: row.author_key,
        }),
        canDelete: this.commentPolicy.canDelete(
          actor,
          { authorKey: row.author_key },
          postRef,
        ),
      };
    });
    const last = page.at(-1);

    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? timeCursor(last.created_at, last.id)
          : null,
    };
  }

  async addComment(actor: SocialActor, postId: number, body: string) {
    const post = await this.visiblePost(actor, postId);
    const now = this.clock.now();
    const authorKey = keyOf(actor);
    const rows: { id: number }[] = await this.dataSource.query(
      `INSERT INTO social_comments (post_id, author_key, body, created_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [postId, authorKey, body.trim(), now],
    );

    await this.events.publish(SOCIAL_EVENTS.POST_COMMENTED, {
      postId,
      commentId: rows[0].id,
      authorKey,
      recipientKey: recipientOf(post),
      body: body.trim(),
      at: now,
    });
    return rows[0].id;
  }

  private async findLiveComment(commentId: number): Promise<CommentRow> {
    if (!Number.isInteger(commentId) || commentId < 1 || commentId > MAX_ID) {
      throw commentNotFound();
    }
    const rows: CommentRow[] = await this.dataSource.query(
      `SELECT id, post_id, author_key, body, created_at, updated_at
       FROM social_comments WHERE id = $1 AND deleted_at IS NULL`,
      [commentId],
    );

    if (!rows[0]) {
      throw commentNotFound();
    }
    return rows[0];
  }

  // The post must still be visible to the editor.
  async editComment(actor: SocialActor, commentId: number, body: string) {
    const comment = await this.findLiveComment(commentId);

    if (!(await this.access.loadVisiblePost(actor, comment.post_id))) {
      throw commentNotFound();
    }
    if (!this.commentPolicy.canEdit(actor, { authorKey: comment.author_key })) {
      throw notAllowed();
    }
    await this.dataSource.query(
      `UPDATE social_comments SET body = $2, updated_at = $3 WHERE id = $1`,
      [commentId, body.trim(), this.clock.now()],
    );
  }

  // The commenter, the post's author and a super admin may delete. The text is
  // emptied, the row stays as a tombstone.
  async deleteComment(actor: SocialActor, commentId: number) {
    const comment = await this.findLiveComment(commentId);
    const post = await this.access.findLivePost(comment.post_id);

    if (!post) {
      throw commentNotFound();
    }
    if (
      !this.commentPolicy.canDelete(
        actor,
        { authorKey: comment.author_key },
        { kind: post.authorKind, id: post.authorId },
      )
    ) {
      throw notAllowed();
    }
    await this.tombstone(commentId);
  }

  // Also used by the report resolution.
  async tombstone(commentId: number) {
    await this.dataSource.query(
      `UPDATE social_comments SET deleted_at = $2, body = '' WHERE id = $1`,
      [commentId, this.clock.now()],
    );
  }
}
