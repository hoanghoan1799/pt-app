import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  CHAT_USER_READER_KEY,
  chatAdminReaderKey,
  resolveDisplayName,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AdminActor, UserActor } from "../auth/actor.js";
import { ContactAliasesService } from "../contact-aliases/contact-aliases.service.js";
import { DmQueries } from "../dm/dm.queries.js";
import { avatarUrl } from "../files/image-rules.js";
import { inboxPreview } from "./chat.mapper.js";
import { ChatPolicy } from "./chat.policy.js";
import { ChatQueries } from "./chat.queries.js";
import { ChatProfileService } from "./chat-profile.service.js";

const iso = (date: Date | null) => date?.toISOString() ?? null;

// Admin scope in SQL: a PT only sees trainees assigned to them.
const SCOPE = `(u.pt_admin_id = $1 OR NOT EXISTS (
  SELECT 1 FROM admins ad WHERE ad.id = $1 AND ad.role = 'pt'))`;

// The inbox, the unread badges, the conversation header and the bubbles.
@Injectable()
export class ChatInboxService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: ChatQueries,
    private readonly aliases: ContactAliasesService,
    private readonly dm: DmQueries,
    private readonly policy: ChatPolicy,
    private readonly profiles: ChatProfileService,
  ) {}

  // `hidden: false` is the normal inbox (this admin's hidden trainees left
  // out); `hidden: true` is only those, and only while the session revealed
  // them with the passcode (KAN-163): otherwise it is empty.
  async inbox(admin: AdminActor, hidden: boolean) {
    if (hidden && !admin.revealed) {
      return { conversations: [], withoutConversation: [] };
    }
    const hiddenClause = `${hidden ? "" : "NOT "}EXISTS (
      SELECT 1 FROM admin_hidden_users h WHERE h.admin_id = $1 AND h.user_id = u.id)`;
    const [rows, unreadRows, fresh] = await Promise.all([
      this.dataSource.query(
        `SELECT c.id AS "conversationId", u.id AS "userId", u.name AS "userName",
                u.chat_enabled AS "chatEnabled", u.last_seen_at AS "lastSeenAt",
                u.avatar_updated_at AS "avatarUpdatedAt",
                lm.body AS "lastBody", lm.sticker_ref AS "lastStickerRef",
                lm.photo_id AS "lastPhotoId", lm.deleted_at AS "lastDeletedAt",
                lm.sender_role AS "lastSenderRole",
                lm.sender_admin_id AS "lastSenderAdminId",
                la.username AS "lastSenderAdminName",
                c.last_message_at AS "lastMessageAt"
         FROM chat_conversations c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN chat_messages lm ON lm.id = c.last_message_id
         LEFT JOIN admins la ON la.id = lm.sender_admin_id
         WHERE ${hiddenClause} AND ${SCOPE}
         ORDER BY c.last_message_at IS NULL, c.last_message_at DESC, c.id DESC`,
        [admin.id],
      ) as Promise<
        {
          conversationId: number;
          userId: number;
          userName: string;
          chatEnabled: boolean | null;
          lastSeenAt: Date | null;
          avatarUpdatedAt: Date | null;
          lastBody: string | null;
          lastStickerRef: string | null;
          lastPhotoId: number | null;
          lastDeletedAt: Date | null;
          lastSenderRole: "user" | "admin" | null;
          lastSenderAdminId: number | null;
          lastSenderAdminName: string | null;
          lastMessageAt: Date | null;
        }[]
      >,
      this.queries.unreadByConversation("user", chatAdminReaderKey(admin.id)),
      this.dataSource.query(
        `SELECT u.id AS "userId", u.name AS "userName", u.last_seen_at AS "lastSeenAt",
                u.avatar_updated_at AS "avatarUpdatedAt"
         FROM users u
         LEFT JOIN chat_conversations c ON c.user_id = u.id
         WHERE u.chat_enabled = true AND c.id IS NULL AND ${hiddenClause} AND ${SCOPE}
         ORDER BY u.name ASC`,
        [admin.id],
      ) as Promise<
        {
          userId: number;
          userName: string;
          lastSeenAt: Date | null;
          avatarUpdatedAt: Date | null;
        }[]
      >,
    ]);
    const nicknames = await this.aliases.loadTraineeAliases(
      admin.id,
      rows.map((row) => row.userId),
    );
    const unreadById = new Map(
      unreadRows.map((row) => [row.conversationId, row.unread]),
    );

    return {
      conversations: rows.map((row) => ({
        conversationId: row.conversationId,
        userId: row.userId,
        userName: row.userName,
        displayName: resolveDisplayName(
          nicknames.get(row.userId),
          row.userName,
        ),
        chatEnabled: row.chatEnabled === true,
        preview: inboxPreview({
          body: row.lastBody,
          stickerRef: row.lastStickerRef,
          photoId: row.lastPhotoId,
          deletedAt: row.lastDeletedAt,
        }),
        lastFromAdmin: row.lastSenderRole === "admin",
        lastSenderAdminId: row.lastSenderAdminId,
        lastSenderAdminName: row.lastSenderAdminName,
        lastMessageAt: iso(row.lastMessageAt),
        unread: unreadById.get(row.conversationId) ?? 0,
        lastSeenAt: iso(row.lastSeenAt),
        avatarUrl: avatarUrl("user", row.userId, row.avatarUpdatedAt),
      })),
      withoutConversation: fresh.map((row) => ({
        userId: row.userId,
        userName: row.userName,
        lastSeenAt: iso(row.lastSeenAt),
        avatarUrl: avatarUrl("user", row.userId, row.avatarUpdatedAt),
      })),
    };
  }

  // Badge poll. Trainee: unread count plus what decides whether the tab shows
  // at all (the coach chat and the friend chats both count).
  async unreadForTrainee(actor: UserActor) {
    const [conversation, trainee, dmCount] = await Promise.all([
      this.queries.findConversationByUserId(actor.id),
      this.queries.findTraineeFacts(actor.id, null),
      this.dm.countUnread(actor.id),
    ]);
    const unread = conversation
      ? await this.queries.unreadByConversation("admin", CHAT_USER_READER_KEY, {
          conversationId: conversation.id,
        })
      : [];
    const coachCount = unread[0]?.unread ?? 0;
    const loud = conversation
      ? await this.queries.latestLoudIncomingIds(
          "admin",
          CHAT_USER_READER_KEY,
          [conversation.id],
        )
      : new Map<number, number>();

    return {
      count: coachCount + dmCount,
      coachCount,
      dmCount,
      chatEnabled: trainee?.chatEnabled ?? false,
      hasHistory: conversation?.lastMessageId != null,
      latestLoudIncomingId: conversation
        ? (loud.get(conversation.id) ?? null)
        : null,
    };
  }

  // Admin: the unread total and the count per trainee (hidden and
  // out-of-workspace trainees left out).
  async unreadForAdmin(admin: AdminActor) {
    const readerKey = chatAdminReaderKey(admin.id);
    const unreadRows = await this.queries.unreadByConversation(
      "user",
      readerKey,
      { adminId: admin.id },
    );

    if (unreadRows.length === 0) {
      return { count: 0, perTrainee: [] };
    }
    const ids = unreadRows.map((row) => row.conversationId);
    const [owners, loud] = await Promise.all([
      this.dataSource.query(
        `SELECT id, user_id AS "userId" FROM chat_conversations WHERE id = ANY($1::int[])`,
        [ids],
      ) as Promise<{ id: number; userId: number }[]>,
      this.queries.latestLoudIncomingIds("user", readerKey, ids),
    ]);
    const userByConversation = new Map(
      owners.map((row) => [row.id, row.userId]),
    );
    const perTrainee = unreadRows.flatMap((row) => {
      const userId = userByConversation.get(row.conversationId);

      return userId === undefined
        ? []
        : [
            {
              userId,
              conversationId: row.conversationId,
              unread: row.unread,
              latestLoudIncomingId: loud.get(row.conversationId) ?? null,
            },
          ];
    });

    return {
      count: perTrainee.reduce((total, row) => total + row.unread, 0),
      perTrainee,
    };
  }

  // The header of a conversation for an admin: the trainee as this admin sees
  // them (private nickname), chat switch, presence and the colours/nicknames.
  async header(
    admin: AdminActor,
    trainee: {
      traineeId: number;
      name: string;
      chatEnabled: boolean;
      lastSeenAt: Date | null;
      avatarUpdatedAt: Date | null;
    },
    conversationId: number | null,
  ) {
    const nicknames = await this.aliases.loadTraineeAliases(admin.id, [
      trainee.traineeId,
    ]);

    return {
      conversationId,
      userId: trainee.traineeId,
      userName: trainee.name,
      displayName: resolveDisplayName(
        nicknames.get(trainee.traineeId),
        trainee.name,
      ),
      chatEnabled: trainee.chatEnabled,
      avatarUrl: avatarUrl("user", trainee.traineeId, trainee.avatarUpdatedAt),
      lastSeenAt: iso(trainee.lastSeenAt),
      profile:
        conversationId === null
          ? { nicknames: {}, colors: {} }
          : await this.profiles.load(conversationId, admin, trainee.traineeId),
    };
  }

  // Name, photo and presence of the chats the signed-in person keeps as
  // bubbles. Trainee: their coach chat only (nothing while chat is off or
  // before the first message). Admin: the listed trainees they may open and
  // whose chat is on; unknown, hidden and out-of-workspace ids are missing.
  async bubblesForTrainee(actor: UserActor) {
    const [conversation, trainee] = await Promise.all([
      this.queries.findConversationByUserId(actor.id),
      this.queries.findTraineeFacts(actor.id, null),
    ]);

    if (!conversation || !trainee?.chatEnabled) {
      return [];
    }
    const [profile, latest, teamLastSeen] = await Promise.all([
      this.profiles.load(conversation.id, actor, actor.id),
      this.queries.latestAdminSender(conversation.id),
      this.queries.adminTeamLastSeen(),
    ]);
    const adminPhoto = latest?.id
      ? await this.dataSource.query(
          `SELECT avatar_updated_at AS "updatedAt" FROM admins WHERE id = $1`,
          [latest.id],
        )
      : [];
    const realName = latest?.name ?? "PT của bạn";

    return [
      {
        userId: actor.id,
        conversationId: conversation.id,
        name: profile.nicknames.pt?.trim() || realName,
        avatarUrl: latest?.id
          ? avatarUrl("admin", latest.id, adminPhoto[0]?.updatedAt)
          : null,
        lastSeenAt: iso(teamLastSeen),
      },
    ];
  }

  async bubblesForAdmin(admin: AdminActor, userIds: number[]) {
    const rows = await Promise.all(
      userIds.map(async (userId) => {
        const trainee = await this.queries.findTraineeFacts(userId, admin.id);

        if (
          !trainee ||
          !trainee.chatEnabled ||
          !this.policy.canRead(admin, trainee)
        ) {
          return null;
        }
        const conversation =
          await this.queries.findConversationByUserId(userId);

        if (!conversation) {
          return null;
        }
        const nicknames = await this.aliases.loadTraineeAliases(admin.id, [
          userId,
        ]);

        return {
          userId,
          conversationId: conversation.id,
          name: resolveDisplayName(nicknames.get(userId), trainee.name),
          avatarUrl: avatarUrl("user", userId, trainee.avatarUpdatedAt),
          lastSeenAt: iso(trainee.lastSeenAt),
        };
      }),
    );

    return rows.flatMap((row) => (row ? [row] : []));
  }
}
