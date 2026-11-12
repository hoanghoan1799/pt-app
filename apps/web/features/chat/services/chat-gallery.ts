import "server-only";

import { and, desc, eq, isNotNull, isNull, like, lt, or } from "drizzle-orm";

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
  type GalleryLink,
  type GalleryPage,
  type GallerySticker,
  type GalleryTab,
  type LinkPage,
  type StickerPage,
} from "@/features/chat/utils/gallery-rules";
import { extractUrls } from "@/features/chat/utils/link-rules";
import { chatPhotoUrl } from "@/features/chat/utils/photo-rules";
import { toChatSticker } from "@/features/chat/utils/sticker-rules";
import { getFormatTranslator } from "@/i18n/format-translator";
import { canAdminAccessUser } from "@/services/hidden-users";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

interface SenderColumns {
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  senderAdminName: string | null;
  traineeName: string;
}

const senderOf = (row: SenderColumns, peerDeleted: string) => ({
  senderKey: row.senderRole === "user" ? "user" : `admin:${row.senderAdminId}`,
  senderName:
    row.senderRole === "user"
      ? row.traineeName
      : (row.senderAdminName ?? peerDeleted),
});

// Photos sent in a conversation, newest first (KAN-160). Only photo messages
// that were not unsent; stickers are never in here (they have their own tab).
// The cursor is the message id, which grows with time.
export const listGalleryPhotos = async (
  conversationId: number,
  {
    before,
    limit = GALLERY_PAGE_SIZE,
    locale = DEFAULT_LOCALE,
  }: { before?: number; limit?: number; locale?: Locale } = {},
): Promise<GalleryPage> => {
  const peerDeleted = getFormatTranslator(locale)("thread.peerDeleted");
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
      ...senderOf(row, peerDeleted),
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

// Live (not unsent) messages of one conversation with their sender, newest
// first, for the sticker and link tabs.
const selectMessages = (
  conversationId: number,
  extra: ReturnType<typeof and>,
  before: number | undefined,
  limit: number,
) =>
  db
    .select({
      messageId: chatMessages.id,
      body: chatMessages.body,
      stickerRef: chatMessages.stickerRef,
      stickerUrl: chatMessages.stickerUrl,
      senderRole: chatMessages.senderRole,
      senderAdminId: chatMessages.senderAdminId,
      senderAdminName: admins.username,
      traineeName: users.name,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
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
        extra,
        before === undefined ? undefined : lt(chatMessages.id, before),
      ),
    )
    .orderBy(desc(chatMessages.id))
    .limit(limit);

// Every sticker message (bundled, GIPHY and the user's own), newest first.
// A row whose ref and URL do not check out yields no sticker and is skipped.
export const listGalleryStickers = async (
  conversationId: number,
  {
    before,
    limit = GALLERY_PAGE_SIZE,
    locale = DEFAULT_LOCALE,
  }: { before?: number; limit?: number; locale?: Locale } = {},
): Promise<StickerPage> => {
  const peerDeleted = getFormatTranslator(locale)("thread.peerDeleted");
  const rows = await selectMessages(
    conversationId,
    isNotNull(chatMessages.stickerRef),
    before,
    limit + 1,
  );
  const page = rows.slice(0, limit);
  const items = page.flatMap((row): GallerySticker[] => {
    const sticker = toChatSticker(row.stickerRef, row.stickerUrl);

    return sticker
      ? [
          {
            messageId: row.messageId,
            ...senderOf(row, peerDeleted),
            url: sticker.url,
            alt: sticker.alt,
            kind: sticker.kind,
            createdAt: row.createdAt.toISOString(),
          },
        ]
      : [];
  });

  return {
    items,
    nextCursor:
      rows.length > limit && page.length > 0
        ? page[page.length - 1].messageId
        : null,
  };
};

const LINK_HINTS = or(
  like(chatMessages.body, "%http://%"),
  like(chatMessages.body, "%https://%"),
  like(chatMessages.body, "%www.%"),
);

// One row per URL of every live text message, newest first. The database only
// narrows to messages that mention a URL; the real match is `extractUrls`, so
// a batch can hold no link at all and the next one is read until the page is
// full or the messages run out. The page counts messages, not rows.
export const listGalleryLinks = async (
  conversationId: number,
  {
    before,
    limit = GALLERY_PAGE_SIZE,
    locale = DEFAULT_LOCALE,
  }: { before?: number; limit?: number; locale?: Locale } = {},
): Promise<LinkPage> => {
  const peerDeleted = getFormatTranslator(locale)("thread.peerDeleted");
  const items: GalleryLink[] = [];
  const batchSize = limit * 2;
  let withLinks = 0;
  let lastIncluded: number | null = null;
  let cursor = before;

  for (;;) {
    const rows = await selectMessages(
      conversationId,
      and(isNull(chatMessages.stickerRef), LINK_HINTS),
      cursor,
      batchSize + 1,
    );
    const batch = rows.slice(0, batchSize);

    for (const row of batch) {
      const urls = extractUrls(row.body);

      if (urls.length === 0) {
        continue;
      }
      if (withLinks === limit) {
        // Another message with links exists: this page ends before it.
        return { items, nextCursor: lastIncluded };
      }
      withLinks += 1;
      lastIncluded = row.messageId;
      for (const url of urls) {
        items.push({
          key: `${row.messageId}:${url.href}`,
          messageId: row.messageId,
          ...senderOf(row, peerDeleted),
          href: url.href,
          text: url.text,
          domain: url.domain,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }
    if (rows.length <= batchSize) {
      return { items, nextCursor: null };
    }
    cursor = batch[batch.length - 1].messageId;
  }
};

interface TabPages {
  photos: GalleryPage;
  stickers: StickerPage;
  links: LinkPage;
}

const LISTERS = {
  photos: listGalleryPhotos,
  stickers: listGalleryStickers,
  links: listGalleryLinks,
} as const;

export type GalleryResult<T extends GalleryTab = "photos"> =
  { status: "ok"; page: TabPages[T] } | { status: "not_found" };

const listTab = <T extends GalleryTab>(
  tab: T,
  conversationId: number,
  before: number | undefined,
  locale: Locale,
) => LISTERS[tab](conversationId, { before, locale }) as Promise<TabPages[T]>;

const EMPTY_PAGE = { items: [], nextCursor: null };

// Trainee: only their own conversation (never takes a conversation id).
export const loadGalleryForTrainee = async <T extends GalleryTab = "photos">(
  conversationId: number | null,
  before?: number,
  tab: T = "photos" as T,
  locale: Locale = DEFAULT_LOCALE,
): Promise<GalleryResult<T>> => ({
  status: "ok",
  page:
    conversationId === null
      ? (EMPTY_PAGE as TabPages[T])
      : await listTab(tab, conversationId, before, locale),
});

// Admin: any conversation of a trainee this admin may access. A hidden
// trainee is "not found" unless revealed (same rule as the thread route).
export const loadGalleryForAdmin = async <T extends GalleryTab = "photos">(
  adminId: number,
  conversationId: number,
  before?: number,
  tab: T = "photos" as T,
  locale: Locale = DEFAULT_LOCALE,
): Promise<GalleryResult<T>> => {
  const conversation = await findConversationById(conversationId);

  if (
    !conversation ||
    !(await canAdminAccessUser(adminId, conversation.userId))
  ) {
    return { status: "not_found" };
  }
  return {
    status: "ok",
    page: await listTab(tab, conversation.id, before, locale),
  };
};
