import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  CHAT_GALLERY_PAGE_SIZE,
  chatExtractUrls,
  type ChatGalleryTab,
  groupPhotosByOwner,
  stickerToView,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { chatCustomStickerUrl, chatPhotoUrl } from "./chat.mapper.js";
import { liveMessageSql } from "./message-visibility.js";

type Sender = {
  messageId: number;
  senderKey: string;
  senderName: string;
  createdAt: string;
};

type SenderColumns = {
  messageId: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  senderAdminName: string | null;
  traineeName: string;
  createdAt: Date;
};

const PEER_DELETED = "PT (đã xoá)";

const senderOf = (row: SenderColumns): Sender => ({
  messageId: row.messageId,
  senderKey: row.senderRole === "user" ? "user" : `admin:${row.senderAdminId}`,
  senderName:
    row.senderRole === "user"
      ? row.traineeName
      : (row.senderAdminName ?? PEER_DELETED),
  createdAt: row.createdAt.toISOString(),
});

const SENDER_SELECT = `m.id AS "messageId", m.sender_role AS "senderRole",
  m.sender_admin_id AS "senderAdminId", a.username AS "senderAdminName",
  u.name AS "traineeName", m.created_at AS "createdAt"`;

const SENDER_JOINS = `
  JOIN chat_conversations c ON c.id = m.conversation_id
  JOIN users u ON u.id = c.user_id
  LEFT JOIN admins a ON a.id = m.sender_admin_id`;

type Page<T> = { items: T[]; nextCursor: number | null };

// The gallery of one conversation (KAN-160): photos, stickers and links of
// live messages, newest first. The cursor is the message id, which grows with
// time; `nextCursor` is the id to pass as `before`.
@Injectable()
export class ChatGalleryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  list(
    tab: ChatGalleryTab,
    conversationId: number,
    before: number | undefined,
  ) {
    if (tab === "stickers") {
      return this.stickers(conversationId, before);
    }
    return tab === "links"
      ? this.links(conversationId, before)
      : this.photos(conversationId, before);
  }

  // Only photo messages that were not unsent. Every photo of a message is an
  // item, in the message's order (3 photos give 3 items), and a page holds
  // CHAT_GALLERY_PAGE_SIZE messages, so a message is never split across pages.
  async photos(conversationId: number, before: number | undefined) {
    const limit = CHAT_GALLERY_PAGE_SIZE;
    const rows: SenderColumns[] = await this.dataSource.query(
      `SELECT ${SENDER_SELECT}
       FROM chat_messages m
       ${SENDER_JOINS}
       WHERE m.conversation_id = $1 AND ${liveMessageSql("m")}
         AND EXISTS (SELECT 1 FROM chat_photos p
                     WHERE p.message_id = m.id
                       AND p.conversation_id = m.conversation_id)
         ${before === undefined ? "" : "AND m.id < $3"}
       ORDER BY m.id DESC LIMIT $2`,
      before === undefined
        ? [conversationId, limit + 1]
        : [conversationId, limit + 1, before],
    );
    const page = rows.slice(0, limit);
    const photoRows: {
      id: number;
      messageId: number;
      position: number | null;
      width: number;
      height: number;
    }[] =
      page.length === 0
        ? []
        : await this.dataSource.query(
            `SELECT id, message_id AS "messageId", position, width, height
             FROM chat_photos
             WHERE message_id = ANY($1::int[]) AND conversation_id = $2`,
            [page.map((row) => row.messageId), conversationId],
          );
    const photos = groupPhotosByOwner(
      photoRows.map((photo) => ({ ...photo, ownerId: photo.messageId })),
      page.map((row) => row.messageId),
    );

    return {
      items: page.flatMap((row) =>
        (photos.get(row.messageId) ?? []).map((photo) => ({
          ...senderOf(row),
          photoId: photo.id,
          url: chatPhotoUrl(photo.id),
          width: photo.width,
          height: photo.height,
        })),
      ),
      nextCursor:
        rows.length > limit && page.length > 0
          ? page[page.length - 1].messageId
          : null,
    };
  }

  // Every sticker message (bundled, GIPHY and personal). A row whose ref and
  // URL do not check out yields no sticker and is skipped.
  async stickers(conversationId: number, before: number | undefined) {
    const limit = CHAT_GALLERY_PAGE_SIZE;
    const rows = await this.messages(
      conversationId,
      "m.sticker_ref IS NOT NULL",
      before,
      limit + 1,
    );
    const page = rows.slice(0, limit);

    return {
      items: page.flatMap((row) => {
        const sticker = stickerToView(
          row.stickerRef,
          row.stickerUrl,
          chatCustomStickerUrl,
        );

        return sticker
          ? [
              {
                ...senderOf(row),
                url: sticker.url,
                alt: sticker.alt,
                kind: sticker.kind,
              },
            ]
          : [];
      }),
      nextCursor:
        rows.length > limit && page.length > 0
          ? page[page.length - 1].messageId
          : null,
    };
  }

  // One row per URL of every live text message. The database only narrows to
  // messages that mention a URL; the real match is chatExtractUrls, so a batch
  // can hold no link at all and the next one is read until the page is full or
  // the messages run out. The page counts messages, not rows.
  async links(
    conversationId: number,
    before: number | undefined,
  ): Promise<
    Page<Sender & { key: string; href: string; text: string; domain: string }>
  > {
    const limit = CHAT_GALLERY_PAGE_SIZE;
    const batchSize = limit * 2;
    const items: Page<
      Sender & { key: string; href: string; text: string; domain: string }
    >["items"] = [];
    let withLinks = 0;
    let lastIncluded: number | null = null;
    let cursor = before;

    for (;;) {
      const rows = await this.messages(
        conversationId,
        `m.sticker_ref IS NULL AND (m.body LIKE '%http://%' OR m.body LIKE '%https://%' OR m.body LIKE '%www.%')`,
        cursor,
        batchSize + 1,
      );
      const batch = rows.slice(0, batchSize);

      for (const row of batch) {
        const urls = chatExtractUrls(row.body);

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
            ...senderOf(row),
            key: `${row.messageId}:${url.href}`,
            href: url.href,
            text: url.text,
            domain: url.domain,
          });
        }
      }
      if (rows.length <= batchSize) {
        return { items, nextCursor: null };
      }
      cursor = batch[batch.length - 1].messageId;
    }
  }

  // Live messages of one conversation with their sender, newest first.
  private messages(
    conversationId: number,
    extra: string,
    before: number | undefined,
    limit: number,
  ): Promise<
    (SenderColumns & {
      body: string;
      stickerRef: string | null;
      stickerUrl: string | null;
    })[]
  > {
    return this.dataSource.query(
      `SELECT ${SENDER_SELECT}, m.body, m.sticker_ref AS "stickerRef",
              m.sticker_url AS "stickerUrl"
       FROM chat_messages m ${SENDER_JOINS}
       WHERE m.conversation_id = $1 AND ${liveMessageSql("m")} AND ${extra}
         ${before === undefined ? "" : "AND m.id < $3"}
       ORDER BY m.id DESC LIMIT $2`,
      before === undefined
        ? [conversationId, limit]
        : [conversationId, limit, before],
    );
  }
}
