import "server-only";

import { and, desc, eq, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import {
  admins,
  chatConversations,
  chatMessages,
  chatPhotos,
  users,
} from "@/db/schema";
import { findConversationById } from "@/features/chat/services/chat-queries";
import {
  GALLERY_PAGE_SIZE,
  type GalleryPage,
} from "@/features/chat/utils/gallery-rules";
import { chatPhotoUrl } from "@/features/chat/utils/photo-rules";
import { canAdminAccessUser } from "@/services/hidden-users";

// Photos sent in a conversation, newest first (KAN-160). Only photo messages
// that were not unsent; stickers are never in here. The cursor is the message
// id, which grows with time.
export const listGalleryPhotos = async (
  conversationId: number,
  {
    before,
    limit = GALLERY_PAGE_SIZE,
  }: { before?: number; limit?: number } = {},
): Promise<GalleryPage> => {
  const rows = await db
    .select({
      messageId: chatMessages.id,
      photoId: chatPhotos.id,
      width: chatPhotos.width,
      height: chatPhotos.height,
      senderRole: chatMessages.senderRole,
      senderAdminId: chatMessages.senderAdminId,
      senderAdminName: admins.username,
      traineeName: users.name,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .innerJoin(
      chatPhotos,
      and(
        eq(chatPhotos.id, chatMessages.photoId),
        eq(chatPhotos.messageId, chatMessages.id),
        eq(chatPhotos.conversationId, chatMessages.conversationId),
      ),
    )
    .innerJoin(
      chatConversations,
      eq(chatConversations.id, chatMessages.conversationId),
    )
    .innerJoin(users, eq(users.id, chatConversations.userId))
    .leftJoin(admins, eq(admins.id, chatMessages.senderAdminId))
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        isNull(chatMessages.deletedAt),
        before === undefined ? undefined : lt(chatMessages.id, before),
      ),
    )
    .orderBy(desc(chatMessages.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);

  return {
    items: page.map((row) => ({
      photoId: row.photoId,
      messageId: row.messageId,
      senderKey:
        row.senderRole === "user" ? "user" : `admin:${row.senderAdminId}`,
      senderName:
        row.senderRole === "user"
          ? row.traineeName
          : (row.senderAdminName ?? "PT (đã xoá)"),
      url: chatPhotoUrl(row.photoId),
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor:
      rows.length > limit && page.length > 0
        ? page[page.length - 1].messageId
        : null,
  };
};

export type GalleryResult =
  { status: "ok"; page: GalleryPage } | { status: "not_found" };

// Trainee: only their own conversation (never takes a conversation id).
export const loadGalleryForTrainee = async (
  conversationId: number | null,
  before?: number,
): Promise<GalleryResult> => ({
  status: "ok",
  page:
    conversationId === null
      ? { items: [], nextCursor: null }
      : await listGalleryPhotos(conversationId, { before }),
});

// Admin: any conversation of a trainee this admin may access. A hidden
// trainee is "not found" unless revealed (same rule as the thread route).
export const loadGalleryForAdmin = async (
  adminId: number,
  conversationId: number,
  before?: number,
): Promise<GalleryResult> => {
  const conversation = await findConversationById(conversationId);

  if (
    !conversation ||
    !(await canAdminAccessUser(adminId, conversation.userId))
  ) {
    return { status: "not_found" };
  }
  return {
    status: "ok",
    page: await listGalleryPhotos(conversation.id, { before }),
  };
};
