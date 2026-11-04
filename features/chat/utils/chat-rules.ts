import { z } from "zod";

export const CHAT_PAGE_SIZE = 30;
export const CHAT_BODY_MAX_LENGTH = 2000;
export const CHAT_PREVIEW_LENGTH = 80;

export const USER_READER_KEY = "user";
export const adminReaderKey = (adminId: number) => `admin:${adminId}`;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(CHAT_BODY_MAX_LENGTH),
  clientId: z.uuid(),
});

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
