import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { socialPairOf,type SocialRelationship } from "@pt/contracts";
import { DataSource, EntityManager } from "typeorm";

export type FriendshipRow = {
  status: "pending" | "accepted";
  requestedBy: number;
};

// Friendships and blocks between two trainees: the one place the visibility
// context, the feed, the profile and the friend actions read them from.
// Admins have neither (they are default friends by role).
@Injectable()
export class RelationshipQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private run<T>(manager: EntityManager | undefined, sql: string, params: unknown[]) {
    return (manager ?? this.dataSource).query(sql, params) as Promise<T>;
  }

  async findFriendship(
    a: number,
    b: number,
    manager?: EntityManager,
  ): Promise<FriendshipRow | null> {
    const { low, high } = socialPairOf(a, b);
    const rows = await this.run<{ status: "pending" | "accepted"; requested_by: number }[]>(
      manager,
      `SELECT status, requested_by FROM social_friendships
       WHERE user_low = $1 AND user_high = $2`,
      [low, high],
    );

    return rows[0]
      ? { status: rows[0].status, requestedBy: rows[0].requested_by }
      : null;
  }

  // Either side blocked the other.
  async isBlockedBetween(a: number, b: number, manager?: EntityManager) {
    const rows = await this.run<unknown[]>(
      manager,
      `SELECT 1 FROM social_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
      [a, b],
    );

    return rows.length > 0;
  }

  // What the visibility context needs about two trainees.
  async pairState(viewerId: number, otherId: number) {
    if (viewerId === otherId) {
      return { areFriends: false, isBlocked: false };
    }
    const [friendship, isBlocked] = await Promise.all([
      this.findFriendship(viewerId, otherId),
      this.isBlockedBetween(viewerId, otherId),
    ]);

    return {
      areFriends: friendship?.status === "accepted" && !isBlocked,
      isBlocked,
    };
  }

  async relationship(
    viewerId: number,
    otherId: number,
  ): Promise<"self" | SocialRelationship> {
    if (viewerId === otherId) {
      return "self";
    }
    const friendship = await this.findFriendship(viewerId, otherId);

    if (!friendship) {
      return "none";
    }
    if (friendship.status === "accepted") {
      return "friends";
    }
    return friendship.requestedBy === viewerId ? "sent" : "received";
  }

  // Everyone who blocked `userId` or whom `userId` blocked.
  async blockedBetweenIds(userId: number): Promise<Set<number>> {
    const rows: { blocker_id: number; blocked_id: number }[] =
      await this.dataSource.query(
        `SELECT blocker_id, blocked_id FROM social_blocks
         WHERE blocker_id = $1 OR blocked_id = $1`,
        [userId],
      );

    return new Set(
      rows.map((row) =>
        row.blocker_id === userId ? row.blocked_id : row.blocker_id,
      ),
    );
  }

  // Ids of the trainees in an accepted friendship with `userId`, minus anyone
  // blocked either way, newest friendship first.
  async friendIds(userId: number): Promise<number[]> {
    const [rows, blocked]: [{ user_low: number; user_high: number }[], Set<number>] =
      await Promise.all([
        this.dataSource.query(
          `SELECT user_low, user_high FROM social_friendships
           WHERE status = 'accepted' AND (user_low = $1 OR user_high = $1)
           ORDER BY accepted_at DESC NULLS LAST, user_low, user_high`,
          [userId],
        ),
        this.blockedBetweenIds(userId),
      ]);

    return rows
      .map((row) => (row.user_low === userId ? row.user_high : row.user_low))
      .filter((id) => !blocked.has(id));
  }
}
