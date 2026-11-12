import "server-only";

import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  dmConversations,
  dmMessages,
  dmPhotos,
  dmReads,
  users,
} from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import { loadAliases } from "@/features/contact-aliases/services/contact-aliases";
import {
  overlayName,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";
import { DM_PAGE_SIZE } from "@/features/social/constants/dm";
import { loadReplyPostViews } from "@/features/social/services/dm-reply-post";
import { listBlockedBetweenIds } from "@/features/social/services/relationships";
import type {
  DmMessageView,
  DmReplyPostView,
  DmThreadPage,
} from "@/features/social/types/dm";
import type { SocialActor } from "@/features/social/types/social";
import {
  dmPhotoUrl,
  dmPreview,
  otherMember,
} from "@/features/social/utils/dm-rules";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

export type { DmMessageView, DmThreadPage };

const toView = (
  row: typeof dmMessages.$inferSelect,
  photos: Map<number, { width: number; height: number }>,
  posts: Map<number, DmReplyPostView>,
): DmMessageView => {
  const size = row.photoId === null ? undefined : photos.get(row.photoId);

  return {
    id: row.id,
    senderId: row.senderId,
    body: row.body,
    photo:
      row.photoId !== null && size
        ? { url: dmPhotoUrl(row.photoId), ...size }
        : null,
    post:
      row.replyPostId === null ? null : (posts.get(row.replyPostId) ?? null),
    clientId: row.clientId,
    createdAt: row.createdAt.toISOString(),
  };
};

const loadPhotoSizes = async (photoIds: number[]) => {
  if (photoIds.length === 0) {
    return new Map<number, { width: number; height: number }>();
  }
  const rows = await db
    .select({ id: dmPhotos.id, width: dmPhotos.width, height: dmPhotos.height })
    .from(dmPhotos)
    .where(inArray(dmPhotos.id, photoIds));

  return new Map(
    rows.map((row) => [row.id, { width: row.width, height: row.height }]),
  );
};

// Views as `viewer` may see them: the quoted post is checked per viewer.
export const toMessageViews = async (
  rows: (typeof dmMessages.$inferSelect)[],
  viewer: SocialActor,
) => {
  const [photos, posts] = await Promise.all([
    loadPhotoSizes(
      rows.flatMap((row) => (row.photoId === null ? [] : [row.photoId])),
    ),
    loadReplyPostViews(
      viewer,
      rows.flatMap((row) =>
        row.replyPostId === null ? [] : [row.replyPostId],
      ),
    ),
  ]);

  return rows.map((row) => toView(row, photos, posts));
};

export const getDmMessageView = async (
  messageId: number,
  viewer: SocialActor,
) => {
  const [row] = await db
    .select()
    .from(dmMessages)
    .where(eq(dmMessages.id, messageId))
    .limit(1);

  return row ? (await toMessageViews([row], viewer))[0] : null;
};

// Newest page (no cursor), older (`before`) or newer (`after`) messages, in
// ascending order. Unsent messages never come back; the latest unsent ids
// ride along so a polling client can remove them.
export const listDmThread = async (
  conversationId: number,
  options: {
    after?: number;
    before?: number;
    otherId: number | null;
    viewer: SocialActor;
  },
): Promise<DmThreadPage> => {
  const inConversation = eq(dmMessages.conversationId, conversationId);
  const live = sql`${dmMessages.deletedAt} is null`;
  const rows =
    options.after !== undefined
      ? await db
          .select()
          .from(dmMessages)
          .where(and(inConversation, live, gt(dmMessages.id, options.after)))
          .orderBy(dmMessages.id)
          .limit(DM_PAGE_SIZE + 1)
      : (
          await db
            .select()
            .from(dmMessages)
            .where(
              and(
                inConversation,
                live,
                options.before !== undefined
                  ? lt(dmMessages.id, options.before)
                  : undefined,
              ),
            )
            .orderBy(desc(dmMessages.id))
            .limit(DM_PAGE_SIZE + 1)
        ).reverse();
  const hasMore = rows.length > DM_PAGE_SIZE;
  // After: keep the oldest page of news; otherwise keep the newest page.
  const page =
    options.after !== undefined
      ? rows.slice(0, DM_PAGE_SIZE)
      : rows.slice(rows.length - Math.min(rows.length, DM_PAGE_SIZE));
  const [deleted, read] = await Promise.all([
    db
      .select({ id: dmMessages.id })
      .from(dmMessages)
      .where(and(inConversation, isNotNull(dmMessages.deletedAt)))
      .orderBy(desc(dmMessages.id))
      .limit(DM_PAGE_SIZE * 2),
    options.otherId === null
      ? Promise.resolve([])
      : db
          .select({ id: dmReads.lastReadMessageId })
          .from(dmReads)
          .where(
            and(
              eq(dmReads.conversationId, conversationId),
              eq(dmReads.userId, options.otherId),
            ),
          ),
  ]);

  return {
    messages: await toMessageViews(page, options.viewer),
    deletedIds: deleted.map((row) => row.id),
    hasMore,
    otherReadUpTo: read[0]?.id ?? 0,
  };
};

export interface DmInboxRow {
  conversationId: number;
  otherId: number;
  name: string;
  avatarUrl: string | null;
  preview: string;
  lastMessageAt: string | null;
  unread: number;
}

const unreadByConversation = async (userId: number, ids: number[]) => {
  if (ids.length === 0) {
    return new Map<number, number>();
  }
  const rows = await db
    .select({
      conversationId: dmMessages.conversationId,
      count: sql<number>`count(*)`,
    })
    .from(dmMessages)
    .where(
      and(
        inArray(dmMessages.conversationId, ids),
        sql`${dmMessages.deletedAt} is null`,
        sql`${dmMessages.senderId} <> ${userId}`,
        sql`${dmMessages.id} > coalesce((select ${dmReads.lastReadMessageId} from ${dmReads} where ${dmReads.conversationId} = ${dmMessages.conversationId} and ${dmReads.userId} = ${userId}), 0)`,
      ),
    )
    .groupBy(dmMessages.conversationId);

  return new Map(rows.map((row) => [row.conversationId, Number(row.count)]));
};

// The member's conversations that are not hidden by a block, newest first.
const listVisibleConversations = async (userId: number) => {
  const [rows, blocked] = await Promise.all([
    db
      .select()
      .from(dmConversations)
      .where(
        or(
          eq(dmConversations.userLow, userId),
          eq(dmConversations.userHigh, userId),
        ),
      ),
    listBlockedBetweenIds(userId),
  ]);

  return rows.filter(
    (row) =>
      !blocked.has(
        otherMember({ low: row.userLow, high: row.userHigh }, userId),
      ),
  );
};

export const listDmInbox = async (
  userId: number,
  locale: Locale = DEFAULT_LOCALE,
): Promise<DmInboxRow[]> => {
  const conversations = await listVisibleConversations(userId);

  if (conversations.length === 0) {
    return [];
  }
  const otherIds = conversations.map((row) =>
    otherMember({ low: row.userLow, high: row.userHigh }, userId),
  );
  const lastIds = conversations.flatMap((row) =>
    row.lastMessageId === null ? [] : [row.lastMessageId],
  );
  const [people, lasts, unread] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        avatarUpdatedAt: users.avatarUpdatedAt,
      })
      .from(users)
      .where(inArray(users.id, otherIds)),
    lastIds.length === 0
      ? Promise.resolve([])
      : db.select().from(dmMessages).where(inArray(dmMessages.id, lastIds)),
    unreadByConversation(
      userId,
      conversations.map((row) => row.id),
    ),
  ]);
  const personById = new Map(people.map((person) => [person.id, person]));
  // My own nicknames for the people I talk to, nobody else's.
  const aliases = await loadAliases(
    userActorKey(userId),
    otherIds.map(userActorKey),
  );
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

      // Only conversations with a message are listed; an empty one (opened
      // but never written in) would just be clutter.
      if (!person || !last) {
        return [];
      }
      return [
        {
          conversationId: row.id,
          otherId,
          name: overlayName(aliases, userActorKey(person.id), person.name),
          avatarUrl: avatarUrl("user", person.id, person.avatarUpdatedAt),
          preview: `${last.senderId === userId ? getFormatTranslator(locale)("inbox.you") : ""}${dmPreview(
            {
              body: last.body,
              photoId: last.photoId,
              deleted: last.deletedAt !== null,
            },
            locale,
          )}`,
          lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
          unread: unread.get(row.id) ?? 0,
        },
      ];
    })
    .sort((a, b) =>
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
    );
};

// The tab-bar badge: unread messages across visible conversations.
export const countDmUnread = async (userId: number) => {
  const conversations = await listVisibleConversations(userId);
  const unread = await unreadByConversation(
    userId,
    conversations.map((row) => row.id),
  );

  return [...unread.values()].reduce((total, count) => total + count, 0);
};

// Ids for the realtime token: only the member's own, visible conversations.
export const listDmConversationIds = async (userId: number) =>
  (await listVisibleConversations(userId)).map((row) => row.id);
