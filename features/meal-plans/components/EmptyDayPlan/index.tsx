"use client";

import { CopyPlus, Plus, UtensilsCrossed } from "lucide-react";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from "@/constants/styles";
import { useDayPlan } from "@/features/meal-plans/hooks/use-day-plan";

interface EmptyDayPlanProps {
  userId: number;
  date: string;
  weekStart: string;
  // Meals a new plan starts with: the trainee's request, else 3.
  newMealCount: number;
  // Days of last week that have a plan.
  lastWeekPlanCount: number;
}

export const EmptyDayPlan = ({
  userId,
  date,
  weekStart,
  newMealCount,
  lastWeekPlanCount,
}: EmptyDayPlanProps) => {
  const t = useTranslations("mealPlans.emptyDayPlan");
  const dayPlan = useDayPlan(userId);

  return (
    <div className={`${CARD} space-y-4 p-4`}>
      <div className="flex items-center gap-3 text-sm text-muted">
        <UtensilsCrossed className="size-5 shrink-0" aria-hidden />
        <p>
          {t.rich("noPlan", {
            strong: (chunks) => (
              <span className="font-semibold text-fg">{chunks}</span>
            ),
          })}
        </p>
      </div>
      <button
        type="button"
        onClick={() => dayPlan.create(date)}
        disabled={dayPlan.isPending}
        aria-busy={dayPlan.isPending}
        className={`${BUTTON_PRIMARY} w-full`}
      >
        {dayPlan.isPending ? (
          <Spinner size="md" />
        ) : (
          <Plus className="size-5" aria-hidden />
        )}
        {t("create")}
      </button>
      <p className="-mt-2 text-xs text-muted">
        {t("newPlanMeals", { count: newMealCount })}
      </p>
      <button
        type="button"
        onClick={() => dayPlan.applyLastWeek(weekStart)}
        disabled={dayPlan.isPending || lastWeekPlanCount === 0}
        aria-busy={dayPlan.isPending}
        className={`${BUTTON_SECONDARY} w-full`}
      >
        {dayPlan.isPending ? (
          <Spinner size="md" />
        ) : (
          <CopyPlus className="size-5" aria-hidden />
        )}
        {t("applyLastWeek")}
      </button>
      <p className="-mt-2 text-xs text-muted">
        {lastWeekPlanCount > 0
          ? t("copyLastWeek", { count: lastWeekPlanCount })
          : t("noLastWeek")}
      </p>
    </div>
  );
};
