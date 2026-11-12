import "server-only";

import { and, asc, eq, lte } from "drizzle-orm";

import { db } from "@/db";
import { exercises, exerciseSets, workoutDays } from "@/db/schema";
import type { ExerciseProgressRow } from "@/features/members/types/progress";
import { buildExerciseProgress } from "@/features/members/utils/progress";
import { groupSetRows } from "@/features/workouts/utils/set-rows";
import { getWeekDates } from "@/utils/week";

// Admin-only: called from pages under app/admin/(protected) after
// requireAdmin() (C10). Reads every logged set of the trainee up to the end of
// the selected week, since "Tiến bộ" compares with all earlier weeks (F4).
export const getExerciseProgress = async (
  userId: number,
  weekStart: string,
): Promise<ExerciseProgressRow[]> => {
  const dates = getWeekDates(weekStart);
  const weekEnd = dates[dates.length - 1];
  const rows = await db
    .select({
      exerciseId: exerciseSets.exerciseId,
      userId: exerciseSets.userId,
      youtubeId: exercises.youtubeId,
      title: exercises.title,
      date: workoutDays.date,
      position: exerciseSets.position,
      weightKg: exerciseSets.weightKg,
      reps: exerciseSets.reps,
    })
    .from(exerciseSets)
    .innerJoin(exercises, eq(exercises.id, exerciseSets.exerciseId))
    .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
    .where(
      and(
        eq(exerciseSets.userId, userId),
        eq(workoutDays.userId, userId),
        lte(workoutDays.date, weekEnd),
      ),
    )
    .orderBy(asc(exerciseSets.exerciseId), asc(exerciseSets.position));

  return buildExerciseProgress(groupSetRows(rows), weekStart, weekEnd);
};
