import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lt,
  max,
  notInArray,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  admins,
  chatConversations,
  chatMessageEdits,
  chatMessages,
  chatPhotos,
  chatReactions,
  chatReads,
  users,
} from "@/db/schema";
import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import {
  adminReaderKey,
  CHANGES_PAGE_SIZE,
  CHAT_PAGE_SIZE,
  nextReadCursor,
  toPreview,
  toReplySnippet,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";
import { resolveDisplayName } from "@/features/chat/utils/display-name";
import {
  type ChatPhoto,
  photoPreview,
  toChatPhoto,
} from "@/features/chat/utils/photo-rules";
import {
  type ChatSticker,
  stickerPreview,
  toChatSticker,
} from "@/features/chat/utils/sticker-rules";
import { loadTraineeAliases } from "@/features/contact-aliases/services/contact-aliases";
import { loadReplyPostViews } from "@/features/social/services/dm-reply-post";
import type { DmReplyPostView } from "@/features/social/types/dm";
import type { SocialActor } from "@/features/social/types/social";
import {
  adminScopeFilter,
  outOfScopeConversationIdsOf,
} from "@/services/admin-scope";
import {
  hiddenConversationIdsOf,
  hiddenUserIdsOf,
} from "@/services/hidden-users";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

export interface ChatReaction {
  emoji: string;
  // "user" or "admin:<id>".
  reactorKey: string;
  reactorName: string;
}

export interface ChatReplyTo {
  id: number;
  // Truncated snippet; empty when the original was unsent.
  body: string;
  // The quoted message is a sticker: the UI shows "Sticker".
  isSticker: boolean;
  // The quoted message is a photo: the UI shows "Ảnh" when there is no text.
  isPhoto: boolean;
  senderRole: "user" | "admin";
  deleted: boolean;
}

export interface ChatMessage {
  id: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  // Null when the admin was deleted afterwards (the UI shows "PT (đã xoá)").
  senderAdminName: string | null;
  // Empty once the message was unsent (`deleted`).
  body: string;
  // KAN-144: set for a sticker message (body is empty); null once unsent.
  sticker: ChatSticker | null;
  // KAN-160: set for a photo message (body is the optional caption); null
  // once unsent.
  photo: ChatPhoto | null;
  clientId: string;
  createdAt: Date;
  replyTo: ChatReplyTo | null;
  editedAt: Date | null;
  deleted: boolean;
  // Last edit, unsend or reaction; createdAt before any of those.
  updatedAt: Date;
  reactions: ChatReaction[];
  // The social post this message replies to, checked for the viewer who asked
  // (`available: false` once they may not see it). Null without one, once
  // unsent, and when the caller named no viewer.
  post: DmReplyPostView | null;
}

// The only columns that ever leave the server (no attachment/moderation data).
const messageColumns = {
  id: chatMessages.id,
  conversationId: chatMessages.conversationId,
  senderRole: chatMessages.senderRole,
  senderAdminId: chatMessages.senderAdminId,
  senderAdminName: admins.username,
  body: chatMessages.body,
  stickerRef: chatMessages.stickerRef,
  stickerUrl: chatMessages.stickerUrl,
  photoId: chatMessages.photoId,
  clientId: chatMessages.clientId,
  createdAt: chatMessages.createdAt,
  replyToMessageId: chatMessages.replyToMessageId,
  replyPostId: chatMessages.replyPostId,
  editedAt: chatMessages.editedAt,
  deletedAt: chatMessages.deletedAt,
  updatedAt: chatMessages.updatedAt,
};

interface MessageRow {
  id: number;
  conversationId: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  senderAdminName: string | null;
  body: string;
  stickerRef: string | null;
  stickerUrl: string | null;
  photoId: number | null;
  clientId: string;
  createdAt: Date;
  replyToMessageId: number | null;
  replyPostId: number | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date | null;
}

// Adds reply snippets and reactions to raw rows with batched queries. Unsent
// messages lose their body, quote and reactions here, so every reader of this
// module gets the same redaction. Quoted posts are checked per `viewer` on
// every read, so a post made private later never leaks through the chat.
const hydrateMessages = async (
  rows: MessageRow[],
  viewer?: SocialActor,
): Promise<ChatMessage[]> => {
  if (rows.length === 0) {
    return [];
  }
  const replyIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.replyToMessageId !== null && row.deletedAt === null
          ? [row.replyToMessageId]
          : [],
      ),
    ),
  ];
  const liveIds = rows.filter((row) => !row.deletedAt).map((row) => row.id);
  const conversationIds = [...new Set(rows.map((row) => row.conversationId))];
  const photoIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.photoId !== null && row.deletedAt === null ? [row.photoId] : [],
      ),
    ),
  ];
  const postIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.replyPostId !== null && row.deletedAt === null && viewer
          ? [row.replyPostId]
          : [],
      ),
    ),
  ];
  const [targets, reactionRows, traineeRows, photoRows, posts] =
    await Promise.all([
      replyIds.length === 0
        ? []
        : db
            .select({
              id: chatMessages.id,
              conversationId: chatMessages.conversationId,
              body: chatMessages.body,
              stickerRef: chatMessages.stickerRef,
              photoId: chatMessages.photoId,
              senderRole: chatMessages.senderRole,
              deletedAt: chatMessages.deletedAt,
            })
            .from(chatMessages)
            .where(inArray(chatMessages.id, replyIds)),
      liveIds.length === 0
        ? []
        : db
            .select({
              messageId: chatReactions.messageId,
              reactorKey: chatReactions.reactorKey,
              emoji: chatReactions.emoji,
              adminName: admins.username,
            })
            .from(chatReactions)
            .leftJoin(
              admins,
              sql`${chatReactions.reactorKey} = 'admin:' || ${admins.id}`,
            )
            .where(inArray(chatReactions.messageId, liveIds))
            .orderBy(asc(chatReactions.createdAt)),
      db
        .select({ conversationId: chatConversations.id, name: users.name })
        .from(chatConversations)
        .innerJoin(users, eq(users.id, chatConversations.userId))
        .where(inArray(chatConversations.id, conversationIds)),
      // Size only: the bytes are served by /api/chat/photos/<id>.
      photoIds.length === 0
        ? []
        : db
            .select({
              id: chatPhotos.id,
              width: chatPhotos.width,
              height: chatPhotos.height,
            })
            .from(chatPhotos)
            .where(inArray(chatPhotos.id, photoIds)),
      viewer && postIds.length > 0
        ? loadReplyPostViews(viewer, postIds)
        : new Map<number, DmReplyPostView>(),
    ]);
  const photoSizeById = new Map(photoRows.map((row) => [row.id, row]));
  const targetById = new Map(targets.map((row) => [row.id, row]));
  const traineeName = new Map(
    traineeRows.map((row) => [row.conversationId, row.name]),
  );
  const conversationByMessage = new Map(
    rows.map((row) => [row.id, row.conversationId]),
  );
  const reactionsByMessage = new Map<number, ChatReaction[]>();

  for (const reaction of reactionRows) {
    const name =
      reaction.reactorKey === USER_READER_KEY
        ? (traineeName.get(
            conversationByMessage.get(reaction.messageId) ?? 0,
          ) ?? "Học viên")
        : (reaction.adminName ?? "PT");
    const list = reactionsByMessage.get(reaction.messageId) ?? [];

    list.push({
      emoji: reaction.emoji,
      reactorKey: reaction.reactorKey,
      reactorName: name,
    });
    reactionsByMessage.set(reaction.messageId, list);
  }
  return rows.map((row) => {
    const deleted = row.deletedAt !== null;
    const target =
      row.replyToMessageId === null
        ? undefined
        : targetById.get(row.replyToMessageId);
    // A quote from another conversation never leaks a snippet.
    const replyTo: ChatReplyTo | null =
      !deleted && target && target.conversationId === row.conversationId
        ? {
            id: target.id,
            body: target.deletedAt ? "" : toReplySnippet(target.body),
            isSticker: target.deletedAt === null && target.stickerRef !== null,
            isPhoto: target.deletedAt === null && target.photoId !== null,
            senderRole: target.senderRole,
            deleted: target.deletedAt !== null,
          }
        : null;

    return {
      id: row.id,
      senderRole: row.senderRole,
      senderAdminId: row.senderAdminId,
      senderAdminName: row.senderAdminName,
      body: deleted ? "" : row.body,
      sticker: deleted ? null : toChatSticker(row.stickerRef, row.stickerUrl),
      photo: deleted
        ? null
        : toChatPhoto(row.photoId, photoSizeById.get(row.photoId ?? 0)),
      clientId: row.clientId,
      createdAt: row.createdAt,
      replyTo,
      editedAt: row.editedAt,
      deleted,
      updatedAt: row.updatedAt ?? row.createdAt,
      reactions: deleted ? [] : (reactionsByMessage.get(row.id) ?? []),
      post:
        deleted || row.replyPostId === null
          ? null
          : (posts.get(row.replyPostId) ?? null),
    };
  });
};

export const findConversationByUserId = async (userId: number) => {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .limit(1);

  return row ?? null;
};

export const findConversationById = async (id: number) => {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1);

  return row ?? null;
};

// Race-safe: two first sends at once both insert-or-ignore, then both read.
export const getOrCreateConversation = async (userId: number) => {
  await db
    .insert(chatConversations)
    .values({ userId })
    .onConflictDoNothing({ target: chatConversations.userId });

  const conversation = await findConversationByUserId(userId);

  if (!conversation) {
    throw new Error("Chat conversation missing right after insert");
  }
  return conversation;
};

export const findMessageByClientId = async (
  conversationId: number,
  clientId: string,
  viewer?: SocialActor,
): Promise<ChatMessage | null> => {
  const rows = await db
    .select(messageColumns)
    .from(chatMessages)
    .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.clientId, clientId),
      ),
    )
    .limit(1);

  return (await hydrateMessages(rows, viewer))[0] ?? null;
};

interface NewMessage {
  conversationId: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  body: string;
  stickerRef?: string | null;
  stickerUrl?: string | null;
  photoId?: number | null;
  clientId: string;
  replyToMessageId?: number | null;
  replyPostId?: number | null;
  // /imlang: stored so unread polls can tell loud from silent messages.
  silent?: boolean | null;
}

// Idempotent insert: a retried send (same clientId) stores nothing and returns
// the message that is already there.
// `created` is false for that retried send, so callers can skip side effects
// (push) that must fire once per message.
export const insertMessageOnce = async (
  input: NewMessage,
  viewer?: SocialActor,
) => {
  const now = new Date();
  const inserted = await db
    .insert(chatMessages)
    .values({ ...input, createdAt: now })
    .onConflictDoNothing({
      target: [chatMessages.conversationId, chatMessages.clientId],
    })
    .returning({ id: chatMessages.id });

  if (inserted.length > 0) {
    await db
      .update(chatConversations)
      .set({ lastMessageId: inserted[0].id, lastMessageAt: now })
      // Two parallel sends must not move the pointer back to the older one.
      .where(
        and(
          eq(chatConversations.id, input.conversationId),
          sql`coalesce(${chatConversations.lastMessageId}, 0) < ${inserted[0].id}`,
        ),
      );
  }

  const message = await findMessageByClientId(
    input.conversationId,
    input.clientId,
    viewer,
  );

  if (!message) {
    throw new Error("Chat message missing right after insert");
  }
  return { message, created: inserted.length > 0 };
};

export const insertMessage = async (input: NewMessage, viewer?: SocialActor) =>
  (await insertMessageOnce(input, viewer)).message;

export interface ListMessagesOptions {
  after?: number;
  before?: number;
}

// `after`: newer than the cursor, oldest first (polling). `before` or nothing:
// the newest page older than the cursor, returned oldest first; hasMore says
// whether even older messages exist. For `after`, hasMore means more newer
// messages than one page.
export const listMessages = async (
  conversationId: number,
  { after, before }: ListMessagesOptions = {},
  viewer?: SocialActor,
) => {
  const forward = after !== undefined;
  const cursorFilter =
    after !== undefined
      ? gt(chatMessages.id, after)
      : before !== undefined
        ? lt(chatMessages.id, before)
        : undefined;
  const rows = await db
    .select(messageColumns)
    .from(chatMessages)
    .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
    .where(and(eq(chatMessages.conversationId, conversationId), cursorFilter))
    .orderBy(forward ? asc(chatMessages.id) : desc(chatMessages.id))
    .limit(CHAT_PAGE_SIZE + 1);
  const hasMore = rows.length > CHAT_PAGE_SIZE;
  const page = rows.slice(0, CHAT_PAGE_SIZE);

  return {
    messages: await hydrateMessages(forward ? page : page.reverse(), viewer),
    hasMore,
  };
};

// The most messages after the target a jump loads in one go; a longer tail
// means the target is far back and the jump is skipped (the chat opens at the
// newest as usual). Conversations are small, so this is rare.
export const JUMP_MAX_NEWER = 500;

// The thread as the chat opens it for a jump to `messageId` (KAN-160): the
// page that ends at the target plus every newer message, so it still joins up
// with the newest and the poll cursor stays valid. Null when the message is
// not in this conversation or too far back.
export const listMessagesAround = async (
  conversationId: number,
  messageId: number,
  viewer?: SocialActor,
) => {
  const [target] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.id, messageId),
        eq(chatMessages.conversationId, conversationId),
      ),
    );

  if (!target) {
    return null;
  }
  const [older, newerRows] = await Promise.all([
    listMessages(conversationId, { before: messageId + 1 }, viewer),
    db
      .select(messageColumns)
      .from(chatMessages)
      .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          gt(chatMessages.id, messageId),
        ),
      )
      .orderBy(asc(chatMessages.id))
      .limit(JUMP_MAX_NEWER + 1),
  ]);

  if (newerRows.length > JUMP_MAX_NEWER) {
    return null;
  }
  return {
    messages: [
      ...older.messages,
      ...(await hydrateMessages(newerRows, viewer)),
    ],
    hasMore: older.hasMore,
  };
};

// Messages edited, unsent or reacted to after `changedSince` (epoch ms),
// oldest change first. When more than one page changed, lastChangeAt is the
// newest change actually returned so the next request continues from there.
export const listChanges = async (
  conversationId: number,
  changedSince: number,
  lastChangeAt: number,
  viewer?: SocialActor,
) => {
  const rows = await db
    .select(messageColumns)
    .from(chatMessages)
    .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        gt(chatMessages.updatedAt, new Date(changedSince)),
      ),
    )
    .orderBy(asc(chatMessages.updatedAt), asc(chatMessages.id))
    .limit(CHANGES_PAGE_SIZE + 1);
  const truncated = rows.length > CHANGES_PAGE_SIZE;
  const page = rows.slice(0, CHANGES_PAGE_SIZE);

  return {
    changes: await hydrateMessages(page, viewer),
    lastChangeAt: truncated
      ? (page[page.length - 1].updatedAt?.getTime() ?? lastChangeAt)
      : lastChangeAt,
  };
};

// The raw stored row (real body, even when unsent) for ownership checks in
// the mutation services. Never send it to a client.
export const findStoredMessage = async (messageId: number) => {
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);

  return row ?? null;
};

export const findMessageById = async (
  messageId: number,
  viewer?: SocialActor,
): Promise<ChatMessage | null> => {
  const rows = await db
    .select(messageColumns)
    .from(chatMessages)
    .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
    .where(eq(chatMessages.id, messageId))
    .limit(1);

  return (await hydrateMessages(rows, viewer))[0] ?? null;
};

// Moves the change cursor of one conversation (strictly increasing) without
// touching a message; used by nickname and colour changes (KAN-141), which
// are not tied to a message but must still defeat the 204 fast path.
export const bumpConversationChange = async (conversationId: number) => {
  const [conversation] = await db
    .update(chatConversations)
    .set({
      lastChangeAt: sql`max(coalesce(${chatConversations.lastChangeAt}, 0) + 1, ${Date.now()})`,
    })
    .where(eq(chatConversations.id, conversationId))
    .returning({ lastChangeAt: chatConversations.lastChangeAt });

  return conversation?.lastChangeAt ?? new Date();
};

// Same for every conversation (an admin changed their account colour).
// Returns the conversation ids so the caller can publish to each.
export const bumpAllConversationChanges = async () => {
  const rows = await db
    .update(chatConversations)
    .set({
      lastChangeAt: sql`max(coalesce(${chatConversations.lastChangeAt}, 0) + 1, ${Date.now()})`,
    })
    .returning({ id: chatConversations.id });

  return rows.map((row) => row.id);
};

// Bumps the conversation's change cursor and stamps the message with it. The
// cursor is strictly increasing, so a change in the same millisecond as a poll
// is never lost to `updated_at > changedSince`.
export const touchMessage = async (
  conversationId: number,
  messageId: number,
) => {
  const changedAt = await bumpConversationChange(conversationId);

  await db
    .update(chatMessages)
    .set({ updatedAt: changedAt })
    .where(eq(chatMessages.id, messageId));
  return changedAt;
};

// Previous bodies of one message, oldest first.
export const listEditHistory = async (messageId: number) =>
  db
    .select({
      previousBody: chatMessageEdits.previousBody,
      editedAt: chatMessageEdits.editedAt,
    })
    .from(chatMessageEdits)
    .where(eq(chatMessageEdits.messageId, messageId))
    .orderBy(asc(chatMessageEdits.id));

// "Đã xem" for the other side. A trainee sees the furthest any PT has read
// (any admin counts); a PT sees the trainee's own cursor.
export const getPeerReadCursor = async (
  conversationId: number,
  viewer: "user" | "admin",
) => {
  const [row] = await db
    .select({ value: max(chatReads.lastReadMessageId) })
    .from(chatReads)
    .where(
      and(
        eq(chatReads.conversationId, conversationId),
        viewer === "user"
          ? like(chatReads.readerKey, "admin:%")
          : eq(chatReads.readerKey, USER_READER_KEY),
      ),
    );

  return row?.value ?? 0;
};

// Upserts a reader's cursor. The SQL max() keeps it from going backwards even
// when two requests race.
export const saveReadCursor = async (
  conversationId: number,
  readerKey: string,
  requested: number,
  lastMessageId: number,
) => {
  const [current] = await db
    .select({ value: chatReads.lastReadMessageId })
    .from(chatReads)
    .where(
      and(
        eq(chatReads.conversationId, conversationId),
        eq(chatReads.readerKey, readerKey),
      ),
    )
    .limit(1);
  const next = nextReadCursor(current?.value ?? 0, requested, lastMessageId);

  await db
    .insert(chatReads)
    .values({
      conversationId,
      readerKey,
      lastReadMessageId: next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [chatReads.conversationId, chatReads.readerKey],
      set: {
        lastReadMessageId: sql`max(${chatReads.lastReadMessageId}, ${next})`,
        updatedAt: new Date(),
      },
    });

  return next;
};

// Messages from the other side that this reader has not read yet, per
// conversation. One grouped query; the reader's cursor is joined in.
const unreadByConversation = (
  senderRole: "user" | "admin",
  readerKey: string,
  conversationId?: number,
  hiddenForAdminId?: number,
) =>
  db
    .select({ conversationId: chatMessages.conversationId, unread: count() })
    .from(chatMessages)
    .leftJoin(
      chatReads,
      and(
        eq(chatReads.conversationId, chatMessages.conversationId),
        eq(chatReads.readerKey, readerKey),
      ),
    )
    .where(
      and(
        eq(chatMessages.senderRole, senderRole),
        conversationId === undefined
          ? undefined
          : eq(chatMessages.conversationId, conversationId),
        hiddenForAdminId === undefined
          ? undefined
          : and(
              notInArray(
                chatMessages.conversationId,
                hiddenConversationIdsOf(hiddenForAdminId),
              ),
              // P1: a PT counts only their own trainees' messages.
              notInArray(
                chatMessages.conversationId,
                outOfScopeConversationIdsOf(hiddenForAdminId),
              ),
            ),
        gt(chatMessages.id, sql`coalesce(${chatReads.lastReadMessageId}, 0)`),
      ),
    )
    .groupBy(chatMessages.conversationId);

// Newest unread incoming message that is neither /imlang silent nor unsent,
// per conversation. The bubble host pops when this grows; absent when none.
const latestLoudIncomingIds = async (
  senderRole: "user" | "admin",
  readerKey: string,
  conversationIds: number[],
) => {
  if (conversationIds.length === 0) {
    return new Map<number, number>();
  }
  const rows = await db
    .select({
      conversationId: chatMessages.conversationId,
      latest: max(chatMessages.id),
    })
    .from(chatMessages)
    .leftJoin(
      chatReads,
      and(
        eq(chatReads.conversationId, chatMessages.conversationId),
        eq(chatReads.readerKey, readerKey),
      ),
    )
    .where(
      and(
        inArray(chatMessages.conversationId, conversationIds),
        eq(chatMessages.senderRole, senderRole),
        isNull(chatMessages.deletedAt),
        sql`coalesce(${chatMessages.silent}, 0) = 0`,
        gt(chatMessages.id, sql`coalesce(${chatReads.lastReadMessageId}, 0)`),
      ),
    )
    .groupBy(chatMessages.conversationId);

  return new Map(
    rows.flatMap((row) =>
      row.latest === null ? [] : [[row.conversationId, row.latest] as const],
    ),
  );
};

export const findLatestLoudIncomingForUser = async (userId: number) => {
  const conversation = await findConversationByUserId(userId);

  if (!conversation) {
    return null;
  }
  const latest = await latestLoudIncomingIds("admin", USER_READER_KEY, [
    conversation.id,
  ]);

  return latest.get(conversation.id) ?? null;
};

export const countUnreadForUser = async (userId: number) => {
  const conversation = await findConversationByUserId(userId);

  if (!conversation) {
    return 0;
  }
  const [row] = await unreadByConversation(
    "admin",
    USER_READER_KEY,
    conversation.id,
  );

  return row?.unread ?? 0;
};

export const countUnreadForAdmin = async (adminId: number) => {
  const rows = await unreadByConversation(
    "user",
    adminReaderKey(adminId),
    undefined,
    adminId,
  );

  return rows.reduce((total, row) => total + row.unread, 0);
};

// Unread per trainee for the admin, only trainees with something unread.
export const listUnreadByTraineeForAdmin = async (adminId: number) => {
  const unreadRows = await unreadByConversation(
    "user",
    adminReaderKey(adminId),
    undefined,
    adminId,
  );

  if (unreadRows.length === 0) {
    return [];
  }
  const owners = await db
    .select({ id: chatConversations.id, userId: chatConversations.userId })
    .from(chatConversations)
    .where(
      inArray(
        chatConversations.id,
        unreadRows.map((row) => row.conversationId),
      ),
    );
  const userByConversation = new Map(owners.map((row) => [row.id, row.userId]));

  const loud = await latestLoudIncomingIds(
    "user",
    adminReaderKey(adminId),
    unreadRows.map((row) => row.conversationId),
  );

  return unreadRows.flatMap((row) => {
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
};

// The PT who wrote the newest admin message, for the trainee's header and chat
// info page. Null when no admin has written yet; `name` is null when that
// admin was deleted.
export const findLatestAdminSender = async (conversationId: number) => {
  const [row] = await db
    .select({ id: chatMessages.senderAdminId, name: admins.username })
    .from(chatMessages)
    .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.senderRole, "admin"),
      ),
    )
    .orderBy(desc(chatMessages.id))
    .limit(1);

  return row ?? null;
};

// Username of that PT; null when none or deleted.
export const findLatestAdminSenderName = async (conversationId: number) =>
  (await findLatestAdminSender(conversationId))?.name ?? null;

// The name admin pages show for one trainee to this admin: their private
// nickname for the trainee if they set one, else the real name (same rule as
// the inbox and dashboard).
export const getTraineeDisplayName = async (
  adminId: number,
  user: { id: number; name: string },
) =>
  resolveDisplayName(
    (await loadTraineeAliases(adminId, [user.id])).get(user.id),
    user.name,
  );

export interface InboxItem {
  conversationId: number;
  userId: number;
  userName: string;
  // This admin's private nickname for the trainee, else the real name.
  displayName: string;
  chatEnabled: boolean;
  preview: string;
  lastFromAdmin: boolean;
  // Who wrote the last message when it came from a PT; the name is null once
  // that account is deleted.
  lastSenderAdminId: number | null;
  lastSenderAdminName: string | null;
  lastMessageAt: Date | null;
  unread: number;
  // Trainee's last heartbeat (KAN-128); null = never seen.
  lastSeenAt: Date | null;
  // Versioned /api/avatar URL of the trainee's photo (KAN-157); null = none.
  avatarUrl: string | null;
}

export interface InboxWithoutConversation {
  userId: number;
  userName: string;
  lastSeenAt: Date | null;
  avatarUrl: string | null;
}

// `hidden: false` is the normal inbox (this admin's hidden trainees left out);
// `hidden: true` is only those, for the passcode reveal (KAN-163).
const loadInbox = async (
  adminId: number,
  hidden: boolean,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const [rows, unreadRows, fresh] = await Promise.all([
    db
      .select({
        conversationId: chatConversations.id,
        userId: users.id,
        userName: users.name,
        chatEnabled: users.chatEnabled,
        lastSeenAt: users.lastSeenAt,
        avatarUpdatedAt: users.avatarUpdatedAt,
        lastBody: chatMessages.body,
        lastStickerRef: chatMessages.stickerRef,
        lastPhotoId: chatMessages.photoId,
        lastDeletedAt: chatMessages.deletedAt,
        lastSenderRole: chatMessages.senderRole,
        lastSenderAdminId: chatMessages.senderAdminId,
        lastSenderAdminName: admins.username,
        lastMessageAt: chatConversations.lastMessageAt,
      })
      .from(chatConversations)
      .innerJoin(users, eq(users.id, chatConversations.userId))
      .leftJoin(
        chatMessages,
        eq(chatMessages.id, chatConversations.lastMessageId),
      )
      .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
      .where(
        and(
          hidden
            ? inArray(chatConversations.userId, hiddenUserIdsOf(adminId))
            : notInArray(chatConversations.userId, hiddenUserIdsOf(adminId)),
          adminScopeFilter(adminId, chatConversations.userId),
        ),
      )
      .orderBy(
        sql`${chatConversations.lastMessageAt} is null`,
        desc(chatConversations.lastMessageAt),
        desc(chatConversations.id),
      ),
    unreadByConversation("user", adminReaderKey(adminId)),
    db
      .select({
        userId: users.id,
        userName: users.name,
        lastSeenAt: users.lastSeenAt,
        avatarUpdatedAt: users.avatarUpdatedAt,
      })
      .from(users)
      .leftJoin(chatConversations, eq(chatConversations.userId, users.id))
      .where(
        and(
          eq(users.chatEnabled, true),
          isNull(chatConversations.id),
          hidden
            ? inArray(users.id, hiddenUserIdsOf(adminId))
            : notInArray(users.id, hiddenUserIdsOf(adminId)),
          adminScopeFilter(adminId),
        ),
      )
      .orderBy(asc(users.name)),
  ]);
  const nicknameByUserId = await loadTraineeAliases(
    adminId,
    rows.map((row) => row.userId),
  );
  const unreadById = new Map(
    unreadRows.map((row) => [row.conversationId, row.unread]),
  );
  const conversations: InboxItem[] = rows.map((row) => ({
    conversationId: row.conversationId,
    userId: row.userId,
    userName: row.userName,
    displayName: resolveDisplayName(
      nicknameByUserId.get(row.userId),
      row.userName,
    ),
    chatEnabled: row.chatEnabled === true,
    preview: row.lastDeletedAt
      ? ""
      : row.lastStickerRef
        ? stickerPreview(locale)
        : row.lastPhotoId
          ? photoPreview(toPreview(row.lastBody ?? ""), locale)
          : toPreview(row.lastBody ?? ""),
    lastFromAdmin: row.lastSenderRole === "admin",
    lastSenderAdminId: row.lastSenderAdminId,
    lastSenderAdminName: row.lastSenderAdminName,
    lastMessageAt: row.lastMessageAt,
    unread: unreadById.get(row.conversationId) ?? 0,
    lastSeenAt: row.lastSeenAt,
    avatarUrl: avatarUrl("user", row.userId, row.avatarUpdatedAt),
  }));
  const withoutConversation: InboxWithoutConversation[] = fresh.map(
    ({ avatarUpdatedAt, ...row }) => ({
      ...row,
      avatarUrl: avatarUrl("user", row.userId, avatarUpdatedAt),
    }),
  );

  return { conversations, withoutConversation };
};

export const listAdminInbox = (adminId: number, locale?: Locale) =>
  loadInbox(adminId, false, locale);

// This admin's hidden trainees in the inbox shapes: conversations newest
// first, then the ones nobody has written to yet.
export const listHiddenInboxForAdmin = (adminId: number, locale?: Locale) =>
  loadInbox(adminId, true, locale);
