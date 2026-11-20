import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  CHAT_CHANGES_PAGE_SIZE,
  GROUP_PAGE_SIZE,
  type GroupActor,
  type GroupReaderCursor,
  type GroupSession,
} from "@pt/contracts";
import { DataSource, type EntityManager } from "typeorm";

import { returnedRows } from "../common/sql.js";

// The SQL of group chat (company group-queries.ts on PostgreSQL). Rows with
// `audience = 'super_admin'` (the PT-change alert) exist for super admins
// only: every thread read goes through `audienceSql`.

type Runner = Pick<EntityManager, "query">;

export type GroupRow = {
  id: number;
  name: string;
  avatarUpdatedAt: Date | null;
  createdByKey: string;
  managersOnly: boolean;
  lastMessageId: number | null;
  lastMessageAt: Date | null;
  lastChangeAt: Date | null;
  dissolvedAt: Date | null;
  createdAt: Date;
};

export type MemberRow = {
  memberKey: string;
  leftAt: Date | null;
  mutedAt: Date | null;
  lastReadMessageId: number | null;
};

export type MessageRow = {
  id: number;
  groupId: number;
  kind: "message" | "system";
  senderKey: string | null;
  body: string;
  systemEvent: string | null;
  audience: "super_admin" | null;
  clientId: string | null;
  replyToMessageId: number | null;
  stickerRef: string | null;
  stickerUrl: string | null;
  photoId: number | null;
  silent: boolean;
  deletedAt: Date | null;
  hiddenAt: Date | null;
  editedAt: Date | null;
  updatedAt: Date | null;
  createdAt: Date;
};

export type PhotoRow = {
  id: number;
  messageId: number;
  position: number | null;
  width: number;
  height: number;
};

export type ReactionRow = {
  messageId: number;
  reactorKey: string;
  emoji: string;
};

const GROUP_COLUMNS = `g.id, g.name, g.avatar_updated_at AS "avatarUpdatedAt",
  g.created_by_key AS "createdByKey", g.managers_only AS "managersOnly",
  g.last_message_id AS "lastMessageId", g.last_message_at AS "lastMessageAt",
  g.last_change_at AS "lastChangeAt", g.dissolved_at AS "dissolvedAt",
  g.created_at AS "createdAt"`;

const MESSAGE_COLUMNS = `m.id, m.group_id AS "groupId", m.kind,
  m.sender_key AS "senderKey", m.body, m.system_event AS "systemEvent",
  m.audience, m.client_id AS "clientId",
  m.reply_to_message_id AS "replyToMessageId", m.sticker_ref AS "stickerRef",
  m.sticker_url AS "stickerUrl", m.photo_id AS "photoId", m.silent,
  m.deleted_at AS "deletedAt", m.hidden_at AS "hiddenAt",
  m.edited_at AS "editedAt", m.updated_at AS "updatedAt",
  m.created_at AS "createdAt"`;

// Alerts are for super admins only.
const audienceSql = (actor: Pick<GroupActor, "isSuperAdmin">, alias = "m") =>
  actor.isSuperAdmin ? "TRUE" : `${alias}.audience IS NULL`;

// The super admins' member keys, for "explicit" (non super admin) rows.
const SUPER_ADMIN_KEYS = `(SELECT 'admin:' || a.id FROM admins a WHERE a.role = 'super_admin')`;

const isSuper = (session: GroupSession) =>
  session.kind === "admin" && session.role === "super_admin";

@Injectable()
export class GroupQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findGroup(
    groupId: number,
    runner: Runner = this.dataSource,
  ): Promise<GroupRow | null> {
    const rows: GroupRow[] = await runner.query(
      `SELECT ${GROUP_COLUMNS} FROM chat_groups g WHERE g.id = $1`,
      [groupId],
    );

    return rows[0] ?? null;
  }

  async findMember(
    groupId: number,
    memberKey: string,
    runner: Runner = this.dataSource,
  ): Promise<MemberRow | null> {
    const rows: MemberRow[] = await runner.query(
      `SELECT member_key AS "memberKey", left_at AS "leftAt", muted_at AS "mutedAt",
              last_read_message_id AS "lastReadMessageId"
       FROM chat_group_members WHERE group_id = $1 AND member_key = $2`,
      [groupId, memberKey],
    );

    return rows[0] ?? null;
  }

  // Explicit members that count for the cap and the member list: active rows
  // minus the lazy state rows of super admins.
  async countExplicitMembers(groupId: number, runner: Runner) {
    const rows: { total: number }[] = await runner.query(
      `SELECT count(*)::int AS total FROM chat_group_members
       WHERE group_id = $1 AND left_at IS NULL
         AND member_key NOT IN ${SUPER_ADMIN_KEYS}`,
      [groupId],
    );

    return rows[0]?.total ?? 0;
  }

  async superAdminIds(): Promise<number[]> {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM admins WHERE role = 'super_admin' ORDER BY id`,
    );

    return rows.map((row) => row.id);
  }

  async adminRole(adminId: number): Promise<string | null> {
    const rows: { role: string }[] = await this.dataSource.query(
      `SELECT role FROM admins WHERE id = $1`,
      [adminId],
    );

    return rows[0]?.role ?? null;
  }

  // --- Thread -------------------------------------------------------------

  // `after`: newer than the cursor, oldest first (polling). `before` or
  // nothing: the newest page older than the cursor, oldest first.
  async page(
    groupId: number,
    actor: GroupActor,
    { after, before }: { after?: number; before?: number },
  ) {
    const forward = after !== undefined;
    const cursor = after ?? before ?? null;
    const rows: MessageRow[] = await this.dataSource.query(
      `SELECT ${MESSAGE_COLUMNS} FROM chat_group_messages m
       WHERE m.group_id = $1 AND ${audienceSql(actor)}
         AND ($2::int IS NULL OR ${forward ? "m.id > $2" : "m.id < $2"})
       ORDER BY m.id ${forward ? "ASC" : "DESC"}
       LIMIT $3`,
      [groupId, cursor, GROUP_PAGE_SIZE + 1],
    );
    const page = rows.slice(0, GROUP_PAGE_SIZE);

    return {
      rows: forward ? page : page.reverse(),
      hasMore: rows.length > GROUP_PAGE_SIZE,
    };
  }

  // Messages edited, unsent, reacted to or hidden after `changedSince` (epoch
  // ms), oldest change first; same paging rule as the coach chat.
  async changes(
    groupId: number,
    actor: GroupActor,
    changedSince: number,
    lastChangeAt: number,
  ) {
    const rows: MessageRow[] = await this.dataSource.query(
      `SELECT ${MESSAGE_COLUMNS} FROM chat_group_messages m
       WHERE m.group_id = $1 AND ${audienceSql(actor)} AND m.updated_at > $2
       ORDER BY m.updated_at ASC, m.id ASC
       LIMIT $3`,
      [groupId, new Date(changedSince), CHAT_CHANGES_PAGE_SIZE + 1],
    );
    const truncated = rows.length > CHAT_CHANGES_PAGE_SIZE;
    const page = rows.slice(0, CHAT_CHANGES_PAGE_SIZE);

    return {
      rows: page,
      lastChangeAt: truncated
        ? (page[page.length - 1].updatedAt?.getTime() ?? lastChangeAt)
        : lastChangeAt,
    };
  }

  // One message of the group as this actor may see it (alerts only for super
  // admins).
  async message(
    groupId: number,
    messageId: number,
    actor: Pick<GroupActor, "isSuperAdmin">,
  ): Promise<MessageRow | null> {
    const rows: MessageRow[] = await this.dataSource.query(
      `SELECT ${MESSAGE_COLUMNS} FROM chat_group_messages m
       WHERE m.id = $1 AND m.group_id = $2 AND ${audienceSql(actor)}`,
      [messageId, groupId],
    );

    return rows[0] ?? null;
  }

  // The retry of a send: the same sender's message under the same key
  // (UNIQUE (group_id, sender_key, client_id)).
  async byClientId(groupId: number, senderKey: string, clientId: string) {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM chat_group_messages
       WHERE group_id = $1 AND sender_key = $2 AND client_id = $3`,
      [groupId, senderKey, clientId],
    );

    return rows[0]?.id ?? null;
  }

  async reactions(messageIds: number[]): Promise<ReactionRow[]> {
    return messageIds.length === 0
      ? []
      : this.dataSource.query(
          `SELECT message_id AS "messageId", reactor_key AS "reactorKey", emoji
           FROM chat_group_reactions WHERE message_id = ANY($1::int[])
           ORDER BY created_at, reactor_key`,
          [messageIds],
        );
  }

  // Sizes only, in display order (position, NULL as 0, then id).
  async photos(messageIds: number[]): Promise<PhotoRow[]> {
    return messageIds.length === 0
      ? []
      : this.dataSource.query(
          `SELECT id, message_id AS "messageId", position, width, height
           FROM chat_group_photos WHERE message_id = ANY($1::int[])
           ORDER BY COALESCE(position, 0), id`,
          [messageIds],
        );
  }

  async replyTargets(
    groupId: number,
    ids: number[],
    actor: Pick<GroupActor, "isSuperAdmin">,
  ): Promise<MessageRow[]> {
    return ids.length === 0
      ? []
      : this.dataSource.query(
          `SELECT ${MESSAGE_COLUMNS} FROM chat_group_messages m
           WHERE m.id = ANY($1::int[]) AND m.group_id = $2 AND ${audienceSql(actor)}`,
          [ids, groupId],
        );
  }

  // The reader cursors of the people who count for "Seen by": every active
  // member row (explicit members and the state rows of super admins).
  async readerCursors(groupId: number): Promise<GroupReaderCursor[]> {
    return this.dataSource.query(
      `SELECT member_key AS "memberKey", last_read_message_id AS "lastReadMessageId"
       FROM chat_group_members WHERE group_id = $1 AND left_at IS NULL`,
      [groupId],
    );
  }

  async edits(messageId: number) {
    const rows: { id: number; previousBody: string; editedAt: Date }[] =
      await this.dataSource.query(
        `SELECT id, previous_body AS "previousBody", edited_at AS "editedAt"
         FROM chat_group_message_edits WHERE message_id = $1 ORDER BY id`,
        [messageId],
      );

    return rows;
  }

  // --- Members ------------------------------------------------------------

  // Explicit active members plus every super admin (implicit), deduped. One
  // helper for the member list and the seen-by sheet.
  async memberKeys(groupId: number): Promise<string[]> {
    const [explicit, superIds] = await Promise.all([
      this.explicitMemberKeys(groupId),
      this.superAdminIds(),
    ]);

    return [...new Set([...superIds.map((id) => `admin:${id}`), ...explicit])];
  }

  async explicitMemberKeys(groupId: number): Promise<string[]> {
    const rows: { memberKey: string }[] = await this.dataSource.query(
      `SELECT member_key AS "memberKey" FROM chat_group_members
       WHERE group_id = $1 AND left_at IS NULL
         AND member_key NOT IN ${SUPER_ADMIN_KEYS}
       ORDER BY joined_at, member_key`,
      [groupId],
    );

    return rows.map((row) => row.memberKey);
  }

  // --- Inbox and unread ---------------------------------------------------

  // Groups this person sees in their list: a super admin every group that is
  // not dissolved, everyone else their active memberships.
  async visibleGroups(session: GroupSession): Promise<GroupRow[]> {
    if (isSuper(session)) {
      return this.dataSource.query(
        `SELECT ${GROUP_COLUMNS} FROM chat_groups g WHERE g.dissolved_at IS NULL`,
      );
    }
    return this.dataSource.query(
      `SELECT ${GROUP_COLUMNS} FROM chat_groups g
       JOIN chat_group_members cm ON cm.group_id = g.id
         AND cm.member_key = $1 AND cm.left_at IS NULL
       WHERE g.dissolved_at IS NULL`,
      [`${session.kind}:${session.id}`],
    );
  }

  // The same predicate as isGroupUnreadFor (contracts): not own, a message
  // (no system line or alert), not unsent or hidden, newer than the cursor
  // (NULL as 0); a super admin without a state row counts only messages from
  // when their account existed.
  async unreadByGroup(
    session: GroupSession,
    groupIds: number[],
  ): Promise<Map<number, number>> {
    if (groupIds.length === 0) {
      return new Map();
    }
    const key = `${session.kind}:${session.id}`;
    const rows: { groupId: number; unread: number }[] =
      await this.dataSource.query(
        `SELECT m.group_id AS "groupId", count(*)::int AS unread
         FROM chat_group_messages m
         LEFT JOIN chat_group_members cm
           ON cm.group_id = m.group_id AND cm.member_key = $2
         WHERE m.group_id = ANY($1::int[])
           AND m.kind = 'message' AND m.audience IS NULL
           AND m.deleted_at IS NULL AND m.hidden_at IS NULL
           AND m.sender_key <> $2
           AND m.id > COALESCE(cm.last_read_message_id, 0)
           AND ($3::boolean IS FALSE OR m.created_at >=
                (SELECT a.created_at FROM admins a WHERE a.id = $4))
         GROUP BY m.group_id`,
        [groupIds, key, isSuper(session), session.id],
      );

    return new Map(rows.map((row) => [row.groupId, row.unread]));
  }

  async mutedGroupIds(memberKey: string, groupIds: number[]) {
    const rows: { groupId: number }[] = groupIds.length
      ? await this.dataSource.query(
          `SELECT group_id AS "groupId" FROM chat_group_members
           WHERE member_key = $1 AND group_id = ANY($2::int[])
             AND muted_at IS NOT NULL`,
          [memberKey, groupIds],
        )
      : [];

    return new Set(rows.map((row) => row.groupId));
  }

  async lastMessages(
    ids: number[],
    superAdmin: boolean,
  ): Promise<(MessageRow & { photoCount: number })[]> {
    return ids.length === 0
      ? []
      : this.dataSource.query(
          `SELECT ${MESSAGE_COLUMNS},
             (SELECT count(*)::int FROM chat_group_photos p WHERE p.message_id = m.id)
               AS "photoCount"
           FROM chat_group_messages m
           WHERE m.id = ANY($1::int[]) AND ($2::boolean OR m.audience IS NULL)`,
          [ids, superAdmin],
        );
  }

  // --- Change cursor ------------------------------------------------------

  // Moves the group's change cursor (strictly increasing, whole
  // milliseconds) and stamps the message with it, so a change in the same
  // millisecond as a poll is never lost to `updated_at > changedSince`.
  async touch(
    manager: Runner,
    groupId: number,
    messageId: number,
    now: Date,
  ): Promise<Date> {
    const result: unknown = await manager.query(
      `UPDATE chat_groups
       SET last_change_at = date_trunc('milliseconds', GREATEST(
         COALESCE(last_change_at, 'epoch'::timestamptz) + interval '1 millisecond',
         $2::timestamptz))
       WHERE id = $1
       RETURNING last_change_at AS "lastChangeAt"`,
      [groupId, now],
    );
    const changedAt =
      returnedRows<{ lastChangeAt: Date }>(result)[0]?.lastChangeAt ?? now;

    await manager.query(
      `UPDATE chat_group_messages SET updated_at = $1 WHERE id = $2`,
      [changedAt, messageId],
    );
    return changedAt;
  }
}
