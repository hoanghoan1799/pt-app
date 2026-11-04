import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNull,
  like,
  lt,
  max,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  admins,
  chatConversations,
  chatMessages,
  chatReads,
  users,
} from "@/db/schema";
import {
  adminReaderKey,
  CHAT_PAGE_SIZE,
  nextReadCursor,
  toPreview,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";

export interface ChatMessage {
  id: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  // Null when the admin was deleted afterwards (the UI shows "PT (đã xoá)").
  senderAdminName: string | null;
  body: string;
  clientId: string;
  createdAt: Date;
}

// The only columns that ever leave the server (no attachment/moderation data).
const messageColumns = {
  id: chatMessages.id,
  senderRole: chatMessages.senderRole,
  senderAdminId: chatMessages.senderAdminId,
  senderAdminName: admins.username,
  body: chatMessages.body,
  clientId: chatMessages.clientId,
  createdAt: chatMessages.createdAt,
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
): Promise<ChatMessage | null> => {
  const [row] = await db
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

  return row ?? null;
};

interface NewMessage {
  conversationId: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  body: string;
  clientId: string;
}

// Idempotent insert: a retried send (same clientId) stores nothing and returns
// the message that is already there.
export const insertMessage = async (input: NewMessage) => {
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
  );

  if (!message) {
    throw new Error("Chat message missing right after insert");
  }
  return message;
};

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
    messages: (forward ? page : page.reverse()) as ChatMessage[],
    hasMore,
  };
};

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
        gt(chatMessages.id, sql`coalesce(${chatReads.lastReadMessageId}, 0)`),
      ),
    )
    .groupBy(chatMessages.conversationId);

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
  const rows = await unreadByConversation("user", adminReaderKey(adminId));

  return rows.reduce((total, row) => total + row.unread, 0);
};

export interface InboxItem {
  conversationId: number;
  userId: number;
  userName: string;
  chatEnabled: boolean;
  preview: string;
  lastFromAdmin: boolean;
  lastMessageAt: Date | null;
  unread: number;
}

export interface InboxWithoutConversation {
  userId: number;
  userName: string;
}

export const listAdminInbox = async (adminId: number) => {
  const [rows, unreadRows, fresh] = await Promise.all([
    db
      .select({
        conversationId: chatConversations.id,
        userId: users.id,
        userName: users.name,
        chatEnabled: users.chatEnabled,
        lastBody: chatMessages.body,
        lastSenderRole: chatMessages.senderRole,
        lastMessageAt: chatConversations.lastMessageAt,
      })
      .from(chatConversations)
      .innerJoin(users, eq(users.id, chatConversations.userId))
      .leftJoin(
        chatMessages,
        eq(chatMessages.id, chatConversations.lastMessageId),
      )
      .orderBy(
        sql`${chatConversations.lastMessageAt} is null`,
        desc(chatConversations.lastMessageAt),
        desc(chatConversations.id),
      ),
    unreadByConversation("user", adminReaderKey(adminId)),
    db
      .select({ userId: users.id, userName: users.name })
      .from(users)
      .leftJoin(chatConversations, eq(chatConversations.userId, users.id))
      .where(and(eq(users.chatEnabled, true), isNull(chatConversations.id)))
      .orderBy(asc(users.name)),
  ]);
  const unreadById = new Map(
    unreadRows.map((row) => [row.conversationId, row.unread]),
  );
  const conversations: InboxItem[] = rows.map((row) => ({
    conversationId: row.conversationId,
    userId: row.userId,
    userName: row.userName,
    chatEnabled: row.chatEnabled === true,
    preview: toPreview(row.lastBody ?? ""),
    lastFromAdmin: row.lastSenderRole === "admin",
    lastMessageAt: row.lastMessageAt,
    unread: unreadById.get(row.conversationId) ?? 0,
  }));

  return {
    conversations,
    withoutConversation: fresh as InboxWithoutConversation[],
  };
};
