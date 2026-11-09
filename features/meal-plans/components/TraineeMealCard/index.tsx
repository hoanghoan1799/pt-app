"use client";

import clsx from "clsx";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { BUTTON_PRIMARY } from "@/constants/styles";
import { MacroChips } from "@/features/meal-plans/components/MacroChips";
import { MealCollapseToggle } from "@/features/meal-plans/components/MealCollapseToggle";
import { MealLogList } from "@/features/meal-plans/components/MealLogList";
import { MealLogSheet } from "@/features/meal-plans/components/MealLogSheet";
import { MealMarkPanel } from "@/features/meal-plans/components/MealMarkPanel";
import { useMealName } from "@/features/meal-plans/hooks/use-meal-name";
import { useTraineeMealCard } from "@/features/meal-plans/hooks/use-trainee-meal-card";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type {
  MealTarget,
  PlanFood,
  PlanMeal,
} from "@/features/meal-plans/types/meal-plan";
import {
  countMealNutrition,
  formatLogGrams,
} from "@/features/meal-plans/utils/meal-log";
import { kcalOf, sumItems } from "@/features/meal-plans/utils/plan-totals";

interface TraineeMealCardProps {
  meal: PlanMeal;
  index: number;
  target: MealTarget | null;
  logs: MealLog[];
  mark: MealMark | null;
  library: PlanFood[];
  // Plan days after today are shown but not logged yet.
  isLoggable: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// One planned meal on the trainee's page: the PT's plan (read-only), what the
// trainee ate, and "Đạt" or a note.
export const TraineeMealCard = ({
  meal,
  index,
  target,
  logs,
  mark,
  library,
  isLoggable,
  isCollapsed,
  onToggleCollapse,
}: TraineeMealCardProps) => {
  const t = useTranslations("mealPlans.traineeMealCard");
  const card = useTraineeMealCard();
  const mealName = useMealName()(meal.name);
  const planned = sumItems(meal.items);
  const isAchieved = mark?.achieved ?? false;
  const eaten = countMealNutrition(meal.items, logs, isAchieved, mark?.frozen);
  const bodyId = `meal-${meal.id}-body`;

  return (
    <section
      data-achieved={isAchieved}
      className={clsx(
        "flex flex-col gap-3 rounded-2xl border p-4",
        isAchieved
          ? "border-success/40 bg-success/10"
          : "border-line bg-surface",
      )}
      aria-label={t("sectionLabel", { index: index + 1, name: mealName })}
    >
      <div className="flex items-start gap-1">
        <div className="-ml-2">
          <MealCollapseToggle
            mealName={mealName}
            isCollapsed={isCollapsed}
            controlsId={bodyId}
            onToggle={onToggleCollapse}
          />
        </div>
        <div className="min-w-0 flex-1 self-center">
          <h3 className="text-lg font-bold text-fg">{mealName}</h3>
          {target && (
            <p className="mt-0.5 text-xs text-muted tabular-nums">
              {t("mealTarget", {
                kcal: Math.round(target.kcal),
                protein: target.protein,
                carbs: target.carbs,
                fat: target.fat,
              })}
            </p>
          )}
        </div>
      </div>

      {isCollapsed && (
        <p className="text-sm text-muted tabular-nums">
          {t("eatenSummary", {
            eaten: Math.round(eaten.kcal),
            planned: Math.round(kcalOf(planned)),
          })}
        </p>
      )}

      <div id={bodyId} hidden={isCollapsed} className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t("ptPlan")}
          </p>
          {meal.items.length ? (
            <ul className="mt-1 divide-y divide-line">
              {meal.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-3 py-2 text-[15px]"
                >
                  <span className="min-w-0 text-fg">{item.food.name}</span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {formatLogGrams(item.grams)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">{t("noFoods")}</p>
          )}
        </div>

        {logs.length > 0 && (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              {t("extraLogged")}
            </p>
            <MealLogList
              logs={logs}
              onEdit={isLoggable ? card.openEdit : undefined}
              onRemove={isLoggable ? card.remove : undefined}
              isDisabled={card.isPending}
            />
          </div>
        )}

        {(logs.length > 0 || isAchieved) && (
          <div className="space-y-2">
            <p
              className="text-sm font-semibold text-fg tabular-nums"
              aria-label={t("eatenLabel", { name: mealName })}
            >
              {Math.round(eaten.kcal)} kcal
              <span className="font-normal text-muted">
                {" "}
                {t("planKcal", { kcal: Math.round(kcalOf(planned)) })}
              </span>
            </p>
            <MacroChips totals={eaten} target={planned} />
          </div>
        )}

        {isLoggable ? (
          <>
            <button
              type="button"
              onClick={card.openAdd}
              className={`${BUTTON_PRIMARY} w-full`}
              aria-label={t("logEatenInto", { name: mealName })}
            >
              <Plus className="size-5" aria-hidden />
              {t("logEaten")}
            </button>
            <MealMarkPanel mealId={meal.id} mealName={mealName} mark={mark} />
            <MealLogSheet
              isOpen={card.sheet.isOpen}
              onOpenChange={card.setIsOpen}
              mealId={meal.id}
              mealName={mealName}
              library={library}
              editing={card.sheet.editing}
            />
          </>
        ) : (
          <p className="text-sm text-muted">{t("futureDay")}</p>
        )}
      </div>
    </section>
  );
};
