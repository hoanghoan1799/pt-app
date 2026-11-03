"use client";

import { Plus } from "lucide-react";

import { BUTTON_PRIMARY, CARD } from "@/constants/styles";
import { MacroChips } from "@/features/meal-plans/components/MacroChips";
import { MealCollapseToggle } from "@/features/meal-plans/components/MealCollapseToggle";
import { MealLogList } from "@/features/meal-plans/components/MealLogList";
import { MealLogSheet } from "@/features/meal-plans/components/MealLogSheet";
import { MealMarkPanel } from "@/features/meal-plans/components/MealMarkPanel";
import { useTraineeMealCard } from "@/features/meal-plans/hooks/use-trainee-meal-card";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type {
  MealTarget,
  PlanFood,
  PlanMeal,
} from "@/features/meal-plans/types/meal-plan";
import {
  formatLogGrams,
  sumLogNutrition,
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
  const card = useTraineeMealCard();
  const planned = sumItems(meal.items);
  const eaten = sumLogNutrition(logs.map((log) => log.nutrition));
  const bodyId = `meal-${meal.id}-body`;

  return (
    <section
      className={`${CARD} flex flex-col gap-3 p-4`}
      aria-label={`Bữa ${index + 1}: ${meal.name}`}
    >
      <div className="flex items-start gap-1">
        <div className="-ml-2">
          <MealCollapseToggle
            mealName={meal.name}
            isCollapsed={isCollapsed}
            controlsId={bodyId}
            onToggle={onToggleCollapse}
          />
        </div>
        <div className="min-w-0 flex-1 self-center">
          <h3 className="text-lg font-bold text-fg">{meal.name}</h3>
          {target && (
            <p className="mt-0.5 text-xs text-muted tabular-nums">
              Mục tiêu bữa: {Math.round(target.kcal)} kcal · P {target.protein}{" "}
              · C {target.carbs} · F {target.fat}
            </p>
          )}
        </div>
      </div>

      {isCollapsed && (
        <p className="text-sm text-muted tabular-nums">
          Đã ăn {Math.round(eaten.kcal)} / {Math.round(kcalOf(planned))} kcal
        </p>
      )}

      <div id={bodyId} hidden={isCollapsed} className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Plan của PT
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
            <p className="mt-1 text-sm text-muted">
              PT chưa thêm món cho bữa này.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Đã ăn
          </p>
          {logs.length ? (
            <MealLogList
              logs={logs}
              onEdit={isLoggable ? card.openEdit : undefined}
              onRemove={isLoggable ? card.remove : undefined}
              isDisabled={card.isPending}
            />
          ) : (
            <p className="mt-1 text-sm text-muted">Chưa ghi món nào.</p>
          )}
        </div>

        {logs.length > 0 && (
          <div className="space-y-2">
            <p
              className="text-sm font-semibold text-fg tabular-nums"
              aria-label={`Đã ăn ${meal.name}`}
            >
              {Math.round(eaten.kcal)} kcal
              <span className="font-normal text-muted">
                {" "}
                / {Math.round(kcalOf(planned))} kcal (plan)
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
              aria-label={`Ghi món đã ăn vào ${meal.name}`}
            >
              <Plus className="size-5" aria-hidden />
              Ghi món đã ăn
            </button>
            <MealMarkPanel mealId={meal.id} mealName={meal.name} mark={mark} />
            <MealLogSheet
              isOpen={card.sheet.isOpen}
              onOpenChange={card.setIsOpen}
              mealId={meal.id}
              mealName={meal.name}
              library={library}
              editing={card.sheet.editing}
            />
          </>
        ) : (
          <p className="text-sm text-muted">
            Chưa tới ngày này, quay lại ghi sau nhé.
          </p>
        )}
      </div>
    </section>
  );
};
