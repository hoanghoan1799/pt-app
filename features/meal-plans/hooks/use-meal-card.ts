"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import {
  addItemAction,
  autoSolveMealAction,
  removeItemAction,
  removeMealAction,
  renameMealAction,
  updateItemGramsAction,
} from "@/features/meal-plans/services/meal-plan-actions";
import type { PlanFood, PlanMeal } from "@/features/meal-plans/types/meal-plan";

// Everything one meal card does to the plan. `fixedIds` (items that keep
// their grams in "Tính tự động") only lives on screen.
export const useMealCard = (userId: number, meal: PlanMeal) => {
  const t = useTranslations("mealPlans.useMealCard");
  const { isPending, run } = useMealPlanAction();
  const [fixedIds, setFixedIds] = useState<number[]>([]);

  const toggleFixed = (itemId: number) => {
    setFixedIds((previous) =>
      previous.includes(itemId)
        ? previous.filter((id) => id !== itemId)
        : [...previous, itemId],
    );
  };

  return {
    isPending,
    fixedIds,
    toggleFixed,
    rename: (name: string) =>
      run(() => renameMealAction({ userId, mealId: meal.id, name })),
    remove: () =>
      run(() => removeMealAction({ userId, mealId: meal.id }), {
        successMessage: t("mealRemoved"),
      }),
    addFood: (food: PlanFood, grams?: number) =>
      run(() =>
        addItemAction({ userId, mealId: meal.id, foodId: food.id, grams }),
      ),
    removeItem: (itemId: number) =>
      run(() => removeItemAction({ userId, itemId }), {
        onSuccess: () =>
          setFixedIds((previous) => previous.filter((id) => id !== itemId)),
      }),
    setGrams: (itemId: number, grams: number) =>
      run(() => updateItemGramsAction({ userId, itemId, grams })),
    solve: () =>
      run(
        () =>
          autoSolveMealAction({
            userId,
            mealId: meal.id,
            fixedItemIds: fixedIds.filter((id) =>
              meal.items.some((item) => item.id === id),
            ),
          }),
        { successMessage: t("gramsSolved") },
      ),
  };
};
