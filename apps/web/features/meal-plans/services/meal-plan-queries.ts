import "server-only";

import { listFoods } from "@/features/foods/services/food-queries";
import type { PlanFood } from "@/features/meal-plans/types/meal-plan";
import {
  toMealLogData,
  toPlanDays,
  toPlanFood,
} from "@/features/meal-plans/utils/plan-mapping";
import { callApi } from "@/services/api/call";
import type { ApiActor } from "@/services/api/client";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// The active library the PT (or the trainee) searches when adding a food to a
// meal or a log, named and sorted in `locale`.
export const listPlanFoods = async (
  actor: Exclude<ApiActor, "none">,
  locale: Locale = DEFAULT_LOCALE,
): Promise<PlanFood[]> =>
  (await listFoods(actor))
    .map((food) => toPlanFood(food, false, locale))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

// The trainee's own week: plan, completion, logs, marks and what they asked
// the PT for. `mealIds` of the selected day narrow the logs and marks.
export const getTraineeMealPlan = async (
  weekStart: string,
  selectedDate: string,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const week = await callApi("user", (api) =>
    api.GET("/v1/me/meal-plan-days", {
      params: { query: { week: weekStart } },
    }),
  );
  const days = toPlanDays(week.days, locale);
  const selectedPlan = days.find((day) => day.date === selectedDate) ?? null;
  const { logs, marks } = toMealLogData(
    week.logs,
    week.marks,
    selectedPlan?.meals.map((meal) => meal.id) ?? [],
    locale,
  );

  return {
    selectedPlan,
    completion: week.completion,
    preferences: week.preferences,
    logs,
    marks,
  };
};

// The PT's view of one trainee's week: the same data plus what the copy sheet,
// "Áp dụng tuần trước" and the kcal notices need. The API checks the PT's
// workspace and the hidden state.
export const getPtMealPlan = async (
  userId: number,
  weekStart: string,
  selectedDate: string,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const week = await callApi("admin", (api) =>
    api.GET("/v1/trainees/{userId}/meal-plan-days", {
      params: { path: { userId: userId }, query: { week: weekStart } },
    }),
  );
  const days = toPlanDays(week.days, locale);
  const selectedPlan = days.find((day) => day.date === selectedDate) ?? null;
  const { logs, marks } = toMealLogData(
    week.logs,
    week.marks,
    selectedPlan?.meals.map((meal) => meal.id) ?? [],
    locale,
  );

  return {
    days,
    selectedPlan,
    completion: week.completion,
    preferences: week.preferences,
    logs,
    marks,
    lastWeekPlanCount: week.lastWeekPlanCount,
    nextWeekPlanDates: week.nextWeekPlanDates,
    notices: week.planKcalNotices,
    datesWithLogs: week.datesWithLogs,
  };
};
