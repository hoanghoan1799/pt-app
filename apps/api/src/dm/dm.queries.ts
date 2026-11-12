import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  DM_MESSAGES,
  DM_PAGE_SIZE,
  type DmMessageView,
  resolveDisplayName,
  userActorKey,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import {
  CHAT_POST_QUOTES,
  type ChatPostQuoteReader,
} from "../chat/post-quote.port.js";
import { ContactAliasesService } from "../contact-aliases/contact-aliases.service.js";
import { avatarUrl } from "../files/image-rules.js";
import { previewTexts } from "../chat/preview-text.js";
import { dmAccessOf, dmPreviewText, otherMember } from "./dm.rules.js";

// Trainees have accepted the terms of the social network (spec T1).
const TERMS_VERSION = 1;

export type DmConversationRow = {
  id: number;
  userLow: number;
  userHigh: number;
  lastMessageId: number | null;
  lastMessageAt: Date | null;
};

// Who may open a trainee conversation (spec Q6, A7): its two members, a super
// admin read-only, a PT never; a block hides it from the members.
export type DmView = {
  conversation: DmConversationRow;
  access: "member" | "readonly_admin";
  // Members only: the other trainee.
  otherId: number | null;
  // Null = the member may send; otherwise why it is read-only. Always set
  // since owner decision 2026-11-09.
  readOnlyReason: string | null;
};

type MessageRow = {
  id: number;
  senderId: number;
  body: string | null;
  photoId: number | null;
  replyPostId: number | null;
  clientId: string;
  createdAt: Date;
};

export const dmPhotoUrl = (id: number) => `/v1/dm/photos/${id}`;

@Injectable()
export class DmQueries {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly aliases: ContactAliasesService,
    @Inject(CHAT_POST_QUOTES) private readonly postQuotes: ChatPostQuoteReader,
  ) {}

  async findConversation(id: number): Promise<DmConversationRow | null> {
    const rows: DmConversationRow[] = await this.dataSource.query(
      `SELECT id, user_low AS "userLow", user_high AS "userHigh",
              last_message_id AS "lastMessageId", last_message_at AS "lastMessageAt"
       FROM dm_conversations WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  // Real names of the given trainees, in the order asked; null for a deleted
  // account. For the super admin's read-only thread header.
  async memberNames(ids: number[]) {
    const rows: { id: number; name: string }[] = await this.dataSource.query(
      `SELECT id, name FROM users WHERE id = ANY($1::int[])`,
      [ids],
    );
    const names = new Map(rows.map((row) => [row.id, row.name]));

    return ids.map((id) => ({ id, name: names.get(id) ?? null }));
  }

  private async isBlockedBetween(a: number, b: number) {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM social_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [a, b],
    );

    return rows.length > 0;
  }

  private async hasAcceptedTerms(userId: number) {
    const rows: { termsVersion: number | null }[] = await this.dataSource.query(
      `SELECT terms_version AS "termsVersion" FROM users WHERE id = $1`,
      [userId],
    );

    return (rows[0]?.termsVersion ?? 0) >= TERMS_VERSION;
  }

  // null = not found / not allowed (callers answer 404 either way).
  async resolveView(
    actor: AuthActor,
    conversationId: number,
  ): Promise<DmView | null> {
    const conversation = await this.findConversation(conversationId);

    if (!conversation) {
      return null;
    }
    const members = { low: conversation.userLow, high: conversation.userHigh };
    const blocked =
      actor.kind === "user" && members.low !== members.high
        ? await this.isBlockedBetween(members.low, members.high)
        : false;
    const access = dmAccessOf(actor, members, blocked);

    if (access === "none") {
      return null;
    }
    if (access === "readonly_admin") {
      return {
        conversation,
        access,
        otherId: null,
        readOnlyReason: null,
      };
    }
    // Social pages sit behind the terms: without them nothing opens.
    if (!(await this.hasAcceptedTerms(actor.id))) {
      return null;
    }
    return {
      conversation,
      access,
      otherId: otherMember(members, actor.id),
      readOnlyReason: DM_MESSAGES.DISABLED,
    };
  }

  private async toViews(
    rows: MessageRow[],
    viewer: AuthActor,
  ): Promise<DmMessageView[]> {
    const photoIds = rows.flatMap((row) =>
      row.photoId === null ? [] : [row.photoId],
    );
    const postIds = rows.flatMap((row) =>
      row.replyPostId === null ? [] : [row.replyPostId],
    );
    const [photos, posts] = await Promise.all([
      photoIds.length === 0
        ? []
        : (this.dataSource.query(
            `SELECT id, width, height FROM dm_photos WHERE id = ANY($1::int[])`,
            [photoIds],
          ) as Promise<{ id: number; width: number; height: number }[]>),
      postIds.length === 0 ? new Map() : this.postQuotes.views(viewer, postIds),
    ]);
    const sizes = new Map(photos.map((photo) => [photo.id, photo]));

    return rows.map((row) => {
      const size = row.photoId === null ? undefined : sizes.get(row.photoId);

      return {
        id: row.id,
        senderId: row.senderId,
        body: row.body,
        photo:
          row.photoId !== null && size
            ? {
                url: dmPhotoUrl(row.photoId),
                width: size.width,
                height: size.height,
              }
            : null,
        post:
          row.replyPostId === null
            ? null
            : (posts.get(row.replyPostId) ?? null),
        clientId: row.clientId,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  // Newest page (no cursor), older (`before`) or newer (`after`) messages, in
  // ascending order. Unsent messages never come back; the latest unsent ids
  // ride along so a polling client can remove them.
  async listThread(
    conversationId: number,
    options: {
      after?: number;
      before?: number;
      otherId: number | null;
      viewer: AuthActor;
    },
  ) {
    const forward = options.after !== undefined;
    const cursor = options.after ?? options.before;
    const rows: MessageRow[] = await this.dataSource.query(
      `SELECT id, sender_id AS "senderId", body, photo_id AS "photoId",
              reply_post_id AS "replyPostId", client_id AS "clientId",
              created_at AS "createdAt"
       FROM dm_messages
       WHERE conversation_id = $1 AND deleted_at IS NULL
         ${cursor === undefined ? "" : forward ? "AND id > $3" : "AND id < $3"}
       ORDER BY id ${forward ? "ASC" : "DESC"}
       LIMIT $2`,
      cursor === undefined
        ? [conversationId, DM_PAGE_SIZE + 1]
        : [conversationId, DM_PAGE_SIZE + 1, cursor],
    );
    const hasMore = rows.length > DM_PAGE_SIZE;
    const page = rows.slice(0, DM_PAGE_SIZE);
    const ordered = forward ? page : page.reverse();
    const [deleted, read] = await Promise.all([
      this.dataSource.query(
        `SELECT id FROM dm_messages
         WHERE conversation_id = $1 AND deleted_at IS NOT NULL
         ORDER BY id DESC LIMIT $2`,
        [conversationId, DM_PAGE_SIZE * 2],
      ) as Promise<{ id: number }[]>,
      options.otherId === null
        ? Promise.resolve([])
        : (this.dataSource.query(
            `SELECT last_read_message_id AS id FROM dm_reads
             WHERE conversation_id = $1 AND user_id = $2`,
            [conversationId, options.otherId],
          ) as Promise<{ id: number }[]>),
    ]);

    return {
      messages: await this.toViews(ordered, options.viewer),
      deletedIds: deleted.map((row) => row.id),
      hasMore,
      otherReadUpTo: read[0]?.id ?? 0,
    };
  }

  // The member's conversations that are not hidden by a block.
  private async visibleConversations(userId: number) {
    const rows: DmConversationRow[] = await this.dataSource.query(
      `SELECT c.id, c.user_low AS "userLow", c.user_high AS "userHigh",
              c.last_message_id AS "lastMessageId", c.last_message_at AS "lastMessageAt"
       FROM dm_conversations c
       WHERE (c.user_low = $1 OR c.user_high = $1)
         AND NOT EXISTS (
           SELECT 1 FROM social_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = CASE WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low END)
              OR (b.blocked_id = $1 AND b.blocker_id = CASE WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low END))`,
      [userId],
    );

    return rows;
  }

  private async unreadByConversation(userId: number, ids: number[]) {
    if (ids.length === 0) {
      return new Map<number, number>();
    }
    const rows: { conversationId: number; count: number }[] =
      await this.dataSource.query(
        `SELECT m.conversation_id AS "conversationId", count(*)::int AS count
         FROM dm_messages m
         WHERE m.conversation_id = ANY($1::int[])
           AND m.deleted_at IS NULL AND m.sender_id <> $2
           AND m.id > COALESCE((SELECT r.last_read_message_id FROM dm_reads r
                                WHERE r.conversation_id = m.conversation_id
                                  AND r.user_id = $2), 0)
         GROUP BY m.conversation_id`,
        [ids, userId],
      );

    return new Map(rows.map((row) => [row.conversationId, row.count]));
  }

  // The tab-bar badge: unread messages across visible conversations.
  async countUnread(userId: number) {
    const conversations = await this.visibleConversations(userId);
    const unread = await this.unreadByConversation(
      userId,
      conversations.map((row) => row.id),
    );

    return [...unread.values()].reduce((total, count) => total + count, 0);
  }

  // Only conversations with a message are listed; an empty one would just be
  // clutter. The other member's name is my private nickname for them if any.
  async inbox(userId: number, locale?: string | null) {
    const conversations = await this.visibleConversations(userId);

    if (conversations.length === 0) {
      return [];
    }
    const otherIds = conversations.map((row) =>
      otherMember({ low: row.userLow, high: row.userHigh }, userId),
    );
    const lastIds = conversations.flatMap((row) =>
      row.lastMessageId === null ? [] : [row.lastMessageId],
    );
    const [people, lasts, unread, mine] = await Promise.all([
      this.dataSource.query(
        `SELECT id, name, avatar_updated_at AS "avatarUpdatedAt"
         FROM users WHERE id = ANY($1::int[])`,
        [otherIds],
      ) as Promise<
        { id: number; name: string; avatarUpdatedAt: Date | null }[]
      >,
      lastIds.length === 0
        ? []
        : (this.dataSource.query(
            `SELECT id, sender_id AS "senderId", body, photo_id AS "photoId",
                    deleted_at AS "deletedAt"
             FROM dm_messages WHERE id = ANY($1::int[])`,
            [lastIds],
          ) as Promise<
            {
              id: number;
              senderId: number;
              body: string | null;
              photoId: number | null;
              deletedAt: Date | null;
            }[]
          >),
      this.unreadByConversation(
        userId,
        conversations.map((row) => row.id),
      ),
      // My own nicknames for the people I talk to, nobody else's.
      this.aliases.loadAliases(
        userActorKey(userId),
        otherIds.map(userActorKey),
      ),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const lastById = new Map(lasts.map((message) => [message.id, message]));

    return conversations
      .flatMap((row) => {
        const otherId = otherMember(
          { low: row.userLow, high: row.userHigh },
          userId,
        );
        const person = personById.get(otherId);
        const last =
          row.lastMessageId === null
            ? undefined
            : lastById.get(row.lastMessageId);

        if (!person || !last) {
          return [];
        }
        return [
          {
            conversationId: row.id,
            otherId,
            name: resolveDisplayName(
              mine.get(userActorKey(otherId)),
              person.name,
            ),
            avatarUrl: avatarUrl("user", person.id, person.avatarUpdatedAt),
            preview: `${last.senderId === userId ? previewTexts(locale).you : ""}${dmPreviewText(last, locale)}`,
            lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
            unread: unread.get(row.id) ?? 0,
          },
        ];
      })
      .sort((a, b) =>
        (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
      );
  }

  // Super admin, read-only: every conversation, newest first.
  async adminList(locale?: string | null) {
    const rows: (DmConversationRow & {
      lowName: string | null;
      highName: string | null;
      lastBody: string | null;
      lastPhotoId: number | null;
      lastDeletedAt: Date | null;
      lastId: number | null;
    })[] = await this.dataSource.query(
      `SELECT c.id, c.user_low AS "userLow", c.user_high AS "userHigh",
              c.last_message_id AS "lastMessageId", c.last_message_at AS "lastMessageAt",
              lo.name AS "lowName", hi.name AS "highName",
              lm.id AS "lastId", lm.body AS "lastBody", lm.photo_id AS "lastPhotoId",
              lm.deleted_at AS "lastDeletedAt"
       FROM dm_conversations c
       LEFT JOIN users lo ON lo.id = c.user_low
       LEFT JOIN users hi ON hi.id = c.user_high
       LEFT JOIN dm_messages lm ON lm.id = c.last_message_id
       ORDER BY COALESCE(c.last_message_at, 'epoch'::timestamptz) DESC, c.id DESC`,
    );

    return rows.map((row) => ({
      id: row.id,
      lowName: row.lowName ?? previewTexts(locale).deletedAccount,
      highName: row.highName ?? previewTexts(locale).deletedAccount,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      preview:
        row.lastId === null
          ? ""
          : dmPreviewText(
              {
                body: row.lastBody,
                photoId: row.lastPhotoId,
                deletedAt: row.lastDeletedAt,
              },
              locale,
            ),
    }));
  }

  async existingBetween(low: number, high: number) {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM dm_conversations WHERE user_low = $1 AND user_high = $2`,
      [low, high],
    );

    return rows[0]?.id ?? null;
  }
}
