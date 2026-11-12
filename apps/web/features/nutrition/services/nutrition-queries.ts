import "server-only";

import { callApi } from "@/services/api/call";

// The week view of one trainee, from the API: daily totals against the target
// (the meal plan's logs and marks included), the weekly summary, the body
// profile with its energy plan, and the 12-week weight chart. Without a
// `userId` it is the signed-in trainee's own; with one it is the PT's view of
// that trainee (the API checks the workspace and the hidden state).
export const getNutritionOverview = (weekStart: string, userId?: number) =>
  userId === undefined
    ? callApi("user", (api) =>
        api.GET("/v1/me/nutrition", { params: { query: { week: weekStart } } }),
      )
    : callApi("admin", (api) =>
        api.GET("/v1/trainees/{userId}/nutrition", {
          params: {
            path: { userId: userId },
            query: { week: weekStart },
          },
        }),
      );
