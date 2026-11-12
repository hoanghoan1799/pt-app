"use client";

import { parseDecimal } from "@pt/contracts";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SHARE_TOTAL_PERCENT } from "@/features/meal-plans/constants/meal-plans";
import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import { setMealSharesAction } from "@/features/meal-plans/services/meal-plan-actions";
import type { PlanMeal } from "@/features/meal-plans/types/meal-plan";

const toText = (value: number) => String(value).replace(".", ",");

// "Chia theo %": a percent per meal that must total 100; "Chia đều" clears them.
export const useMealShares = (
  userId: number,
  dayId: number,
  meals: PlanMeal[],
  onDone: () => void,
) => {
  const t = useTranslations("mealPlans.useMealShares");
  const [texts, setTexts] = useState(() => {
    // Equal start that already totals 100: the last meal takes the remainder.
    const each = Math.round((SHARE_TOTAL_PERCENT / meals.length) * 10) / 10;
    const last =
      Math.round((SHARE_TOTAL_PERCENT - each * (meals.length - 1)) * 10) / 10;

    return meals.map((meal, index) =>
      toText(meal.sharePercent ?? (index === meals.length - 1 ? last : each)),
    );
  });
  const { isPending, run } = useMealPlanAction();

  const percents = texts.map(parseDecimal);
  const total = percents.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
  const isValid =
    percents.every((value) => Number.isFinite(value) && value > 0) &&
    Math.abs(total - SHARE_TOTAL_PERCENT) < 1e-6;

  const setText = (index: number, value: string) => {
    setTexts((previous) =>
      previous.map((text, i) => (i === index ? value : text)),
    );
  };

  const save = () => {
    run(
      () =>
        setMealSharesAction({
          userId,
          dayId,
          shares: meals.map((meal, index) => ({
            mealId: meal.id,
            percent: percents[index],
          })),
        }),
      { successMessage: t("sharesSaved"), onSuccess: onDone },
    );
  };

  const resetToEqual = () => {
    run(() => setMealSharesAction({ userId, dayId, shares: null }), {
      successMessage: t("sharesEqual"),
      onSuccess: onDone,
    });
  };

  return {
    texts,
    setText,
    total: Math.round(total * 10) / 10,
    isValid,
    save,
    resetToEqual,
    isPending,
  };
};
