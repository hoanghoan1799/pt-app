"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  MACRO_GAP_LABEL_KEYS,
  MAX_GAP_SUGGESTIONS,
} from "@/features/meal-plans/constants/meal-plans";
import type {
  MealGapNotice as GapNotice,
  PlanFood,
} from "@/features/meal-plans/types/meal-plan";
import { suggestFoodsForGap } from "@/features/meal-plans/utils/plan-status";

interface MealGapNoticeProps {
  gaps: GapNotice[];
  library: PlanFood[];
  takenFoodIds: number[];
  isDisabled: boolean;
  onAdd: (food: PlanFood, grams: number) => void;
}

// Q6: says which macro the meal is short of (or over) and offers library
// foods of the group that fills it.
export const MealGapNotice = ({
  gaps,
  library,
  takenFoodIds,
  isDisabled,
  onAdd,
}: MealGapNoticeProps) => {
  const t = useTranslations("mealPlans.mealGapNotice");
  const tLabels = useTranslations("mealPlans.labels");

  if (!gaps.length) {
    return null;
  }

  return (
    <div
      className="space-y-2 rounded-xl bg-warning/10 px-3 py-2.5"
      role="status"
    >
      {gaps.map((gap) => {
        const suggestions =
          gap.kind === "short"
            ? suggestFoodsForGap(
                gap.macro,
                gap.grams,
                library,
                takenFoodIds,
                MAX_GAP_SUGGESTIONS,
              )
            : [];

        return (
          <div key={gap.macro} className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t(gap.kind === "short" ? "short" : "over", {
                grams: gap.grams,
                macro: tLabels(MACRO_GAP_LABEL_KEYS[gap.macro]),
              })}
            </p>
            {suggestions.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {suggestions.map(({ food, grams }) => (
                  <li key={food.id}>
                    <button
                      type="button"
                      disabled={isDisabled}
                      aria-busy={isDisabled}
                      onClick={() => onAdd(food, grams)}
                      className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-medium text-fg transition active:bg-line disabled:opacity-50"
                    >
                      {t("addFood", { grams, name: food.name })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};
