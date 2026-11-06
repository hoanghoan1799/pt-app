import { z } from "zod";

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

export const sendMessageSchema = z.object({
  body: bodySchema,
  clientId: z.uuid(),
  replyToMessageId: messageIdSchema.optional(),
});

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
