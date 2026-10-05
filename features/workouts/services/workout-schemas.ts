import { z } from "zod";

import { EXERCISE_LIMITS } from "@/features/workouts/constants/messages";
import { parseYoutubeId } from "@/features/workouts/utils/youtube";
import { isValidDate } from "@/utils/week";

const idSchema = z.coerce.number().int().positive();

const dateSchema = z.string().refine(isValidDate, "Ngày không hợp lệ");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .optional()
    .transform((value) => value ?? "");

export const daySchema = z.object({
  userId: idSchema,
  date: dateSchema,
  title: optionalText(EXERCISE_LIMITS.DAY_TITLE),
  note: optionalText(EXERCISE_LIMITS.DAY_NOTE),
});

export const exerciseSchema = z.object({
  exerciseId: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().int().positive().nullable()),
  userId: idSchema,
  date: dateSchema,
  title: z
    .string()
    .trim()
    .min(1, "Nhập tên bài tập")
    .max(EXERCISE_LIMITS.TITLE, `Tối đa ${EXERCISE_LIMITS.TITLE} ký tự`),
  youtubeUrl: z
    .string()
    .trim()
    .min(1, "Dán link video YouTube")
    .transform((value, context) => {
      const youtubeId = parseYoutubeId(value);

      if (!youtubeId) {
        context.addIssue({
          code: "custom",
          message: "Link YouTube không hợp lệ",
        });
        return z.NEVER;
      }
      return youtubeId;
    }),
  sets: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .pipe(
      z
        .number({ error: "Số hiệp phải là số" })
        .int("Số hiệp phải là số nguyên")
        .min(1, "Ít nhất 1 hiệp")
        .max(
          EXERCISE_LIMITS.MAX_SETS,
          `Tối đa ${EXERCISE_LIMITS.MAX_SETS} hiệp`,
        )
        .nullable(),
    ),
  reps: optionalText(EXERCISE_LIMITS.REPS),
  description: optionalText(EXERCISE_LIMITS.DESCRIPTION),
});

export const copyWeekSchema = z.object({
  userId: idSchema,
  fromWeek: dateSchema,
  targetUserId: idSchema,
  targetDate: dateSchema,
});

export const exerciseRefSchema = z.object({
  exerciseId: idSchema,
  userId: idSchema,
});
