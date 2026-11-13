import "server-only";

import { addDays } from "@pt/contracts";

import type { ScheduleDayWithSets } from "@/features/workouts/types/workout";
import { toScheduleDays } from "@/features/workouts/utils/schedule-response";
import { callApi } from "@/services/api/call";

// A week is Monday..Sunday: `weekStart` plus six days.
const weekRange = (weekStart: string) => ({
  from: weekStart,
  to: addDays(weekStart, 6),
});

// The signed-in trainee's own week (their cookie, GET /v1/me/workout-days).
export const getMyWeekSchedule = async (
  weekStart: string,
): Promise<ScheduleDayWithSets[]> => {
  const { days } = await callApi("user", (api) =>
    api.GET("/v1/me/workout-days", {
      params: { query: weekRange(weekStart) },
    }),
  );

  return toScheduleDays(days);
};

// One trainee's week for a PT (their admin cookie). The API checks that the
// trainee is in the PT's workspace and not hidden.
export const getTraineeWeekSchedule = async (
  userId: number,
  weekStart: string,
): Promise<ScheduleDayWithSets[]> => {
  const { days } = await callApi("admin", (api) =>
    api.GET("/v1/trainees/{userId}/workout-days", {
      params: { path: { userId: String(userId) }, query: weekRange(weekStart) },
    }),
  );

  return toScheduleDays(days);
};
