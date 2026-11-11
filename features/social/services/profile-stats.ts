import "server-only";

import { count, eq } from "drizzle-orm";

import { TIME_ZONE } from "@/constants/time";
import { db } from "@/db";
import {
  exerciseCompletions,
  exercises,
  exerciseSets,
  workoutDays,
} from "@/db/schema";
import { computeDayStreak } from "@/features/social/utils/streak-rules";
import { getTodayDate } from "@/utils/week";

export interface TrainingStats {
  workouts: number;
  streak: number;
  totalSets: number;
}

// A trainee's profile stats. Callers decide who may see them first.
export const getTrainingStats = async (
  userId: number,
  now = new Date(),
): Promise<TrainingStats> => {
  const [days, [sets]] = await Promise.all([
    db
      .selectDistinct({ date: workoutDays.date })
      .from(exerciseCompletions)
      .innerJoin(exercises, eq(exercises.id, exerciseCompletions.exerciseId))
      .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
      .where(eq(exerciseCompletions.userId, userId)),
    db
      .select({ total: count() })
      .from(exerciseSets)
      .where(eq(exerciseSets.userId, userId)),
  ]);
  const dates = days.map((row) => row.date);

  return {
    workouts: dates.length,
    streak: computeDayStreak(dates, getTodayDate(TIME_ZONE, now)),
    totalSets: sets?.total ?? 0,
  };
};
