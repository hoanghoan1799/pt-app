import "server-only";

import type { ExerciseProgressRow } from "@/features/members/types/progress";
import { callApi } from "@/services/api/call";

// Admin-only: called from pages under app/admin/(protected) after
// requireAdmin() (C10). The API compares the selected week's best set per
// exercise link with everything logged before it ("Tiến bộ", F4).
export const getExerciseProgress = async (
  userId: number,
  weekStart: string,
): Promise<ExerciseProgressRow[]> => {
  const { rows } = await callApi("admin", (api) =>
    api.GET("/v1/trainees/{userId}/progress", {
      params: { path: { userId: String(userId) }, query: { week: weekStart } },
    }),
  );

  return rows;
};
