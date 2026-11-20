import { z } from "zod";

import {
  FRIEND_MESSAGES,
  REPORT_REASON_CODES,
  REPORT_REASON_MAX_LENGTH,
} from "@/features/social/constants/social";
import { emailSchema, toEmailKey } from "@/utils/email";

// A friendship is one row per pair, smaller id first.
export const pairOf = (a: number, b: number) =>
  a < b ? { low: a, high: b } : { low: b, high: a };

export type Relationship = "self" | "none" | "friends" | "sent" | "received";

// Exact search only (spec Q5): the whole address, trimmed and lower-cased.
// Anything that is not a full email is rejected so a prefix never matches.
export const parseSearchEmail = (value: unknown): string | null => {
  const parsed = emailSchema.safeParse(typeof value === "string" ? value : "");

  return parsed.success ? toEmailKey(parsed.data) : null;
};

const idSchema = z.number().int().positive();

export const userIdSchema = idSchema;

export const reportSchema = z.object({
  targetKind: z.enum(["post", "comment", "user", "message", "group_message"]),
  targetId: idSchema,
  reasonCode: z.enum(REPORT_REASON_CODES, FRIEND_MESSAGES.REASON_REQUIRED),
  reason: z
    .string()
    .trim()
    .max(REPORT_REASON_MAX_LENGTH, FRIEND_MESSAGES.REASON_TOO_LONG)
    .optional()
    .default(""),
});

export const resolveReportSchema = z.object({
  reportId: idSchema,
  resolution: z.enum(["kept", "deleted", "hidden"]),
});

export type ReportTargetKind =
  "post" | "comment" | "user" | "message" | "group_message";
export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];
