import {
  CHAT_USER_READER_KEY,
  type ChatMessageView,
  chatToReplySnippet,
  stickerToView,
} from "@pt/contracts";

import type { ChatPostQuote } from "./post-quote.port.js";
import { previewTexts } from "./preview-text.js";

// Rows -> contract DTOs. Entities and raw rows never leave the API; every
// response goes through here. Unsent messages lose their body, quote, photo,
// sticker and reactions here, so every reader gets the same redaction.

export const chatPhotoUrl = (id: number) => `/v1/chat/photos/${id}`;
export const PHOTO_ALT = "Ảnh trong tin nhắn";
export const chatCustomStickerUrl = (id: number) =>
  `/v1/chat/stickers/custom/${id}`;

// Only the columns that ever leave the server (no attachment/moderation data).
export type MessageRow = {
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
};

// A photo of a message without its bytes (served by GET /v1/chat/photos/:id).
export type MessagePhotoRow = {
  id: number;
  messageId: number;
  position: number | null;
  width: number;
  height: number;
};

export type ReplyTargetRow = {
  id: number;
  conversationId: number;
  body: string;
  stickerRef: string | null;
  photoId: number | null;
  senderRole: "user" | "admin";
  deletedAt: Date | null;
};

export type ReactionRow = {
  messageId: number;
  reactorKey: string;
  emoji: string;
  // The PT's username when the reactor is an admin that still exists.
  adminName: string | null;
};

// Everything the rows point at, loaded in batches by ChatQueries.
export type MessageContext = {
  targets: Map<number, ReplyTargetRow>;
  reactions: Map<number, ReactionRow[]>;
  // conversation id -> the trainee's name
  traineeNames: Map<number, string>;
  // message id -> its photos in display order (position, then id)
  photos: Map<number, MessagePhotoRow[]>;
  // reply target message id -> how many photos it has
  targetPhotoCounts: Map<number, number>;
  posts: Map<number, ChatPostQuote>;
};

export const emptyContext = (): MessageContext => ({
  targets: new Map(),
  reactions: new Map(),
  traineeNames: new Map(),
  photos: new Map(),
  targetPhotoCounts: new Map(),
  posts: new Map(),
});

export const reactorNameOf = (
  reaction: ReactionRow,
  traineeName: string | undefined,
) =>
  reaction.reactorKey === CHAT_USER_READER_KEY
    ? (traineeName ?? "Học viên")
    : (reaction.adminName ?? "PT");

const toReplyTo = (
  row: MessageRow,
  target: ReplyTargetRow | undefined,
  photoCount: number | undefined,
): ChatMessageView["replyTo"] =>
  // A quote from another conversation never leaks a snippet.
  row.deletedAt === null &&
  target &&
  target.conversationId === row.conversationId
    ? {
        id: target.id,
        body: target.deletedAt ? "" : chatToReplySnippet(target.body),
        isSticker: target.deletedAt === null && target.stickerRef !== null,
        isPhoto: target.deletedAt === null && target.photoId !== null,
        photoCount:
          target.deletedAt === null && target.photoId !== null
            ? Math.max(1, photoCount ?? 1)
            : 0,
        senderRole: target.senderRole,
        deleted: target.deletedAt !== null,
      }
    : null;

export const toMessageView = (
  row: MessageRow,
  context: MessageContext,
): ChatMessageView => {
  const deleted = row.deletedAt !== null;
  const photos = deleted
    ? []
    : (context.photos.get(row.id) ?? []).map((photo) => ({
        url: chatPhotoUrl(photo.id),
        width: photo.width,
        height: photo.height,
        alt: PHOTO_ALT,
      }));
  const sticker = deleted
    ? null
    : stickerToView(row.stickerRef, row.stickerUrl, chatCustomStickerUrl);
  const traineeName = context.traineeNames.get(row.conversationId);

  return {
    id: row.id,
    senderRole: row.senderRole,
    senderAdminId: row.senderAdminId,
    senderAdminName: row.senderAdminName,
    body: deleted ? "" : row.body,
    sticker,
    photo: photos[0] ?? null,
    photos,
    clientId: row.clientId,
    createdAt: row.createdAt.toISOString(),
    replyTo: toReplyTo(
      row,
      row.replyToMessageId === null
        ? undefined
        : context.targets.get(row.replyToMessageId),
      row.replyToMessageId === null
        ? undefined
        : context.targetPhotoCounts.get(row.replyToMessageId),
    ),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted,
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
    reactions: deleted
      ? []
      : (context.reactions.get(row.id) ?? []).map((reaction) => ({
          emoji: reaction.emoji,
          reactorKey: reaction.reactorKey,
          reactorName: reactorNameOf(reaction, traineeName),
        })),
    post:
      deleted || row.replyPostId === null
        ? null
        : (context.posts.get(row.replyPostId) ?? null),
  };
};

export const toMessageViews = (rows: MessageRow[], context: MessageContext) =>
  rows.map((row) => toMessageView(row, context));

// Inbox / list line of the last message.
export const inboxPreview = (
  last: {
    body: string | null;
    stickerRef: string | null;
    photoId: number | null;
    // Photos of the last message when it has several (1 when unknown).
    photoCount?: number;
    deletedAt: Date | null;
  },
  locale?: string | null,
) => {
  const texts = previewTexts(locale);

  if (last.deletedAt) {
    return "";
  }
  const text = Array.from(last.body ?? "")
    .slice(0, 80)
    .join("");

  if (last.stickerRef) {
    return texts.sticker;
  }
  if (last.photoId) {
    if (text.trim() !== "") {
      return `📷 ${text}`;
    }
    return (last.photoCount ?? 1) > 1
      ? `📷 ${texts.photos.replace("{count}", String(last.photoCount))}`
      : `📷 ${texts.photo}`;
  }
  return text;
};
