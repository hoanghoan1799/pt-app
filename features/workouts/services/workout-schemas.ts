import { z } from "zod";

import { EXERCISE_LIMITS } from "@/features/workouts/constants/messages";
import { parseYoutubeId } from "@/features/workouts/utils/youtube";
import { addDays, isValidDate } from "@/utils/week";

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
  // Sent as "true" after the PT confirmed that a new link deletes logged sets.
  confirmResetSets: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export const copyWeekSchema = z.object({
  userId: idSchema,
  fromWeek: dateSchema,
  targetUserId: idSchema,
  targetDate: dateSchema,
});

const MAX_COPY_DATES = 14;

// A month grid shows at most 6 weeks.
const MAX_MONTH_SPAN_DAYS = 42;

export const copyDaySchema = z.object({
  userId: idSchema,
  date: dateSchema,
  dates: z.array(dateSchema).min(1).max(MAX_COPY_DATES),
});

export const copyMonthInfoSchema = z
  .object({ userId: idSchema, from: dateSchema, to: dateSchema })
  .refine(
    ({ from, to }) => from <= to && to <= addDays(from, MAX_MONTH_SPAN_DAYS),
  );

export const exerciseRefSchema = z.object({
  exerciseId: idSchema,
  userId: idSchema,
});

// OQ1: the server refuses to delete logged sets the PT has not been warned
// about; `confirmDeleteSets` is true only after the warning confirm.
export const deleteExerciseSchema = exerciseRefSchema.extend({
  confirmDeleteSets: z.boolean().default(false),
});
