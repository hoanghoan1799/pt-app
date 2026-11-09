"use client";

import { useTranslations } from "next-intl";

import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import {
  addMealAction,
  applyLastWeekAction,
  createDayPlanAction,
  deleteDayPlanAction,
  reorderMealsAction,
} from "@/features/meal-plans/services/meal-plan-actions";

// What the PT does to a whole day of a member's plan.
export const useDayPlan = (userId: number) => {
  const t = useTranslations("mealPlans.useDayPlan");
  const { isPending, run } = useMealPlanAction();

  return {
    isPending,
    create: (date: string) =>
      run(() => createDayPlanAction({ userId, date }), {
        successMessage: t("planCreated"),
      }),
    applyLastWeek: (weekStart: string) =>
      run(() => applyLastWeekAction({ userId, weekStart }), {
        successMessage: (result) =>
          "copied" in result
            ? result.skipped > 0
              ? t("appliedKeptDays", {
                  copied: result.copied,
                  skipped: result.skipped,
                })
              : t("appliedLastWeek", { copied: result.copied })
            : "",
      }),
    remove: (dayId: number) =>
      run(() => deleteDayPlanAction({ userId, dayId }), {
        successMessage: t("planRemoved"),
      }),
    addMeal: (dayId: number) => run(() => addMealAction({ userId, dayId })),
    reorder: (dayId: number, mealIds: number[]) =>
      run(() => reorderMealsAction({ userId, dayId, mealIds })),
  };
};
