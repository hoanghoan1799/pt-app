import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  SOCIAL_NOTIFICATION_RETENTION_DAYS,
  type SocialNotificationKind,
  toAdminRole,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../../common/clock.js";
import { SocialAccountQueries } from "../accounts.queries.js";
import { decodeTimeCursor, timeCursor } from "../domain/cursor.js";
import { rowsOf } from "../domain/rows.js";
import { keyOf, type SocialActor } from "../social-actor.js";
import {
  buildNotificationText,
  deletedAccountName,
} from "./notification-content.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const INSERT_CHUNK = 100;

export type NotificationView = {
  id: number;
  kind: SocialNotificationKind;
  text: string;
  postId: number | null;
  actorKey: string;
  actorName: string;
  actorAvatarUrl: string | null;
  createdAt: Date;
  isUnread: boolean;
};

export type NotificationPageView = {
  items: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
};

type Row = {
  id: number;
  recipient_key: string;
  kind: SocialNotificationKind;
  actor_key: string;
  post_id: number | null;
  created_at: Date;
  read_at: Date | null;
};

// Notification rows: the list a person reads, and the writes the
// NotificationsListener makes when a domain event arrives.
@Injectable()
export class NotificationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accounts: SocialAccountQueries,
    private readonly clock: Clock,
  ) {}

  async unreadCount(recipientKey: string) {
    const rows: { count: number }[] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM social_notifications
       WHERE recipient_key = $1 AND read_at IS NULL`,
      [recipientKey],
    );

    return rows[0]?.count ?? 0;
  }

  // Newest first. Reading does not mark them read, so the client can still
  // show which ones were new; POST /read does. Rows older than the retention
  // window (A4) are dropped for this recipient first.
  async list(
    viewer: SocialActor,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotificationPageView> {
    const recipientKey = keyOf(viewer);
    const after = cursor ? decodeTimeCursor(cursor) : null;
    const now = this.clock.now();

    await this.dataSource.query(
      `DELETE FROM social_notifications WHERE recipient_key = $1 AND created_at < $2`,
      [
        recipientKey,
        new Date(now.getTime() - SOCIAL_NOTIFICATION_RETENTION_DAYS * DAY_MS),
      ],
    );
    const rows: Row[] = await this.dataSource.query(
      `SELECT id, recipient_key, kind, actor_key, post_id, created_at, read_at
       FROM social_notifications
       WHERE recipient_key = $1
         AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::int))
       ORDER BY created_at DESC, id DESC LIMIT $4`,
      [recipientKey, after?.at ?? null, after?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    // The recipient's own nicknames for the people who acted.
    const accounts = await this.accounts.loadAccounts(
      page.map((row) => row.actor_key),
      recipientKey,
    );
    const locale = viewer.locale ?? "vi";
    const last = page.at(-1);

    return {
      items: page.map((row) => {
        const actor = accounts.get(row.actor_key);
        const actorName = actor?.name ?? deletedAccountName(locale);

        return {
          id: row.id,
          kind: row.kind,
          text: buildNotificationText({
            kind: row.kind,
            actorName,
            locale,
            recipientKey,
            postId: row.post_id,
          }),
          postId: row.post_id,
          actorKey: row.actor_key,
          actorName,
          actorAvatarUrl: actor?.avatarUrl ?? null,
          createdAt: row.created_at,
          isUnread: row.read_at === null,
        };
      }),
      nextCursor:
        rows.length > limit && last ? timeCursor(last.created_at, last.id) : null,
      unreadCount: await this.unreadCount(recipientKey),
    };
  }

  async markAllRead(recipientKey: string) {
    await this.dataSource.query(
      `UPDATE social_notifications SET read_at = $2
       WHERE recipient_key = $1 AND read_at IS NULL`,
      [recipientKey, this.clock.now()],
    );
  }

  // ---- Writes used by the listener --------------------------------------

  async create(input: {
    recipientKey: string;
    kind: SocialNotificationKind;
    actorKey: string;
    postId: number | null;
    at: Date;
  }): Promise<number> {
    const rows: { id: number }[] = await this.dataSource.query(
      `INSERT INTO social_notifications (recipient_key, kind, actor_key, post_id, created_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.recipientKey, input.kind, input.actorKey, input.postId, input.at],
    );

    return rows[0].id;
  }

  // Friend request / accepted have no post. A repeated one (the request was
  // declined and sent again) replaces the earlier row.
  async createFriend(input: {
    recipientKey: string;
    actorKey: string;
    kind: "friend_request" | "friend_accepted";
    at: Date;
  }) {
    await this.removeFriend(input.recipientKey, input.actorKey, [input.kind]);
    return this.create({ ...input, postId: null });
  }

  async removeFriend(
    recipientKey: string,
    actorKey: string,
    kinds: ("friend_request" | "friend_accepted")[] = [
      "friend_request",
      "friend_accepted",
    ],
  ) {
    await this.dataSource.query(
      `DELETE FROM social_notifications
       WHERE recipient_key = $1 AND actor_key = $2 AND kind = ANY($3::text[])`,
      [recipientKey, actorKey, kinds],
    );
  }

  // Changing a reaction refreshes the same notification (new time, unread
  // again) instead of adding another one.
  async upsertReaction(
    input: { recipientKey: string; actorKey: string; postId: number },
    at: Date,
  ): Promise<number> {
    const existing = rowsOf<{ id: number }>(
      await this.dataSource.query(
        `UPDATE social_notifications SET created_at = $4, read_at = NULL
         WHERE kind = 'post_reaction' AND recipient_key = $1 AND actor_key = $2
           AND post_id = $3 RETURNING id`,
        [input.recipientKey, input.actorKey, input.postId, at],
      ),
    );

    return existing[0]
      ? existing[0].id
      : this.create({ ...input, kind: "post_reaction", at });
  }

  async removeReaction(input: {
    recipientKey: string;
    actorKey: string;
    postId: number;
  }) {
    await this.dataSource.query(
      `DELETE FROM social_notifications
       WHERE kind = 'post_reaction' AND recipient_key = $1 AND actor_key = $2
         AND post_id = $3`,
      [input.recipientKey, input.actorKey, input.postId],
    );
  }

  // Trainees an admin's new post reaches: a super admin every trainee, a PT
  // their own (users.pt_admin_id). Trainees the admin hid are left out unless
  // they revealed hidden trainees.
  async adminPostRecipientIds(
    adminId: number,
    includeHidden: boolean,
  ): Promise<number[]> {
    const admins: { role: string | null }[] = await this.dataSource.query(
      `SELECT role FROM admins WHERE id = $1`,
      [adminId],
    );

    if (!admins[0]) {
      return [];
    }
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT u.id FROM users u
       WHERE ($2::boolean OR u.pt_admin_id = $1)
         AND ($3::boolean OR u.id NOT IN
           (SELECT user_id FROM admin_hidden_users WHERE admin_id = $1))
       ORDER BY u.id`,
      [adminId, toAdminRole(admins[0].role) === "super_admin", includeHidden],
    );

    return rows.map((row) => row.id);
  }

  // One admin_post notification per recipient, in batched inserts.
  async createAdminPost(input: {
    adminId: number;
    postId: number;
    recipientIds: number[];
    at: Date;
  }): Promise<{ id: number; recipientKey: string }[]> {
    const ids: { id: number; recipientKey: string }[] = [];

    for (let start = 0; start < input.recipientIds.length; start += INSERT_CHUNK) {
      const chunk = input.recipientIds.slice(start, start + INSERT_CHUNK);
      const rows: { id: number; recipient_key: string }[] = await this.dataSource.query(
        `INSERT INTO social_notifications (recipient_key, kind, actor_key, post_id, created_at)
         SELECT 'user:' || r, 'admin_post', $1, $2, $3 FROM unnest($4::int[]) AS r
         RETURNING id, recipient_key`,
        [`admin:${input.adminId}`, input.postId, input.at, chunk],
      );

      ids.push(...rows.map((row) => ({ id: row.id, recipientKey: row.recipient_key })));
    }
    return ids;
  }
}
