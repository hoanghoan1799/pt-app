"use client";

import { CalendarX2 } from "lucide-react";

import { CARD } from "@/constants/styles";
import { MacroChips } from "@/features/meal-plans/components/MacroChips";
import { MealPlanTitle } from "@/features/meal-plans/components/MealPlanTitle";
import { TraineeMealCard } from "@/features/meal-plans/components/TraineeMealCard";
import { useMealCollapse } from "@/features/meal-plans/hooks/use-meal-collapse";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type { PlanDay, PlanFood } from "@/features/meal-plans/types/meal-plan";
import {
  countMealNutrition,
  sumLogNutrition,
} from "@/features/meal-plans/utils/meal-log";
import { splitDayTarget } from "@/features/meal-plans/utils/meal-targets";
import { kcalOf, sumMeals } from "@/features/meal-plans/utils/plan-totals";
import type { MacroAmounts } from "@/features/nutrition/types/nutrition";

interface TraineeMealPlanProps {
  plan: PlanDay | null;
  target: MacroAmounts | null;
  logs: MealLog[];
  marks: MealMark[];
  library: PlanFood[];
  isLoggable: boolean;
}

// The trainee's Dinh dưỡng page for the selected day (R6, C5): the PT's plan
// per meal, read-only, with what was eaten against it.
export const TraineeMealPlan = ({
  plan,
  target,
  logs,
  marks,
  library,
  isLoggable,
}: TraineeMealPlanProps) => {
  const collapse = useMealCollapse(plan?.meals.map((meal) => meal.id) ?? []);

  if (!plan) {
    return (
      <section className="space-y-3" aria-label="Plan bữa ăn">
        <MealPlanTitle />
        <div
          className={`${CARD} flex items-center gap-3 px-4 py-5 text-sm text-muted`}
        >
          <CalendarX2 className="size-5 shrink-0" aria-hidden />
          PT chưa lên plan bữa ăn cho ngày này.
        </div>
      </section>
    );
  }

  const split = target
    ? splitDayTarget(
        target,
        plan.meals.map((meal) => meal.sharePercent),
      )
    : null;
  const mealTargets = split?.ok ? split.meals : null;
  const planned = sumMeals(plan.meals);
  // Same rule as each meal card: logs, or the plan when the meal is marked.
  const eaten = sumLogNutrition(
    plan.meals.map((meal) =>
      countMealNutrition(
        meal.items,
        logs.filter((log) => log.mealId === meal.id),
        marks.some((mark) => mark.mealId === meal.id && mark.achieved),
        marks.find((mark) => mark.mealId === meal.id)?.frozen,
      ),
    ),
  );

  return (
    <section className="space-y-3" aria-label="Plan bữa ăn">
      <MealPlanTitle
        isAllCollapsed={collapse.isAllCollapsed}
        onToggleAll={
          collapse.isAllCollapsed ? collapse.expandAll : collapse.collapseAll
        }
      />
      {plan.meals.map((meal, index) => (
        <TraineeMealCard
          key={meal.id}
          meal={meal}
          index={index}
          target={mealTargets?.[index] ?? null}
          logs={logs.filter((log) => log.mealId === meal.id)}
          mark={marks.find((mark) => mark.mealId === meal.id) ?? null}
          library={library}
          isLoggable={isLoggable}
          isCollapsed={collapse.isCollapsed(meal.id)}
          onToggleCollapse={() => collapse.toggle(meal.id)}
        />
      ))}

      <section className={`${CARD} space-y-3 p-4`} aria-label="Đã ăn cả ngày">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-bold text-fg">Đã ăn cả ngày</h3>
          <p className="text-sm font-semibold text-fg tabular-nums">
            {Math.round(eaten.kcal)} kcal
            <span className="font-normal text-muted">
              {" "}
              / {Math.round(kcalOf(planned))} kcal (plan)
            </span>
          </p>
        </div>
        <MacroChips totals={eaten} target={planned} />
      </section>
    </section>
  );
};
