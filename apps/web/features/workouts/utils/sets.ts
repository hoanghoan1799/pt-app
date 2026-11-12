import { z } from "zod";

import {
  SET_LIMITS,
  WORKOUT_MESSAGES,
} from "@/features/workouts/constants/messages";
import type { ExerciseSet } from "@/features/workouts/types/workout";

// One logged set as sent by the trainee (KAN-27). Weight null = bodyweight;
// otherwise 0.5-500 kg in steps of 0.5 (0 is rejected, D3).
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

// The whole list replaces the exercise's sets on save (D1); empty is allowed (D2).
export const exerciseSetsSchema = z
  .array(setInputSchema)
  .max(SET_LIMITS.MAX_ROWS, WORKOUT_MESSAGES.SET_TOO_MANY);

export type SetInput = z.infer<typeof setInputSchema>;

export type LoggedSet = Pick<ExerciseSet, "weightKg" | "reps">;
