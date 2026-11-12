"use client";

import { useState } from "react";

import { useDayPlan } from "@/features/meal-plans/hooks/use-day-plan";
import type { PlanDay } from "@/features/meal-plans/types/meal-plan";

// Sheet state and meal moves for one day of the plan.
export const useMealPlanDay = (userId: number, plan: PlanDay | null) => {
  const dayPlan = useDayPlan(userId);
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [isSharesOpen, setIsSharesOpen] = useState(false);

  const moveMeal = (index: number, direction: -1 | 1) => {
    if (!plan) {
      return;
    }

    const ids = plan.meals.map((meal) => meal.id);
    const target = index + direction;

    if (target < 0 || target >= ids.length) {
      return;
    }
    [ids[index], ids[target]] = [ids[target], ids[index]];
    dayPlan.reorder(plan.id, ids);
  };

  return {
    dayPlan,
    isCopyOpen,
    setIsCopyOpen,
    isSharesOpen,
    setIsSharesOpen,
    moveMeal,
  };
};
