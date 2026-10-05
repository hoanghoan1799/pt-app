"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { TIME_ZONE } from "@/constants/time";
import { db } from "@/db";
import { exerciseCompletions, exercises, workoutDays } from "@/db/schema";
import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { requireUser } from "@/services/auth-guard";
import { getAdminUserPath } from "@/utils/routes";
import { getTodayDate } from "@/utils/week";

type CompletionResult =
  { status: "success" } | { status: "error"; message: string };

// Sets (not toggles) the state so a double tap can't flip it back.
export const setExerciseCompletionAction = async (
  exerciseId: number,
  isCompleted: boolean,
): Promise<CompletionResult> => {
  const user = await requireUser();
  const id = z.number().int().positive().parse(exerciseId);
  const [exercise] = await db
    .select({ id: exercises.id, date: workoutDays.date })
    .from(exercises)
    .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
    .where(and(eq(exercises.id, id), eq(workoutDays.userId, user.id)))
    .limit(1);

  if (!exercise) {
    return { status: "error", message: WORKOUT_MESSAGES.EXERCISE_NOT_FOUND };
  }

  if (exercise.date > getTodayDate(TIME_ZONE)) {
    return { status: "error", message: WORKOUT_MESSAGES.COMPLETION_TOO_EARLY };
  }

  if (isCompleted) {
    await db
      .insert(exerciseCompletions)
      .values({
        exerciseId: exercise.id,
        userId: user.id,
        completedAt: new Date(),
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(exerciseCompletions)
      .where(eq(exerciseCompletions.exerciseId, exercise.id));
  }

  revalidatePath(ROUTES.WORKOUTS);
  revalidatePath(ROUTES.ADMIN, "layout");
  revalidatePath(getAdminUserPath(user.id), "layout");
  return { status: "success" };
};
