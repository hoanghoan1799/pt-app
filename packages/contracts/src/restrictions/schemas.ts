import {
  RESTRICTION_DURATIONS,
  RESTRICTION_LEVELS,
  RESTRICTION_MESSAGES,
  RESTRICTION_REASON_MAX,
} from "./constants.js";
import { z } from "zod";

const isoDate = z.iso.datetime();

export const restrictionLevelSchema = z.enum(RESTRICTION_LEVELS);

export const restrictionDurationSchema = z.enum(RESTRICTION_DURATIONS);

// D9: required, trimmed, at most 300 characters.
export const restrictionReasonSchema = z
  .string()
  .trim()
  .min(1, RESTRICTION_MESSAGES.REASON_REQUIRED)
  .max(RESTRICTION_REASON_MAX, RESTRICTION_MESSAGES.REASON_TOO_LONG);

// PUT /trainees/:userId/restriction: block, or re-block with another level
// (the active block is lifted first and stays as history, D8).
export const blockUserRequestSchema = z.object({
  level: restrictionLevelSchema,
  duration: restrictionDurationSchema,
  reason: restrictionReasonSchema,
});
export type BlockUserRequest = z.infer<typeof blockUserRequestSchema>;

// The web action's input: the trainee id travels with the form.
export const blockUserSchema = blockUserRequestSchema.extend({
  userId: z.number().int().positive(),
});
export type BlockUserInput = z.infer<typeof blockUserSchema>;

export const liftRestrictionSchema = z.object({
  userId: z.number().int().positive(),
});

// What a trainee (their banner) and an admin see about an active block.
export const activeRestrictionSchema = z.object({
  id: z.number().int().positive(),
  level: restrictionLevelSchema,
  // Null = permanent.
  until: isoDate.nullable(),
  reason: z.string(),
  createdAt: isoDate,
});
export type ActiveRestrictionResponse = z.infer<typeof activeRestrictionSchema>;

// One row of a trainee's block history (newest first), active one included.
export const restrictionHistoryItemSchema = activeRestrictionSchema.extend({
  // Usernames; null once the admin account was deleted.
  createdBy: z.string().nullable(),
  liftedAt: isoDate.nullable(),
  liftedBy: z.string().nullable(),
  // Active right now (D6: not lifted, no end or an end in the future).
  active: z.boolean(),
});
export type RestrictionHistoryItem = z.infer<
  typeof restrictionHistoryItemSchema
>;

// GET /trainees/:userId/restriction (super admin).
export const traineeRestrictionResponseSchema = z.object({
  restriction: activeRestrictionSchema.nullable(),
  history: z.array(restrictionHistoryItemSchema),
});
export type TraineeRestrictionResponse = z.infer<
  typeof traineeRestrictionResponseSchema
>;
