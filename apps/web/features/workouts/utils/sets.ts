import { z } from "zod";

import {
  SET_LIMITS,
  WORKOUT_MESSAGES,
} from "@/features/workouts/constants/messages";
import type { BestSet, ExerciseSet } from "@/features/workouts/types/workout";

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

// Best set and session history (KAN-26). Pure functions: records are computed
// on read (D8), nothing here touches the database.

export type LoggedSet = Pick<ExerciseSet, "weightKg" | "reps">;

// One exercise's logged sets on one day. Dates are YYYY-MM-DD strings, so plain
// string comparison orders them correctly.
export interface SetSession {
  userId: number;
  youtubeId: string;
  date: string;
  exerciseId: number;
  sets: LoggedSet[];
}

// True when both lists hold the same sets in the same order (position is the
// index). Weight null (bodyweight) only equals null. Weights compare with
// `===`, which is exact because they are 0.5 steps (D3); revisit if that changes.
export const areSetsEqual = (a: LoggedSet[], b: LoggedSet[]): boolean =>
  a.length === b.length &&
  a.every(
    (set, index) =>
      set.weightKg === b[index].weightKg && set.reps === b[index].reps,
  );

// "Same exercise" means same user + same youtubeId (Q6), seen from `date`.
export interface SessionKey {
  userId: number;
  youtubeId: string;
  date: string;
}

type WeightedSet = LoggedSet & { weightKg: number };

const isWeighted = (set: LoggedSet): set is WeightedSet =>
  set.weightKg !== null;

// Heavier weight wins; on equal weight, more reps wins (Q8).
export const compareSets = (a: WeightedSet, b: WeightedSet): number =>
  a.weightKg !== b.weightKg ? a.weightKg - b.weightKg : a.reps - b.reps;

// Bodyweight sets never count (OQ2). An exact tie keeps the first set.
export const getBestSet = <T extends LoggedSet>(
  sets: T[],
): (T & WeightedSet) | null => {
  let best: (T & WeightedSet) | null = null;

  for (const set of sets) {
    if (isWeighted(set) && (best === null || compareSets(set, best) > 0)) {
      best = set;
    }
  }

  return best;
};

// Plain { weightKg, reps } copy of a best set, without the row's other fields.
export const toBestSet = (set: WeightedSet): BestSet => ({
  weightKg: set.weightKg,
  reps: set.reps,
});

export const isSameExerciseBefore = (session: SetSession, key: SessionKey) =>
  session.userId === key.userId &&
  session.youtubeId === key.youtubeId &&
  session.date < key.date;

// True only when the new best beats every earlier weighted set of the same
// user + youtubeId on strictly earlier dates (D6, D7). A tie is not a record,
// and the first-ever weighted set is not a record either (D11).
export const isPersonalBest = (
  newSets: LoggedSet[],
  history: SetSession[],
  key: SessionKey,
): boolean => {
  const newBest = getBestSet(newSets);

  if (newBest === null) {
    return false;
  }

  const earlierBest = getBestSet(
    history
      .filter((session) => isSameExerciseBefore(session, key))
      .flatMap((session) => session.sets),
  );

  if (earlierBest === null) {
    return false;
  }

  return compareSets(newBest, earlierBest) > 0;
};

// Latest session of the same user + youtubeId on a strictly earlier date (D7).
// When the link appears twice on that date, the lowest exerciseId wins.
export const getPreviousSession = (
  history: SetSession[],
  key: SessionKey,
): SetSession | null => {
  let previous: SetSession | null = null;

  for (const session of history) {
    if (session.sets.length === 0 || !isSameExerciseBefore(session, key)) {
      continue;
    }

    if (
      previous === null ||
      session.date > previous.date ||
      (session.date === previous.date &&
        session.exerciseId < previous.exerciseId)
    ) {
      previous = session;
    }
  }

  return previous;
};
