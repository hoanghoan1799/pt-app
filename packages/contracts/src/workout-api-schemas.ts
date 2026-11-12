import { addDays, isValidDate } from "./date.js";
import {
  copyDaySchema,
  copyWeekSchema,
  daySchema,
  exerciseSchema,
} from "./workout-schemas.js";
import {
  ACTIVITY_LIMIT_MAX,
  EXERCISE_LIMITS,
  MEMBER_STATUSES,
  MOVE_DIRECTIONS,
  PROGRESS_TRENDS,
  SET_LIMITS,
  WORKOUT_MESSAGES,
  WORKOUT_RANGE_MAX_DAYS,
} from "./workouts.js";
import { z } from "zod";

// REST schemas for the workouts API. The form schemas in workout-schemas.ts
// stay the source for the field rules; the JSON bodies reuse them via pick().

const isoDateTime = z.iso.datetime();

const dateSchema = z.string().refine(isValidDate, "Ngày không hợp lệ");

// Path ids: digits only, no "1e3" or " 7" that z.coerce would accept.
const pathId = z
  .string()
  .regex(/^\d{1,9}$/, WORKOUT_MESSAGES.INVALID_INPUT)
  .transform(Number)
  .pipe(z.number().int().positive());

export const traineePathSchema = z.object({ userId: pathId });
export const traineeDayPathSchema = z.object({
  userId: pathId,
  date: dateSchema,
});
export const traineeExercisePathSchema = z.object({
  userId: pathId,
  exerciseId: pathId,
});
export const exercisePathSchema = z.object({ exerciseId: pathId });

// ---- Requests -------------------------------------------------------------

export const saveWorkoutDayRequestSchema = daySchema.pick({
  title: true,
  note: true,
});
export type SaveWorkoutDayRequest = z.infer<typeof saveWorkoutDayRequestSchema>;

export const exerciseRequestSchema = exerciseSchema
  .pick({ title: true, youtubeUrl: true, reps: true, description: true })
  .extend({
    sets: z
      .number({ error: "Số hiệp phải là số" })
      .int("Số hiệp phải là số nguyên")
      .min(1, "Ít nhất 1 hiệp")
      .max(EXERCISE_LIMITS.MAX_SETS, `Tối đa ${EXERCISE_LIMITS.MAX_SETS} hiệp`)
      .nullable()
      .default(null),
    // True only after the PT confirmed that a new link deletes logged sets.
    confirmResetSets: z.boolean().default(false),
  });
export type ExerciseRequest = z.infer<typeof exerciseRequestSchema>;

export const deleteExerciseQuerySchema = z.object({
  confirmDeleteSets: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const moveExerciseRequestSchema = z.object({
  direction: z.enum(MOVE_DIRECTIONS),
});
export type MoveExerciseRequest = z.infer<typeof moveExerciseRequestSchema>;

export const copyWeekRequestSchema = copyWeekSchema.pick({
  fromWeek: true,
  targetUserId: true,
  targetDate: true,
});
export type CopyWeekRequest = z.infer<typeof copyWeekRequestSchema>;

export const copyDayRequestSchema = copyDaySchema.pick({
  date: true,
  dates: true,
});
export type CopyDayRequest = z.infer<typeof copyDayRequestSchema>;

// `from`..`to`, at most six weeks apart (a month grid).
export const dateRangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine(
    ({ from, to }) => from <= to && to <= addDays(from, WORKOUT_RANGE_MAX_DAYS),
    WORKOUT_MESSAGES.INVALID_INPUT,
  );
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

// The sets are checked again against exerciseSetsSchema by the service so the
// first message reads exactly as the web showed it (no field path in front).
export const saveSetsRequestSchema = z.object({
  sets: z.array(z.unknown()),
});

export const setInputSchema = z.object({
  weightKg: z
    .number({ error: WORKOUT_MESSAGES.SET_WEIGHT_RANGE })
    .min(SET_LIMITS.MIN_WEIGHT_KG, WORKOUT_MESSAGES.SET_WEIGHT_RANGE)
    .max(SET_LIMITS.MAX_WEIGHT_KG, WORKOUT_MESSAGES.SET_WEIGHT_RANGE)
    .refine((kg) => Number.isInteger(kg * 2), WORKOUT_MESSAGES.SET_WEIGHT_STEP)
    .nullable(),
  reps: z
    .number({ error: WORKOUT_MESSAGES.SET_REPS_RANGE })
    .int(WORKOUT_MESSAGES.SET_REPS_INTEGER)
    .min(SET_LIMITS.MIN_REPS, WORKOUT_MESSAGES.SET_REPS_RANGE)
    .max(SET_LIMITS.MAX_REPS, WORKOUT_MESSAGES.SET_REPS_RANGE),
});
export type SetInput = z.infer<typeof setInputSchema>;

// The whole list replaces the exercise's sets on save; empty is allowed.
export const exerciseSetsSchema = z
  .array(setInputSchema)
  .max(SET_LIMITS.MAX_ROWS, WORKOUT_MESSAGES.SET_TOO_MANY);

export const setCompletionRequestSchema = z.object({
  completed: z.boolean(),
});
export type SetCompletionRequest = z.infer<typeof setCompletionRequestSchema>;

export const progressQuerySchema = z.object({
  week: dateSchema.optional(),
});

export const dashboardSummaryQuerySchema = z.object({
  week: dateSchema.optional(),
  // "none" = trainees without a PT, a positive integer = that PT; anything
  // else (garbage) means everyone. Only a super admin's choice counts.
  pt: z
    .string()
    .optional()
    .transform((raw): "all" | "none" | number => {
      if (raw === "none") {
        return "none";
      }

      const id = Number(raw);

      return raw !== undefined && Number.isInteger(id) && id > 0 ? id : "all";
    }),
});

export const activityQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d{1,3}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(ACTIVITY_LIMIT_MAX))
    .optional(),
});

// ---- Responses ------------------------------------------------------------

export const loggedSetSchema = z.object({
  // Kilograms; null means bodyweight.
  weightKg: z.number().nullable(),
  reps: z.number().int(),
});
export type LoggedSetResponse = z.infer<typeof loggedSetSchema>;

export const exerciseResponseSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string(),
  sets: z.number().int().nullable(),
  reps: z.string(),
  youtubeId: z.string(),
  position: z.number().int(),
  // When the trainee marked it done, or null.
  completedAt: isoDateTime.nullable(),
  // Reps such as "30s": the app shows no set inputs for it.
  timed: z.boolean(),
});
export type ExerciseResponse = z.infer<typeof exerciseResponseSchema>;

export const scheduleExerciseResponseSchema = exerciseResponseSchema.extend({
  loggedSets: z.array(loggedSetSchema),
  // The previous session's sets; row n's hint is previousSets[n].
  previousSets: z.array(loggedSetSchema),
  isPersonalBest: z.boolean(),
});
export type ScheduleExerciseResponse = z.infer<
  typeof scheduleExerciseResponseSchema
>;

export const scheduleDayResponseSchema = z.object({
  date: dateSchema,
  title: z.string(),
  note: z.string(),
  exercises: z.array(scheduleExerciseResponseSchema),
});
export type ScheduleDayResponse = z.infer<typeof scheduleDayResponseSchema>;

// One entry per calendar date in the range, empty days included.
export const scheduleResponseSchema = z.object({
  days: z.array(scheduleDayResponseSchema),
});
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;

export const workoutDayResponseSchema = z.object({
  date: dateSchema,
  title: z.string(),
  note: z.string(),
});
export type WorkoutDayResponse = z.infer<typeof workoutDayResponseSchema>;

export const copyWeekResponseSchema = z.object({
  copiedDays: z.number().int(),
  targetUserId: z.number().int(),
  targetWeekStart: dateSchema,
});
export type CopyWeekResponse = z.infer<typeof copyWeekResponseSchema>;

export const copyDayResponseSchema = z.object({ copied: z.number().int() });
export type CopyDayResponse = z.infer<typeof copyDayResponseSchema>;

export const copyInfoResponseSchema = z.object({
  planDates: z.array(dateSchema),
  logDates: z.array(dateSchema),
});
export type CopyInfoResponse = z.infer<typeof copyInfoResponseSchema>;

export const saveSetsResponseSchema = z.object({
  personalBest: z.boolean(),
  completedAt: isoDateTime.nullable(),
});
export type SaveSetsResponse = z.infer<typeof saveSetsResponseSchema>;

export const completionResponseSchema = z.object({
  completedAt: isoDateTime.nullable(),
});
export type CompletionResponse = z.infer<typeof completionResponseSchema>;

const bestSetSchema = z.object({
  weightKg: z.number(),
  reps: z.number().int(),
});

export const exerciseProgressRowSchema = z.object({
  youtubeId: z.string(),
  title: z.string(),
  weekBest: bestSetSchema,
  previousBest: bestSetSchema.nullable(),
  changeKg: z.number().nullable(),
  trend: z.enum(PROGRESS_TRENDS),
  lastDate: dateSchema,
});

export const progressResponseSchema = z.object({
  weekStart: dateSchema,
  rows: z.array(exerciseProgressRowSchema),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

export const memberProgressResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  displayName: z.string(),
  avatarUpdatedAt: isoDateTime.nullable(),
  ptAdminId: z.number().int().nullable(),
  ptName: z.string().nullable(),
  assigned: z.number().int(),
  completed: z.number().int(),
  plannedDays: z.number().int(),
  activeDays: z.number().int(),
  nutritionDays: z.number().int(),
  lastActiveAt: isoDateTime.nullable(),
  percent: z.number().int(),
  status: z.enum(MEMBER_STATUSES),
});

export const weekSummarySchema = z.object({
  memberCount: z.number().int(),
  plannedCount: z.number().int(),
  activeCount: z.number().int(),
  assigned: z.number().int(),
  completed: z.number().int(),
  percent: z.number().int(),
});

export const dashboardSummaryResponseSchema = z.object({
  weekStart: dateSchema,
  members: z.array(memberProgressResponseSchema),
  summary: weekSummarySchema,
});
export type DashboardSummaryResponse = z.infer<
  typeof dashboardSummaryResponseSchema
>;

const activityBase = {
  // Completion id, or exercise id for a personal best (the id spaces overlap).
  id: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  displayName: z.string(),
  exerciseTitle: z.string(),
  date: dateSchema,
  occurredAt: isoDateTime,
};

export const activityItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("completion"), ...activityBase }),
  z.object({
    kind: z.literal("personalBest"),
    ...activityBase,
    best: bestSetSchema,
    previousBest: bestSetSchema,
  }),
]);

export const activityResponseSchema = z.object({
  items: z.array(activityItemSchema),
});
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
