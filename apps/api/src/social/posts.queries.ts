import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { SocialAuthorKind, SocialPostPrivacy } from "@pt/contracts";
import { DataSource } from "typeorm";

import { AccountDirectory } from "../users/account-directory.service.js";
import { idCursor } from "./domain/cursor.js";
import { PostPolicy } from "./domain/post.policy.js";
import {
  EMPTY_REACTIONS,
  type ReactionSummary,
  summarizeReactions,
} from "./domain/reactions.js";
import { deletedAccountName } from "./notifications/notification-content.js";
import {
  MAX_ID,
  POST_COLUMNS,
  PostAccess,
  type PostRow,
  toPostRow,
} from "./post-access.service.js";
import { RelationshipQueries } from "./relationships.queries.js";
import { type AuthorRef, keyOf, type SocialActor } from "./social-actor.js";

export type PostView = {
  id: number;
  authorKind: SocialAuthorKind;
  authorId: number;
  authorName: string;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  caption: string;
  privacy: SocialPostPrivacy;
  photo: { id: number; width: number; height: number } | null;
  createdAt: Date;
  edited: boolean;
  canEdit: boolean;
  canDelete: boolean;
  reactions: ReactionSummary;
  commentCount: number;
};

export type PostPageView = { items: PostView[]; nextCursor: string | null };

type PostWithPhoto = PostRow & {
  photo: { width: number; height: number } | null;
};

// A tiny builder so a filter can add parameters without counting indexes.
class Sql {
  readonly params: unknown[] = [];

  add(value: unknown) {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}

// SQL of the SUPER admins (admins.role is NOT NULL since DbConstraints).
const SUPER_ADMIN_IDS = `(SELECT id FROM admins WHERE role = 'super_admin')`;

// Read models of posts: feeds, profile lists and the single post. Visibility is
// filtered in SQL with the very rules of PostPolicy.
@Injectable()
export class PostQueries {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accounts: AccountDirectory,
    private readonly relationships: RelationshipQueries,
    private readonly policy: PostPolicy,
    private readonly access: PostAccess,
  ) {}

  // Turns post rows into card data: author names/avatars/ticks, photo sizes,
  // engagement and what the viewer may do with each post.
  private async toViews(
    rows: PostWithPhoto[],
    viewer: SocialActor,
  ): Promise<PostView[]> {
    const viewerKey = keyOf(viewer);
    const authors = await this.accounts.loadAccounts(
      rows.map((row) => keyOf({ kind: row.authorKind, id: row.authorId })),
      viewerKey,
    );
    const engagement = await this.loadEngagement(
      rows.map((row) => row.id),
      viewer,
    );

    return rows.map((post) => {
      const ref: AuthorRef = { kind: post.authorKind, id: post.authorId };
      const author = authors.get(keyOf(ref));
      const extra = engagement.get(post.id);

      return {
        id: post.id,
        authorKind: post.authorKind,
        authorId: post.authorId,
        authorName: author?.name ?? deletedAccountName(viewer.locale ?? "vi"),
        authorAvatarUrl: author?.avatarUrl ?? null,
        authorVerified: author?.verified ?? false,
        caption: post.caption ?? "",
        privacy: post.privacy,
        photo:
          post.photoId !== null && post.photo
            ? { id: post.photoId, ...post.photo }
            : null,
        createdAt: post.createdAt,
        edited: post.updatedAt.getTime() > post.createdAt.getTime(),
        canEdit: this.policy.canEdit(viewer, ref),
        canDelete: this.policy.canDelete(viewer, ref),
        reactions: extra?.reactions ?? EMPTY_REACTIONS,
        commentCount: extra?.commentCount ?? 0,
      };
    });
  }

  // Comment authors a trainee must not see: blocked either way (M1). Admins
  // block nobody.
  async blockedAuthorKeys(viewer: SocialActor): Promise<string[]> {
    return viewer.kind === "user"
      ? [...(await this.relationships.blockedBetweenIds(viewer.id))].map(
          (id) => `user:${id}`,
        )
      : [];
  }

  // Reaction summary and comment count for a page of posts, in two queries.
  private async loadEngagement(postIds: number[], viewer: SocialActor) {
    const result = new Map<
      number,
      { reactions: ReactionSummary; commentCount: number }
    >();

    if (postIds.length === 0) {
      return result;
    }
    const blocked = await this.blockedAuthorKeys(viewer);
    const [reactionRows, commentRows]: [
      { post_id: number; reactor_key: string; emoji: string }[],
      { post_id: number; count: number }[],
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT post_id, reactor_key, emoji FROM social_reactions
         WHERE post_id = ANY($1::int[])`,
        [postIds],
      ),
      this.dataSource.query(
        `SELECT post_id, count(*)::int AS count FROM social_comments
         WHERE post_id = ANY($1::int[]) AND deleted_at IS NULL
           AND NOT (author_key = ANY($2::text[]))
         GROUP BY post_id`,
        [postIds, blocked],
      ),
    ]);
    const counts = new Map(commentRows.map((row) => [row.post_id, row.count]));
    const myKey = keyOf(viewer);

    for (const postId of postIds) {
      const mine = reactionRows
        .filter((row) => row.post_id === postId)
        .map((row) => ({ reactorKey: row.reactor_key, emoji: row.emoji }));

      result.set(postId, {
        reactions: mine.length
          ? summarizeReactions(mine, myKey)
          : EMPTY_REACTIONS,
        commentCount: counts.get(postId) ?? 0,
      });
    }
    return result;
  }

  private async runPage(
    build: (sql: Sql) => string,
    viewer: SocialActor,
    cursor: number | null,
    limit: number,
  ): Promise<PostPageView> {
    const sql = new Sql();
    const where = build(sql);
    const after = cursor === null ? "TRUE" : `p.id < ${sql.add(cursor)}`;
    const rows: (Parameters<typeof toPostRow>[0] & {
      photo_width: number | null;
      photo_height: number | null;
    })[] = await this.dataSource.query(
      `SELECT ${POST_COLUMNS}, ph.width AS photo_width, ph.height AS photo_height
       FROM social_posts p
       LEFT JOIN social_post_photos ph ON ph.id = p.photo_id
       WHERE p.deleted_at IS NULL AND ${after} AND (${where})
       ORDER BY p.id DESC LIMIT ${sql.add(limit + 1)}`,
      sql.params,
    );
    const page = rows.slice(0, limit);
    const items = await this.toViews(
      page.map((row) => ({
        ...toPostRow(row),
        photo: row.photo_width
          ? { width: row.photo_width, height: row.photo_height ?? 0 }
          : null,
      })),
      viewer,
    );
    const last = page.at(-1);

    return {
      items,
      nextCursor: rows.length > limit && last ? idCursor(last.id) : null,
    };
  }

  // One person's posts, filtered with the very rules of PostPolicy.
  async listProfilePosts(
    viewer: SocialActor,
    author: AuthorRef,
    cursor: number | null,
    limit: number,
  ): Promise<PostPageView> {
    const ctx = await this.access.visibilityContext(viewer, author);
    const privacies = this.policy.visiblePrivacies(viewer, author, ctx);

    if (privacies.length === 0) {
      return { items: [], nextCursor: null };
    }
    return this.runPage(
      (sql) =>
        `p.author_kind = ${sql.add(author.kind)} AND p.author_id = ${sql.add(author.id)}
         AND p.privacy = ANY(${sql.add(privacies)}::text[])`,
      viewer,
      cursor,
      limit,
    );
  }

  // Home feed of a trainee (R6): own posts, admins' posts that reach them (A1)
  // and their accepted friends' posts (everyone + friends), never anyone
  // blocked either way.
  async listUserFeed(
    viewer: Extract<SocialActor, { kind: "user" }>,
    cursor: number | null,
    limit: number,
  ): Promise<PostPageView> {
    const friendIds = await this.relationships.friendIds(viewer.id);
    const rows: { pt_admin_id: number | null }[] = await this.dataSource.query(
      `SELECT pt_admin_id FROM users WHERE id = $1`,
      [viewer.id],
    );
    const ptAdminId = rows[0]?.pt_admin_id ?? null;

    return this.runPage(
      (sql) => {
        const reachable = ptAdminId
          ? `(p.author_id IN ${SUPER_ADMIN_IDS} OR p.author_id = ${sql.add(ptAdminId)})`
          : `p.author_id IN ${SUPER_ADMIN_IDS}`;
        const parts = [
          `(p.author_kind = 'user' AND p.author_id = ${sql.add(viewer.id)})`,
          `(p.author_kind = 'admin' AND p.privacy = 'everyone')`,
          `(p.author_kind = 'admin' AND p.privacy = 'friends' AND ${reachable})`,
        ];

        if (friendIds.length) {
          parts.push(
            `(p.author_kind = 'user' AND p.author_id = ANY(${sql.add(friendIds)}::int[])
              AND p.privacy IN ('everyone', 'friends'))`,
          );
        }
        return parts.join(" OR ");
      },
      viewer,
      cursor,
      limit,
    );
  }

  // Everything an admin may see (A1): a super admin all posts, a PT their
  // trainees' posts and the admins' posts. Trainees the admin hid stay out
  // unless the passcode reveal is active.
  async listAdminFeed(
    viewer: Extract<SocialActor, { kind: "admin" }>,
    cursor: number | null,
    limit: number,
  ): Promise<PostPageView> {
    return this.runPage(
      (sql) => {
        const adminId = sql.add(viewer.id);
        const notHidden = viewer.revealed
          ? "TRUE"
          : `(p.author_kind = 'admin' OR p.author_id NOT IN
              (SELECT user_id FROM admin_hidden_users WHERE admin_id = ${adminId}))`;

        if (viewer.role === "super_admin") {
          return notHidden;
        }
        return `${notHidden} AND (
          (p.author_kind = 'user' AND p.author_id IN
            (SELECT id FROM users WHERE pt_admin_id = ${adminId}))
          OR (p.author_kind = 'admin'
              AND (p.author_id = ${adminId} OR p.privacy IN ('everyone', 'friends'))))`;
      },
      viewer,
      cursor,
      limit,
    );
  }

  // One post for its detail page; null unless the viewer may see it.
  async getPostView(
    viewer: SocialActor,
    postId: number,
  ): Promise<PostView | null> {
    if (!Number.isInteger(postId) || postId < 1 || postId > MAX_ID) {
      return null;
    }
    const visible = await this.access.loadVisiblePost(viewer, postId);

    if (!visible) {
      return null;
    }
    const photo = visible.photoId
      ? ((
          await this.dataSource.query(
            `SELECT width, height FROM social_post_photos WHERE id = $1`,
            [visible.photoId],
          )
        )[0] as { width: number; height: number } | undefined)
      : undefined;
    const [view] = await this.toViews(
      [{ ...visible, photo: photo ?? null }],
      viewer,
    );

    return view ?? null;
  }
}
