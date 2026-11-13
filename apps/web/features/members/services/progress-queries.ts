import "server-only";

import type { ExerciseProgressRow } from "@/features/members/types/progress";
import { callApi } from "@/services/api/call";

// Admin-only: called from pages under app/admin/(protected) after
// requireAdmin(). One row per exercise link: the selected week's best against
// the best of every earlier week (computed by the API).
export const getExerciseProgress = async (
  userId: number,
  weekStart: string,
): Promise<ExerciseProgressRow[]> => {
  const { rows } = await callApi("admin", (api) =>
    api.GET("/v1/trainees/{userId}/progress", {
      params: { path: { userId: String(userId) }, query: { week: weekStart } },
    }),
  );

  return rows.map((row) => ({
    youtubeId: row.youtubeId,
    title: row.title,
    weekBest: row.weekBest,
    previousBest: row.previousBest,
    changeKg: row.changeKg,
    trend: row.trend,
    lastDate: row.lastDate,
  }));
};
