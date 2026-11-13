import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  CHAT_CHANGES_PAGE_SIZE,
  CHAT_JUMP_MAX_NEWER,
  CHAT_PAGE_SIZE,
  chatNextReadCursor,
} from "@pt/contracts";
import { DataSource, EntityManager } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { returnedRows } from "../common/sql.js";
import { ChatConversation } from "../database/entities/chat-conversation.entity.js";
import {
  type MessageContext,
  type MessageRow,
  type ReactionRow,
  type ReplyTargetRow,
} from "./chat.mapper.js";
import type { ConversationFacts } from "./chat.policy.js";
import {
  CHAT_POST_QUOTES,
  type ChatPostQuoteReader,
} from "./post-quote.port.js";

// The only columns that ever leave the server.
export const MESSAGE_SELECT = `
  SELECT m.id, m.conversation_id AS "conversationId", m.sender_role AS "senderRole",
         m.sender_admin_id AS "senderAdminId", a.username AS "senderAdminName",
         m.body, m.sticker_ref AS "stickerRef", m.sticker_url AS "stickerUrl",
         m.photo_id AS "photoId", m.client_id AS "clientId",
         m.created_at AS "createdAt", m.reply_to_message_id AS "replyToMessageId",
         m.reply_post_id AS "replyPostId", m.edited_at AS "editedAt",
         m.deleted_at AS "deletedAt", m.updated_at AS "updatedAt"
  FROM chat_messages m
  LEFT JOIN admins a ON a.id = m.sender_admin_id`;

export type ConversationRow = {
  id: number;
  userId: number;
  lastMessageId: number | null;
  lastChangeAt: Date | null;
};

export type TraineeFactsRow = ConversationFacts & {
  name: string;
  lastSeenAt: Date | null;
  avatarUpdatedAt: Date | null;
};

// Read models of the chat: SQL in one place, rows out. Names, ids and cursors
// only; the mapper turns rows into DTOs.
@Injectable()
export class ChatQueries {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CHAT_POST_QUOTES) private readonly postQuotes: ChatPostQuoteReader,
  ) {}

  private run<T>(
    sql: string,
    params: unknown[] = [],
    manager?: EntityManager,
  ): Promise<T> {
    return (manager ?? this.dataSource).query(sql, params);
  }

  // --- Conversations and trainees -------------------------------------------

  async findConversationByUserId(
    userId: number,
    manager?: EntityManager,
  ): Promise<ConversationRow | null> {
    const rows = await this.run<ConversationRow[]>(
      `SELECT id, user_id AS "userId", last_message_id AS "lastMessageId",
              last_change_at AS "lastChangeAt"
       FROM chat_conversations WHERE user_id = $1`,
      [userId],
      manager,
    );

    return rows[0] ?? null;
  }

  async findConversationById(id: number): Promise<ConversationRow | null> {
    const rows = await this.run<ConversationRow[]>(
      `SELECT id, user_id AS "userId", last_message_id AS "lastMessageId",
              last_change_at AS "lastChangeAt"
       FROM chat_conversations WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  // Race-safe and idempotent: insert-or-ignore on the unique user_id, then
  // read. Two first sends, an enable and a thread read at once all end with the
  // same row. Pass `manager` to run inside a transaction.
  async getOrCreateConversation(
    userId: number,
    manager?: EntityManager,
  ): Promise<ConversationRow> {
    await (manager ?? this.dataSource)
      .createQueryBuilder()
      .insert()
      .into(ChatConversation)
      .values({ userId })
      .orIgnore()
      .execute();

    const conversation = await this.findConversationByUserId(userId, manager);

    if (!conversation) {
      throw new Error("Chat conversation missing right after insert");
    }
    return conversation;
  }

  // The trainee behind a conversation, with the facts the policy decides on.
  // `adminId` is the calling admin (for their hidden list), null for a trainee.
  async findTraineeFacts(
    userId: number,
    adminId: number | null,
  ): Promise<TraineeFactsRow | null> {
    const rows = await this.run<
      {
        traineeId: number;
        name: string;
        ptAdminId: number | null;
        chatEnabled: boolean | null;
        lastSeenAt: Date | null;
        avatarUpdatedAt: Date | null;
        hidden: boolean;
      }[]
    >(
      `SELECT u.id AS "traineeId", u.name, u.pt_admin_id AS "ptAdminId",
              u.chat_enabled AS "chatEnabled", u.last_seen_at AS "lastSeenAt",
              u.avatar_updated_at AS "avatarUpdatedAt",
              ($2::int IS NOT NULL AND EXISTS (
                SELECT 1 FROM admin_hidden_users h
                WHERE h.admin_id = $2 AND h.user_id = u.id)) AS hidden
       FROM users u WHERE u.id = $1`,
      [userId, adminId],
    );
    const row = rows[0];

    return row
      ? {
          traineeId: row.traineeId,
          name: row.name,
          ptAdminId: row.ptAdminId,
          chatEnabled: row.chatEnabled === true,
          lastSeenAt: row.lastSeenAt,
          avatarUpdatedAt: row.avatarUpdatedAt,
          hidden: row.hidden,
        }
      : null;
  }

  async findStoredMessage(messageId: number, manager?: EntityManager) {
    const rows = await this.run<
      {
        id: number;
        conversationId: number;
        senderRole: "user" | "admin";
        senderAdminId: number | null;
        body: string;
        stickerRef: string | null;
        deletedAt: Date | null;
        clientId: string;
      }[]
    >(
      `SELECT id, conversation_id AS "conversationId", sender_role AS "senderRole",
              sender_admin_id AS "senderAdminId", body, sticker_ref AS "stickerRef",
              deleted_at AS "deletedAt", client_id AS "clientId"
       FROM chat_messages WHERE id = $1`,
      [messageId],
      manager,
    );

    return rows[0] ?? null;
  }

  async findStoredByClientId(
    conversationId: number,
    senderRole: "user" | "admin",
    senderAdminId: number | null,
    clientId: string,
    manager?: EntityManager,
  ) {
    const rows = await this.run<{ id: number }[]>(
      `SELECT id FROM chat_messages
       WHERE conversation_id = $1 AND sender_role = $2
         AND COALESCE(sender_admin_id, 0) = COALESCE($3::integer, 0) AND client_id = $4`,
      [conversationId, senderRole, senderAdminId, clientId],
      manager,
    );

    return rows[0] ?? null;
  }

  // --- Messages ---------------------------------------------------------------

  // Loads everything the rows point at in batches, for the mapper.
  async loadContext(
    rows: MessageRow[],
    viewer?: AuthActor,
  ): Promise<MessageContext> {
    const context: MessageContext = {
      targets: new Map(),
      reactions: new Map(),
      traineeNames: new Map(),
      photoSizes: new Map(),
      posts: new Map(),
    };

    if (rows.length === 0) {
      return context;
    }
    const live = rows.filter((row) => row.deletedAt === null);
    const replyIds = [
      ...new Set(
        live.flatMap((row) =>
          row.replyToMessageId === null ? [] : [row.replyToMessageId],
        ),
      ),
    ];
    const photoIds = [
      ...new Set(
        live.flatMap((row) => (row.photoId === null ? [] : [row.photoId])),
      ),
    ];
    const postIds = viewer
      ? [
          ...new Set(
            live.flatMap((row) =>
              row.replyPostId === null ? [] : [row.replyPostId],
            ),
          ),
        ]
      : [];
    const conversationIds = [...new Set(rows.map((row) => row.conversationId))];
    const [targets, reactions, trainees, photos, posts] = await Promise.all([
      replyIds.length === 0
        ? []
        : this.run<ReplyTargetRow[]>(
            `SELECT id, conversation_id AS "conversationId", body,
                    sticker_ref AS "stickerRef", photo_id AS "photoId",
                    sender_role AS "senderRole", deleted_at AS "deletedAt"
             FROM chat_messages WHERE id = ANY($1::int[])`,
            [replyIds],
          ),
      live.length === 0
        ? []
        : this.run<ReactionRow[]>(
            `SELECT r.message_id AS "messageId", r.reactor_key AS "reactorKey",
                    r.emoji, a.username AS "adminName"
             FROM chat_reactions r
             LEFT JOIN admins a ON r.reactor_key = 'admin:' || a.id
             WHERE r.message_id = ANY($1::int[])
             ORDER BY r.created_at ASC, r.reactor_key ASC`,
            [live.map((row) => row.id)],
          ),
      this.run<{ conversationId: number; name: string }[]>(
        `SELECT c.id AS "conversationId", u.name
         FROM chat_conversations c JOIN users u ON u.id = c.user_id
         WHERE c.id = ANY($1::int[])`,
        [conversationIds],
      ),
      photoIds.length === 0
        ? []
        : // Size only: the bytes are served by GET /v1/chat/photos/:id.
          this.run<{ id: number; width: number; height: number }[]>(
            `SELECT id, width, height FROM chat_photos WHERE id = ANY($1::int[])`,
            [photoIds],
          ),
      viewer && postIds.length > 0
        ? this.postQuotes.views(viewer, postIds)
        : new Map(),
    ]);

    for (const target of targets) {
      context.targets.set(target.id, target);
    }
    for (const reaction of reactions) {
      const list = context.reactions.get(reaction.messageId) ?? [];

      list.push(reaction);
      context.reactions.set(reaction.messageId, list);
    }
    for (const trainee of trainees) {
      context.traineeNames.set(trainee.conversationId, trainee.name);
    }
    for (const photo of photos) {
      context.photoSizes.set(photo.id, photo);
    }
    context.posts = posts;
    return context;
  }

  findMessageRow(messageId: number, manager?: EntityManager) {
    return this.run<MessageRow[]>(
      `${MESSAGE_SELECT} WHERE m.id = $1`,
      [messageId],
      manager,
    ).then((rows) => rows[0] ?? null);
  }

  // `after`: newer than the cursor, oldest first (polling). `before` or
  // nothing: the newest page older than the cursor, returned oldest first;
  // hasMore says whether even older messages exist.
  async listMessageRows(
    conversationId: number,
    { after, before }: { after?: number; before?: number },
  ) {
    const forward = after !== undefined;
    const cursor = after ?? before;
    const rows = await this.run<MessageRow[]>(
      `${MESSAGE_SELECT}
       WHERE m.conversation_id = $1
         ${cursor === undefined ? "" : forward ? "AND m.id > $3" : "AND m.id < $3"}
       ORDER BY m.id ${forward ? "ASC" : "DESC"}
       LIMIT $2`,
      cursor === undefined
        ? [conversationId, CHAT_PAGE_SIZE + 1]
        : [conversationId, CHAT_PAGE_SIZE + 1, cursor],
    );
    const hasMore = rows.length > CHAT_PAGE_SIZE;
    const page = rows.slice(0, CHAT_PAGE_SIZE);

    return { rows: forward ? page : page.reverse(), hasMore };
  }

  // The thread as the chat opens it for a jump to `messageId`: the page that
  // ends at the target plus every newer message, so it still joins up with the
  // newest and the poll cursor stays valid. Null when the message is not in
  // this conversation or too far back.
  async listRowsAround(conversationId: number, messageId: number) {
    const target = await this.run<{ id: number }[]>(
      `SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2`,
      [messageId, conversationId],
    );

    if (target.length === 0) {
      return null;
    }
    const [older, newer] = await Promise.all([
      this.listMessageRows(conversationId, { before: messageId + 1 }),
      this.run<MessageRow[]>(
        `${MESSAGE_SELECT}
         WHERE m.conversation_id = $1 AND m.id > $2
         ORDER BY m.id ASC LIMIT $3`,
        [conversationId, messageId, CHAT_JUMP_MAX_NEWER + 1],
      ),
    ]);

    if (newer.length > CHAT_JUMP_MAX_NEWER) {
      return null;
    }
    return { rows: [...older.rows, ...newer], hasMore: older.hasMore };
  }

  // Messages edited, unsent or reacted to after `changedSince` (epoch ms),
  // oldest change first. When more than one page changed, lastChangeAt is the
  // newest change actually returned so the next request continues from there.
  async listChangeRows(
    conversationId: number,
    changedSince: number,
    lastChangeAt: number,
  ) {
    const rows = await this.run<MessageRow[]>(
      `${MESSAGE_SELECT}
       WHERE m.conversation_id = $1 AND m.updated_at > $2
       ORDER BY m.updated_at ASC, m.id ASC
       LIMIT $3`,
      [conversationId, new Date(changedSince), CHAT_CHANGES_PAGE_SIZE + 1],
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

  // Previous bodies of one message, oldest first.
  listEditHistory(messageId: number) {
    return this.run<{ previousBody: string; editedAt: Date }[]>(
      `SELECT previous_body AS "previousBody", edited_at AS "editedAt"
       FROM chat_message_edits WHERE message_id = $1 ORDER BY id ASC`,
      [messageId],
    );
  }

  // Moves the change cursor of one conversation (strictly increasing, in whole
  // milliseconds) without touching a message; the cursor defeats the 204 fast
  // path. Returns the new cursor.
  async bumpConversationChange(
    manager: EntityManager,
    conversationId: number,
    now: Date,
  ): Promise<Date> {
    const result = await this.run<unknown>(
      `UPDATE chat_conversations
       SET last_change_at = date_trunc('milliseconds', GREATEST(
         COALESCE(last_change_at, 'epoch'::timestamptz) + interval '1 millisecond',
         $2::timestamptz))
       WHERE id = $1
       RETURNING last_change_at AS "lastChangeAt"`,
      [conversationId, now],
      manager,
    );

    return returnedRows<{ lastChangeAt: Date }>(result)[0]?.lastChangeAt ?? now;
  }

  // The same bump for every conversation an account colour shows in: the
  // trainee's own, or those an admin takes part in (all of them for a super
  // admin, their trainees' for a PT). Returns each moved conversation.
  async bumpConversationsOf(
    scope: { traineeUserId: number } | { ptAdminId: number | null },
    now: Date,
  ) {
    const filter =
      "traineeUserId" in scope
        ? { where: "user_id = $2", params: [scope.traineeUserId] }
        : scope.ptAdminId === null
          ? { where: "TRUE", params: [] }
          : {
              where: "user_id IN (SELECT id FROM users WHERE pt_admin_id = $2)",
              params: [scope.ptAdminId],
            };
    const result = await this.run<unknown>(
      `UPDATE chat_conversations
       SET last_change_at = date_trunc('milliseconds', GREATEST(
         COALESCE(last_change_at, 'epoch'::timestamptz) + interval '1 millisecond',
         $1::timestamptz))
       WHERE ${filter.where}
       RETURNING id, user_id AS "userId", last_change_at AS "lastChangeAt"`,
      [now, ...filter.params],
    );

    return returnedRows<{ id: number; userId: number; lastChangeAt: Date }>(
      result,
    );
  }

  // --- Reads ------------------------------------------------------------------

  // "Đã xem" for the other side. A trainee sees the furthest any PT has read;
  // a PT sees the trainee's own cursor.
  async peerReadCursor(conversationId: number, viewer: "user" | "admin") {
    const rows = await this.run<{ value: number | null }[]>(
      `SELECT max(last_read_message_id) AS value FROM chat_reads
       WHERE conversation_id = $1 AND ${
         viewer === "user" ? "reader_key LIKE 'admin:%'" : "reader_key = 'user'"
       }`,
      [conversationId],
    );

    return rows[0]?.value ?? 0;
  }

  // Upserts a reader's cursor. GREATEST keeps it from going backwards even
  // when two requests race. Returns the saved value.
  async saveReadCursor(
    conversationId: number,
    readerKey: string,
    requested: number,
    lastMessageId: number,
    now: Date,
  ) {
    const current = await this.run<{ value: number }[]>(
      `SELECT last_read_message_id AS value FROM chat_reads
       WHERE conversation_id = $1 AND reader_key = $2`,
      [conversationId, readerKey],
    );
    const next = chatNextReadCursor(
      current[0]?.value ?? 0,
      requested,
      lastMessageId,
    );
    const saved = await this.run<{ value: number }[]>(
      `INSERT INTO chat_reads (conversation_id, reader_key, last_read_message_id, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (conversation_id, reader_key) DO UPDATE
         SET last_read_message_id = GREATEST(chat_reads.last_read_message_id, EXCLUDED.last_read_message_id),
             updated_at = EXCLUDED.updated_at
       RETURNING last_read_message_id AS value`,
      [conversationId, readerKey, next, now],
    );

    return saved[0].value;
  }

  // Messages from the other side that this reader has not read yet, per
  // conversation (unsent ones still count, like the web). For an admin the
  // hidden and out-of-workspace conversations are left out.
  unreadByConversation(
    senderRole: "user" | "admin",
    readerKey: string,
    options: { conversationId?: number; adminId?: number } = {},
  ) {
    const params: unknown[] = [senderRole, readerKey];
    let extra = "";

    if (options.conversationId !== undefined) {
      params.push(options.conversationId);
      extra += ` AND m.conversation_id = $${params.length}`;
    }
    if (options.adminId !== undefined) {
      params.push(options.adminId);
      const admin = `$${params.length}`;

      extra += `
        AND NOT EXISTS (SELECT 1 FROM admin_hidden_users h
                        WHERE h.admin_id = ${admin} AND h.user_id = c.user_id)
        AND (u.pt_admin_id = ${admin} OR NOT EXISTS (
              SELECT 1 FROM admins ad WHERE ad.id = ${admin} AND ad.role = 'pt'))`;
    }
    return this.run<{ conversationId: number; unread: number }[]>(
      `SELECT m.conversation_id AS "conversationId", count(*)::int AS unread
       FROM chat_messages m
       JOIN chat_conversations c ON c.id = m.conversation_id
       JOIN users u ON u.id = c.user_id
       LEFT JOIN chat_reads r
         ON r.conversation_id = m.conversation_id AND r.reader_key = $2
       WHERE m.sender_role = $1
         AND m.id > COALESCE(r.last_read_message_id, 0)${extra}
       GROUP BY m.conversation_id`,
      params,
    );
  }

  // Newest unread incoming message that is neither /imlang silent nor unsent,
  // per conversation. The bubble host pops when this grows.
  async latestLoudIncomingIds(
    senderRole: "user" | "admin",
    readerKey: string,
    conversationIds: number[],
  ) {
    if (conversationIds.length === 0) {
      return new Map<number, number>();
    }
    const rows = await this.run<{ conversationId: number; latest: number }[]>(
      `SELECT m.conversation_id AS "conversationId", max(m.id) AS latest
       FROM chat_messages m
       LEFT JOIN chat_reads r
         ON r.conversation_id = m.conversation_id AND r.reader_key = $2
       WHERE m.conversation_id = ANY($3::int[])
         AND m.sender_role = $1
         AND m.deleted_at IS NULL
         AND COALESCE(m.silent, false) = false
         AND m.id > COALESCE(r.last_read_message_id, 0)
       GROUP BY m.conversation_id`,
      [senderRole, readerKey, conversationIds],
    );

    return new Map(rows.map((row) => [row.conversationId, row.latest]));
  }

  // The PT who wrote the newest admin message, for the trainee's header. Null
  // when no admin has written yet; `name` is null when that admin was deleted.
  async latestAdminSender(conversationId: number) {
    const rows = await this.run<{ id: number | null; name: string | null }[]>(
      `SELECT m.sender_admin_id AS id, a.username AS name
       FROM chat_messages m LEFT JOIN admins a ON a.id = m.sender_admin_id
       WHERE m.conversation_id = $1 AND m.sender_role = 'admin'
       ORDER BY m.id DESC LIMIT 1`,
      [conversationId],
    );

    return rows[0] ?? null;
  }

  // Newest heartbeat across all PTs (shared inbox). Admins who turned their
  // presence switch off are left out; null when none is left.
  async adminTeamLastSeen() {
    const rows = await this.run<{ lastSeenAt: Date | null }[]>(
      `SELECT max(last_seen_at) AS "lastSeenAt" FROM admins
       WHERE presence_hidden IS NOT TRUE`,
    );

    return rows[0]?.lastSeenAt ?? null;
  }

  // Colours: the trainee's, every admin's account colour, and this
  // conversation's per-admin overrides.
  async colorRows(conversationId: number) {
    const [trainee, admins, overrides] = await Promise.all([
      this.run<{ color: string | null }[]>(
        `SELECT u.chat_color AS color FROM chat_conversations c
         JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
        [conversationId],
      ),
      this.run<{ id: number; color: string }[]>(
        `SELECT id, chat_color AS color FROM admins WHERE chat_color IS NOT NULL`,
      ),
      this.run<{ adminId: number; color: string }[]>(
        `SELECT admin_id AS "adminId", color FROM chat_color_overrides
         WHERE conversation_id = $1`,
        [conversationId],
      ),
    ]);

    return { trainee: trainee[0]?.color ?? null, admins, overrides };
  }
}
