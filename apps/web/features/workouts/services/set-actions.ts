"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import {
  exerciseSetsSchema,
  type SetInput,
} from "@/features/workouts/utils/sets";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { requireUser } from "@/services/auth-guard";
import type { SaveSetsResult } from "@/types/error";
import { getAdminUserPath } from "@/utils/routes";

// Replaces the exercise's logged sets with `sets` (D1). Saving at least one
// set marks the exercise done (Q4); an empty list only clears the sets (D2).
// The API decides "today and past days only", the stale-link check and the
// personal-best flag.
export const saveExerciseSetsAction = withResultErrorHandling(
  "saveExerciseSets",
  // `sets` comes from the browser, so it is validated despite its type.
  async (exerciseId: number, sets: SetInput[]): Promise<SaveSetsResult> => {
    const user = await requireUser();
    const id = z.number().int().positive().parse(exerciseId);
    const parsed = exerciseSetsSchema.safeParse(sets);

    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? WORKOUT_MESSAGES.INVALID_INPUT,
      };
    }

    const outcome = await tryApi("user", (api) =>
      api.PUT("/v1/me/exercises/{exerciseId}/sets", {
        params: { path: { exerciseId: String(id) } },
        body: { sets: parsed.data },
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
    return { status: "success", personalBest: outcome.data.personalBest };
  },
);
