"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { TIME_ZONE } from "@/constants/time";
import { db } from "@/db";
import { exerciseCompletions, exercises, workoutDays } from "@/db/schema";
import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireUser } from "@/services/auth-guard";
import type { ActionResult } from "@/types/error";
import { getAdminUserPath } from "@/utils/routes";
import { getTodayDate } from "@/utils/week";

// Sets (not toggles) the state so a double tap can't flip it back.
export const setExerciseCompletionAction = withResultErrorHandling(
  "setExerciseCompletion",
  async (exerciseId: number, isCompleted: boolean): Promise<ActionResult> => {
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
      return {
        status: "error",
        message: WORKOUT_MESSAGES.COMPLETION_TOO_EARLY,
      };
    }

    if (isCompleted) {
      // Existence is re-checked inside the write transaction (libSQL opens it
      // with BEGIN IMMEDIATE), so a PT deleting the exercise meanwhile can't
      // leave an orphan completion: foreign keys are not enforced (D10).
      const inserted = await db.transaction(async (tx) => {
        const [stillThere] = await tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(eq(exercises.id, exercise.id))
          .limit(1);

        if (!stillThere) {
          return false;
        }

        await tx
          .insert(exerciseCompletions)
          .values({
            exerciseId: exercise.id,
            userId: user.id,
            completedAt: new Date(),
          })
          .onConflictDoNothing();
        return true;
      });

      if (!inserted) {
        // The page was stale (the PT deleted the exercise): refresh it.
        revalidatePath(ROUTES.WORKOUTS);
        return {
          status: "error",
          message: WORKOUT_MESSAGES.EXERCISE_NOT_FOUND,
        };
      }
    } else {
      await db
        .delete(exerciseCompletions)
        .where(eq(exerciseCompletions.exerciseId, exercise.id));
    }

    revalidatePath(ROUTES.WORKOUTS);
    revalidatePath(ROUTES.ADMIN, "layout");
    revalidatePath(getAdminUserPath(user.id), "layout");
    return { status: "success" };
  },
);
