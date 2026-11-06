import { z } from "zod";

import { CHAT_COLOR_KEYS } from "@/features/chat/utils/chat-palette";
import { stickerInputSchema } from "@/features/chat/utils/sticker-rules";

export const CHAT_PAGE_SIZE = 30;
export const CHAT_BODY_MAX_LENGTH = 2000;
export const CHAT_PREVIEW_LENGTH = 80;

export const USER_READER_KEY = "user";
export const adminReaderKey = (adminId: number) => `admin:${adminId}`;

export const CHAT_REACTION_EMOJIS = [
  "❤️",
  "😂",
  "😮",
  "😢",
  "💪",
  "👍",
] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export const REPLY_SNIPPET_LENGTH = 120;
export const CHANGES_PAGE_SIZE = 200;

const bodySchema = z.string().trim().min(1).max(CHAT_BODY_MAX_LENGTH);
const messageIdSchema = z.number().int().positive();

// Text or a sticker (KAN-144), never both and never neither. Exported as a
// plain object too, because Zod cannot extend a refined schema.
export const sendMessageShape = z.object({
  body: bodySchema.optional(),
  sticker: stickerInputSchema.optional(),
  clientId: z.uuid(),
  replyToMessageId: messageIdSchema.optional(),
});

export const hasBodyOrSticker = (value: { body?: string; sticker?: unknown }) =>
  (value.body === undefined) !== (value.sticker === undefined);

export const sendMessageSchema = sendMessageShape.refine(hasBodyOrSticker);

// emoji null = remove my reaction.
export const reactSchema = z.object({
  messageId: messageIdSchema,
  emoji: z.enum(CHAT_REACTION_EMOJIS).nullable(),
});

export const editSchema = z.object({
  messageId: messageIdSchema,
  body: bodySchema,
});

export const unsendSchema = z.object({ messageId: messageIdSchema });

// Nicknames and colours (KAN-141). Targets: the trainee ("user"), the PT side
// as a whole ("pt") or one admin ("admin:<id>").
export const CHAT_NICKNAME_MAX_LENGTH = 30;
export const PT_TARGET_KEY = "pt";

const ADMIN_TARGET = /^admin:([1-9]\d{0,14})$/;

export const parseAdminTarget = (target: string) => {
  const match = ADMIN_TARGET.exec(target);

  return match ? Number(match[1]) : null;
};

export const nicknameTargetSchema = z
  .string()
  .refine(
    (value) =>
      value === USER_READER_KEY ||
      value === PT_TARGET_KEY ||
      ADMIN_TARGET.test(value),
  );

// Trimmed, whitespace collapsed; empty clears. The limit counts characters,
// not UTF-16 units, so emoji and Vietnamese diacritics are not penalised.
export const nicknameValueSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .refine((value) => Array.from(value).length <= CHAT_NICKNAME_MAX_LENGTH)
  .refine((value) => !/\p{Cc}/u.test(value));

export const nicknameSchema = z.object({
  target: nicknameTargetSchema,
  nickname: nicknameValueSchema,
});

// null = back to the default colour (or, for an override, no override).
export const colorSchema = z.object({
  color: z.enum(CHAT_COLOR_KEYS).nullable(),
});

export const toReplySnippet = (body: string) =>
  Array.from(body).slice(0, REPLY_SNIPPET_LENGTH).join("");

const cursor = z.coerce.number().int().positive().optional();

// Query params `after` (newer than) / `before` (older than): one at a time.
export const historyCursorSchema = z
  .object({ after: cursor, before: cursor })
  .refine((value) => value.after === undefined || value.before === undefined, {
    message: "after and before cannot be used together",
  });

const isCursor = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

// Read cursors only move forward and never past the newest message; bad
// input leaves the cursor where it was.
export const nextReadCursor = (
  current: number,
  requested: number,
  lastMessageId: number,
) => {
  if (!isCursor(requested) || !isCursor(lastMessageId)) {
    return current;
  }
  return Math.max(current, Math.min(requested, lastMessageId));
};

export const toPreview = (body: string) =>
  Array.from(body).slice(0, CHAT_PREVIEW_LENGTH).join("");
