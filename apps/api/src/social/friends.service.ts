import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  EMAIL_MAX_LENGTH,
  SOCIAL_FRIEND_REQUEST_WINDOW_MS,
  SOCIAL_FRIEND_REQUESTS_PER_DAY,
  SOCIAL_TERMS_VERSION,
  socialPairOf,
} from "@pt/contracts";
import { DataSource } from "typeorm";
import { z } from "zod";

import { Clock } from "../common/clock.js";
import { AccountDirectory } from "../users/account-directory.service.js";
import { rowsOf } from "./domain/rows.js";
import { SOCIAL_EVENTS } from "./events/social.events.js";
import { SocialEventsPublisher } from "./events/social-events.publisher.js";
import { RelationshipQueries } from "./relationships.queries.js";
import {
  alreadyFriends,
  alreadyRequested,
  emailInvalid,
  friendRateLimited,
  userNotFound,
} from "./social.errors.js";

export type PersonView = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

const UNIQUE_VIOLATION = "23505";

// Exact search only (Q5): the whole address, trimmed and lower-cased. Anything
// that is not a full email is rejected so a prefix never matches.
export const parseSearchEmail = (value: unknown): string | null => {
  const parsed = z
    .string()
    .trim()
    .min(1)
    .max(EMAIL_MAX_LENGTH)
    .pipe(z.email())
    .safeParse(value);

  return parsed.success ? parsed.data.trim().toLowerCase() : null;
};

// Friend requests, friendships and blocks between trainees.
@Injectable()
export class FriendsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly relationships: RelationshipQueries,
    private readonly accounts: AccountDirectory,
    private readonly events: SocialEventsPublisher,
    private readonly clock: Clock,
  ) {}

  // ---- Reads ---------------------------------------------------------------

  // With `viewerId`, the names are that viewer's private nicknames where they
  // set one (their own never); the real name otherwise.
  private async loadPeople(
    ids: number[],
    viewerId: number,
  ): Promise<Map<number, PersonView>> {
    const accounts = await this.accounts.loadAccounts(
      ids.map((id) => `user:${id}`),
      `user:${viewerId}`,
    );

    return new Map(
      ids.flatMap((id) => {
        const account = accounts.get(`user:${id}`);

        return account
          ? [
              [
                id,
                { id, name: account.name, avatarUrl: account.avatarUrl },
              ] as const,
            ]
          : [];
      }),
    );
  }

  private inOrder(ids: number[], people: Map<number, PersonView>) {
    return ids.flatMap((id) => {
      const person = people.get(id);

      return person ? [person] : [];
    });
  }

  // Exact-email search (Q5): the whole address compared with users.email_key
  // for equality. Nothing for yourself, for a trainee without accepted terms,
  // or for anyone blocked either way, so the answer is "not found" in all of
  // those cases.
  async searchByEmail(meId: number, rawEmail: string) {
    const emailKey = parseSearchEmail(rawEmail);

    if (emailKey === null) {
      throw emailInvalid();
    }
    const rows: { id: number; terms_version: number | null }[] =
      await this.dataSource.query(
        `SELECT id, terms_version FROM users WHERE email_key = $1`,
        [emailKey],
      );
    const row = rows[0];

    if (
      !row ||
      row.id === meId ||
      !this.hasAcceptedTerms(row.terms_version) ||
      (await this.relationships.isBlockedBetween(meId, row.id))
    ) {
      return null;
    }
    const person = (await this.loadPeople([row.id], meId)).get(row.id);

    return person
      ? {
          ...person,
          relationship: (await this.relationships.relationship(
            meId,
            row.id,
          )) as "none" | "friends" | "sent" | "received",
        }
      : null;
  }

  // Accepted friends, newest friendship first, minus anyone blocked.
  async listFriends(meId: number): Promise<PersonView[]> {
    const ids = await this.relationships.friendIds(meId);

    return this.inOrder(ids, await this.loadPeople(ids, meId));
  }

  async listRequests(meId: number) {
    const rows: {
      user_low: number;
      user_high: number;
      requested_by: number;
    }[] = await this.dataSource.query(
      `SELECT user_low, user_high, requested_by FROM social_friendships
       WHERE status = 'pending' AND (user_low = $1 OR user_high = $1)
       ORDER BY created_at DESC, user_low, user_high`,
      [meId],
    );
    const otherOf = (row: (typeof rows)[number]) =>
      row.user_low === meId ? row.user_high : row.user_low;
    const people = await this.loadPeople(rows.map(otherOf), meId);

    return {
      received: this.inOrder(
        rows.filter((row) => row.requested_by !== meId).map(otherOf),
        people,
      ),
      sent: this.inOrder(
        rows.filter((row) => row.requested_by === meId).map(otherOf),
        people,
      ),
    };
  }

  // People I blocked (not the ones who blocked me).
  async listBlockedByMe(meId: number): Promise<PersonView[]> {
    const rows: { blocked_id: number }[] = await this.dataSource.query(
      `SELECT blocked_id FROM social_blocks WHERE blocker_id = $1
       ORDER BY created_at DESC, blocked_id`,
      [meId],
    );
    const ids = rows.map((row) => row.blocked_id);

    return this.inOrder(ids, await this.loadPeople(ids, meId));
  }

  // ---- Writes --------------------------------------------------------------

  private hasAcceptedTerms(version: number | null) {
    return version !== null && version >= SOCIAL_TERMS_VERSION;
  }

  // A trainee the viewer may befriend: exists, accepted the terms, is not the
  // viewer and no block in either direction.
  private async assertRequestable(meId: number, targetId: number) {
    if (meId === targetId) {
      throw userNotFound();
    }
    const rows: { terms_version: number | null }[] =
      await this.dataSource.query(
        `SELECT terms_version FROM users WHERE id = $1`,
        [targetId],
      );

    if (
      !rows[0] ||
      !this.hasAcceptedTerms(rows[0].terms_version) ||
      (await this.relationships.isBlockedBetween(meId, targetId))
    ) {
      throw userNotFound();
    }
  }

  // Fixed-window counter on rate_limits, shared by all instances (one atomic
  // upsert). Every call counts.
  private async consumeRateLimit(key: string, limit: number, windowMs: number) {
    const now = this.clock.now();
    const rows: { count: number }[] = await this.dataSource.query(
      `INSERT INTO rate_limits (key, count, window_started_at) VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_started_at <= $3 THEN 1
                      ELSE rate_limits.count + 1 END,
         window_started_at = CASE WHEN rate_limits.window_started_at <= $3 THEN $2
                                  ELSE rate_limits.window_started_at END
       RETURNING count`,
      [key, now, new Date(now.getTime() - windowMs)],
    );

    return (rows[0]?.count ?? 1) <= limit;
  }

  // `accepted` is true when the other side had already asked me, so the
  // request became a friendship at once.
  async sendRequest(
    meId: number,
    targetId: number,
  ): Promise<{ accepted: boolean }> {
    await this.assertRequestable(meId, targetId);
    const existing = await this.relationships.findFriendship(meId, targetId);

    if (existing?.status === "accepted") {
      throw alreadyFriends();
    }
    if (existing && existing.requestedBy === meId) {
      throw alreadyRequested();
    }
    if (existing) {
      // They asked me first: asking back is accepting.
      await this.accept(meId, targetId);
      return { accepted: true };
    }
    const allowed = await this.consumeRateLimit(
      `friend-request:${meId}`,
      SOCIAL_FRIEND_REQUESTS_PER_DAY,
      SOCIAL_FRIEND_REQUEST_WINDOW_MS,
    );

    if (!allowed) {
      throw friendRateLimited();
    }
    const { low, high } = socialPairOf(meId, targetId);

    try {
      await this.dataSource.query(
        `INSERT INTO social_friendships (user_low, user_high, status, requested_by, created_at)
         VALUES ($1, $2, 'pending', $3, $4)`,
        [low, high, meId, this.clock.now()],
      );
    } catch (error) {
      if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) {
        throw alreadyRequested();
      }
      throw error;
    }
    await this.events.publish(SOCIAL_EVENTS.FRIEND_REQUESTED, {
      requesterId: meId,
      targetId,
    });
    return { accepted: false };
  }

  // Only the one who was asked accepts.
  async accept(meId: number, requesterId: number) {
    const { low, high } = socialPairOf(meId, requesterId);

    if (await this.relationships.isBlockedBetween(meId, requesterId)) {
      throw userNotFound();
    }
    const rows = rowsOf<unknown>(
      await this.dataSource.query(
        `UPDATE social_friendships SET status = 'accepted', accepted_at = $4
       WHERE user_low = $1 AND user_high = $2 AND status = 'pending'
         AND requested_by = $3 RETURNING user_low`,
        [low, high, requesterId, this.clock.now()],
      ),
    );

    if (rows.length === 0) {
      throw userNotFound();
    }
    await this.events.publish(SOCIAL_EVENTS.FRIEND_ACCEPTED, {
      accepterId: meId,
      requesterId,
    });
  }

  private async deletePending(requesterId: number, otherId: number) {
    const { low, high } = socialPairOf(requesterId, otherId);
    const rows = rowsOf<unknown>(
      await this.dataSource.query(
        `DELETE FROM social_friendships
       WHERE user_low = $1 AND user_high = $2 AND status = 'pending'
         AND requested_by = $3 RETURNING user_low`,
        [low, high, requesterId],
      ),
    );

    return rows.length > 0;
  }

  // The one who was asked says no; the row goes, so a new request is possible.
  async decline(meId: number, requesterId: number) {
    if (!(await this.deletePending(requesterId, meId))) {
      throw userNotFound();
    }
    await this.events.publish(SOCIAL_EVENTS.FRIEND_REQUEST_ENDED, {
      recipientId: meId,
      actorId: requesterId,
    });
  }

  // The one who asked takes the request back.
  async cancel(meId: number, targetId: number) {
    if (!(await this.deletePending(meId, targetId))) {
      throw userNotFound();
    }
    await this.events.publish(SOCIAL_EVENTS.FRIEND_REQUEST_ENDED, {
      recipientId: targetId,
      actorId: meId,
    });
  }

  async unfriend(meId: number, otherId: number) {
    const { low, high } = socialPairOf(meId, otherId);
    const rows = rowsOf<unknown>(
      await this.dataSource.query(
        `DELETE FROM social_friendships
       WHERE user_low = $1 AND user_high = $2 AND status = 'accepted'
       RETURNING user_low`,
        [low, high],
      ),
    );

    if (rows.length === 0) {
      throw userNotFound();
    }
  }

  // Blocking ends any friendship or pending request, and clears the friend
  // notifications between the two (M1). Blocking twice is fine.
  async block(meId: number, targetId: number) {
    if (meId === targetId) {
      throw userNotFound();
    }
    const target: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM users WHERE id = $1`,
      [targetId],
    );

    if (target.length === 0) {
      throw userNotFound();
    }
    const { low, high } = socialPairOf(meId, targetId);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO social_blocks (blocker_id, blocked_id, created_at)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [meId, targetId, this.clock.now()],
      );
      await manager.query(
        `DELETE FROM social_friendships WHERE user_low = $1 AND user_high = $2`,
        [low, high],
      );
    });
    await this.events.publish(SOCIAL_EVENTS.USER_BLOCKED, {
      blockerId: meId,
      blockedId: targetId,
    });
  }

  // Only the blocker lifts a block; friendship does not come back.
  async unblock(meId: number, targetId: number) {
    const rows = rowsOf<unknown>(
      await this.dataSource.query(
        `DELETE FROM social_blocks WHERE blocker_id = $1 AND blocked_id = $2
       RETURNING blocker_id`,
        [meId, targetId],
      ),
    );

    if (rows.length === 0) {
      throw userNotFound();
    }
  }
}
