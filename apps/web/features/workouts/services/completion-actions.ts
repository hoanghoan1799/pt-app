"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { requireUser } from "@/services/auth-guard";
import type { ActionResult } from "@/types/error";
import { getAdminUserPath } from "@/utils/routes";

// Sets (not toggles) the state so a double tap can't flip it back. The API
// refuses a day that has not come yet and an exercise the PT deleted.
export const setExerciseCompletionAction = withResultErrorHandling(
  "setExerciseCompletion",
  async (exerciseId: number, isCompleted: boolean): Promise<ActionResult> => {
    const user = await requireUser();
    const id = z.number().int().positive().parse(exerciseId);
    const outcome = await tryApi("user", (api) =>
      api.PUT("/v1/me/exercises/{exerciseId}/completion", {
        params: { path: { exerciseId: String(id) } },
        body: { completed: isCompleted },
      }),
    );

    if (!outcome.ok) {
      if (outcome.error.code === "EXERCISE_NOT_FOUND") {
        // The page was stale (the PT deleted the exercise): refresh it.
        revalidatePath(ROUTES.WORKOUTS);
      }
      return { status: "error", message: outcome.error.message };
    }

    revalidatePath(ROUTES.WORKOUTS);
    revalidatePath(ROUTES.ADMIN, "layout");
    revalidatePath(getAdminUserPath(user.id), "layout");
    return { status: "success" };
  },
);
