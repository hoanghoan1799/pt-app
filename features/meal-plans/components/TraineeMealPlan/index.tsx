"use client";

import { CalendarX2 } from "lucide-react";

import { CARD } from "@/constants/styles";
import { MealPlanTitle } from "@/features/meal-plans/components/MealPlanTitle";
import { TraineeMealCard } from "@/features/meal-plans/components/TraineeMealCard";
import { useMealCollapse } from "@/features/meal-plans/hooks/use-meal-collapse";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type { PlanDay, PlanFood } from "@/features/meal-plans/types/meal-plan";
import { splitDayTarget } from "@/features/meal-plans/utils/meal-targets";
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
    </section>
  );
};
