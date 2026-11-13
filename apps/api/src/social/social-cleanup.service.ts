import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

// Account deletion removes a trainee's posts, photos, reactions, comments,
// notifications, friendships, blocks and reports by or about them (A12).
// The Users module calls this inside its delete-trainee transaction, with
// the transaction manager. DMs and chats go with the user row by cascade.
@Injectable()
export class SocialCleanupService {
  async deleteContentOfUser(manager: EntityManager, userId: number) {
    const key = `user:${userId}`;
    const posts: { id: number }[] = await manager.query(
      `SELECT id FROM social_posts WHERE author_kind = 'user' AND author_id = $1`,
      [userId],
    );
    const postIds = posts.map((post) => post.id);
    const comments: { id: number }[] = await manager.query(
      `SELECT id FROM social_comments WHERE author_key = $1 OR post_id = ANY($2::int[])`,
      [key, postIds],
    );

    // Reports first: they look up the trainee's posts and comments.
    await manager.query(
      `DELETE FROM social_reports
       WHERE reporter_key = $1
          OR (target_kind = 'user' AND target_id = $2)
          OR (target_kind = 'post' AND target_id = ANY($3::int[]))
          OR (target_kind = 'comment' AND target_id = ANY($4::int[]))`,
      [key, userId, postIds, comments.map((comment) => comment.id)],
    );
    await manager.query(
      `DELETE FROM social_friendships WHERE user_low = $1 OR user_high = $1`,
      [userId],
    );
    await manager.query(
      `DELETE FROM social_blocks WHERE blocker_id = $1 OR blocked_id = $1`,
      [userId],
    );
    await manager.query(
      `DELETE FROM social_reactions WHERE post_id = ANY($1::int[]) OR reactor_key = $2`,
      [postIds, key],
    );
    await manager.query(
      `DELETE FROM social_comments WHERE post_id = ANY($1::int[]) OR author_key = $2`,
      [postIds, key],
    );
    await manager.query(
      `DELETE FROM social_notifications
       WHERE post_id = ANY($1::int[]) OR recipient_key = $2 OR actor_key = $2`,
      [postIds, key],
    );
    // Photos of the posts, and uploads that never became a post.
    await manager.query(
      `DELETE FROM social_post_photos WHERE post_id = ANY($1::int[]) OR uploader_key = $2`,
      [postIds, key],
    );
    await manager.query(
      `DELETE FROM social_posts WHERE author_kind = 'user' AND author_id = $1`,
      [userId],
    );
  }
}
