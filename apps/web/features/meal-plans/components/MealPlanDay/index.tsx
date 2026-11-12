"use client";

import { MEAL_PLAN_LIMITS } from "@pt/contracts";
import { Copy, Percent, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { BUTTON_SECONDARY } from "@/constants/styles";
import { CopyDaySheet } from "@/features/meal-plans/components/CopyDaySheet";
import { DayPlanSummary } from "@/features/meal-plans/components/DayPlanSummary";
import { EmptyDayPlan } from "@/features/meal-plans/components/EmptyDayPlan";
import { MealCard } from "@/features/meal-plans/components/MealCard";
import { MealPlanTitle } from "@/features/meal-plans/components/MealPlanTitle";
import { MealSharesSheet } from "@/features/meal-plans/components/MealSharesSheet";
import { MemberMealRequest } from "@/features/meal-plans/components/MemberMealRequest";
import { useMealCollapse } from "@/features/meal-plans/hooks/use-meal-collapse";
import { useMealPlanDay } from "@/features/meal-plans/hooks/use-meal-plan-day";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type { PlanDay, PlanFood } from "@/features/meal-plans/types/meal-plan";
import { resolveMealCount } from "@/features/meal-plans/utils/default-meals";
import { splitDayTarget } from "@/features/meal-plans/utils/meal-targets";
import { formatDeletePlanQuestion } from "@/features/meal-plans/utils/overwrite-message";
import { sumMeals } from "@/features/meal-plans/utils/plan-totals";
import type { MacroAmounts } from "@/features/nutrition/types/nutrition";

interface MealPlanDayProps {
  userId: number;
  date: string;
  weekStart: string;
  plan: PlanDay | null;
  // Macro target that applies on this date; null when the PT set none.
  target: MacroAmounts | null;
  library: PlanFood[];
  // The trainee's logs and marks of this day's meals.
  logs: MealLog[];
  marks: MealMark[];
  preferredMealCount: number | null;
  foodNote: string | null;
  lastWeekPlanCount: number;
  // Today in the app time zone, for the copy sheet's month picker.
  today: string;
  // Plans of the loaded weeks; the sheet reads other months itself.
  datesWithPlan: string[];
  datesWithLogs: string[];
}

// S5: the PT's plan for one day of the member's Dinh dưỡng tab.
export const MealPlanDay = ({
  userId,
  date,
  weekStart,
  plan,
  target,
  library,
  logs,
  marks,
  preferredMealCount,
  foodNote,
  lastWeekPlanCount,
  today,
  datesWithPlan,
  datesWithLogs,
}: MealPlanDayProps) => {
  const locale = useLocale();
  const t = useTranslations("mealPlans.mealPlanDay");
  const confirm = useConfirm();
  const day = useMealPlanDay(userId, plan);
  const collapse = useMealCollapse(plan?.meals.map((meal) => meal.id) ?? []);

  if (!plan) {
    return (
      <section className="space-y-3" aria-label={t("sectionLabel")}>
        <MealPlanTitle />
        <MemberMealRequest
          preferredMealCount={preferredMealCount}
          planMealCount={null}
          foodNote={foodNote}
        />
        <EmptyDayPlan
          userId={userId}
          date={date}
          weekStart={weekStart}
          newMealCount={resolveMealCount(preferredMealCount)}
          lastWeekPlanCount={lastWeekPlanCount}
        />
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
  const hasItems = plan.meals.some((meal) => meal.items.length > 0);

  return (
    <section className="space-y-3" aria-label={t("sectionLabel")}>
      <MealPlanTitle
        isAllCollapsed={collapse.isAllCollapsed}
        onToggleAll={
          collapse.isAllCollapsed ? collapse.expandAll : collapse.collapseAll
        }
      />
      <MemberMealRequest
        preferredMealCount={preferredMealCount}
        planMealCount={plan.meals.length}
        foodNote={foodNote}
      />

      {plan.meals.map((meal, index) => (
        <MealCard
          key={meal.id}
          userId={userId}
          meal={meal}
          index={index}
          isFirst={index === 0}
          isLast={index === plan.meals.length - 1}
          isOnly={plan.meals.length === 1}
          target={mealTargets?.[index] ?? null}
          library={library}
          logs={logs.filter((log) => log.mealId === meal.id)}
          mark={marks.find((item) => item.mealId === meal.id) ?? null}
          onMove={(direction) => day.moveMeal(index, direction)}
          isReordering={day.dayPlan.isPending}
          isCollapsed={collapse.isCollapsed(meal.id)}
          onToggleCollapse={() => collapse.toggle(meal.id)}
        />
      ))}

      <button
        type="button"
        onClick={() => day.dayPlan.addMeal(plan.id)}
        disabled={
          day.dayPlan.isPending ||
          plan.meals.length >= MEAL_PLAN_LIMITS.MAX_MEALS_PER_DAY
        }
        aria-busy={day.dayPlan.isPending}
        className={`${BUTTON_SECONDARY} w-full border-dashed`}
      >
        {day.dayPlan.isPending ? (
          <Spinner size="md" />
        ) : (
          <Plus className="size-5" aria-hidden />
        )}
        {t("addMeal")}
      </button>

      <DayPlanSummary
        totals={sumMeals(plan.meals)}
        target={target}
        hasItems={hasItems}
      />

      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => day.setIsCopyOpen(true)}
          className={BUTTON_SECONDARY}
        >
          <Copy className="size-5" aria-hidden />
          {t("copyToDay")}
        </button>
        <button
          type="button"
          onClick={() => day.setIsSharesOpen(true)}
          disabled={!target}
          className={BUTTON_SECONDARY}
        >
          <Percent className="size-5" aria-hidden />
          {t("splitByPercent")}
        </button>
      </div>
      <button
        type="button"
        onClick={async () => {
          const isConfirmed = await confirm({
            title: formatDeletePlanQuestion(
              logs.length > 0 || marks.length > 0,
              locale,
            ),
            confirmLabel: t("confirmDelete"),
            isDanger: true,
          });

          if (isConfirmed) {
            day.dayPlan.remove(plan.id);
          }
        }}
        disabled={day.dayPlan.isPending}
        aria-busy={day.dayPlan.isPending}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm font-medium text-danger disabled:opacity-50"
      >
        {day.dayPlan.isPending ? (
          <Spinner size="sm" />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
        {t("deletePlan")}
      </button>

      <CopyDaySheet
        userId={userId}
        dayId={plan.id}
        sourceDate={date}
        today={today}
        datesWithPlan={datesWithPlan}
        datesWithLogs={datesWithLogs}
        isOpen={day.isCopyOpen}
        onOpenChange={day.setIsCopyOpen}
      />
      <MealSharesSheet
        userId={userId}
        dayId={plan.id}
        meals={plan.meals}
        isOpen={day.isSharesOpen}
        onOpenChange={day.setIsSharesOpen}
      />
    </section>
  );
};
