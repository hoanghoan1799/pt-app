"use client";

import { ChevronDown, ChevronUp, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY, CARD, ICON_BUTTON } from "@/constants/styles";
import { FoodPicker } from "@/features/meal-plans/components/FoodPicker";
import { MacroChips } from "@/features/meal-plans/components/MacroChips";
import { MealCollapseToggle } from "@/features/meal-plans/components/MealCollapseToggle";
import { MealGapNotice } from "@/features/meal-plans/components/MealGapNotice";
import { MealItemRow } from "@/features/meal-plans/components/MealItemRow";
import { MealLogSummary } from "@/features/meal-plans/components/MealLogSummary";
import { useMealCard } from "@/features/meal-plans/hooks/use-meal-card";
import { useMealName } from "@/features/meal-plans/hooks/use-meal-name";
import { useMealNameInput } from "@/features/meal-plans/hooks/use-meal-name-input";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type {
  MealTarget,
  PlanFood,
  PlanMeal,
} from "@/features/meal-plans/types/meal-plan";
import { describeMealGaps } from "@/features/meal-plans/utils/plan-status";
import { kcalOf, sumItems } from "@/features/meal-plans/utils/plan-totals";

interface MealCardProps {
  userId: number;
  meal: PlanMeal;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isOnly: boolean;
  // Null when the member has no nutrition target on this date.
  target: MealTarget | null;
  library: PlanFood[];
  // What the trainee logged and marked for this meal (read-only here).
  logs: MealLog[];
  mark: MealMark | null;
  onMove: (direction: -1 | 1) => void;
  isReordering: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const roundGap = (value: number) => Math.round(value * 10) / 10;

export const MealCard = ({
  userId,
  meal,
  index,
  isFirst,
  isLast,
  isOnly,
  target,
  library,
  logs,
  mark,
  onMove,
  isReordering,
  isCollapsed,
  onToggleCollapse,
}: MealCardProps) => {
  const t = useTranslations("mealPlans.mealCard");
  const confirm = useConfirm();
  const card = useMealCard(userId, meal);
  const mealName = useMealName()(meal.name);
  const nameInput = useMealNameInput(meal.name, mealName, card.rename);
  const totals = sumItems(meal.items);
  const takenFoodIds = meal.items.map((item) => item.foodId);
  const gaps =
    target && meal.items.length
      ? describeMealGaps({
          carbs: roundGap(target.carbs - totals.carbs),
          protein: roundGap(target.protein - totals.protein),
          fat: roundGap(target.fat - totals.fat),
        })
      : [];
  const isBusy = card.isPending || isReordering;
  const solvableCount = meal.items.length - card.fixedIds.length;
  const bodyId = `meal-${meal.id}-body`;

  return (
    <section
      className={`${CARD} flex flex-col gap-3 p-4`}
      aria-label={t("sectionLabel", { index: index + 1, name: mealName })}
    >
      <div className="flex items-center gap-1">
        <MealCollapseToggle
          mealName={mealName}
          isCollapsed={isCollapsed}
          controlsId={bodyId}
          onToggle={onToggleCollapse}
        />
        <input
          aria-label={t("mealNameLabel", { index: index + 1 })}
          value={nameInput.name}
          onChange={(event) => nameInput.setName(event.target.value)}
          onBlur={nameInput.handleBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          maxLength={40}
          className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-lg font-bold text-fg focus:bg-surface focus:ring-2 focus:ring-accent/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={isFirst || isBusy}
          className={ICON_BUTTON}
          aria-label={t("moveUp", { name: mealName })}
        >
          <ChevronUp className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={isLast || isBusy}
          className={ICON_BUTTON}
          aria-label={t("moveDown", { name: mealName })}
        >
          <ChevronDown className="size-5" />
        </button>
        <button
          type="button"
          onClick={async () => {
            if (
              !meal.items.length ||
              (await confirm({
                title: t("deleteMealQuestion", { meal: mealName }),
                confirmLabel: t("confirmDelete"),
                isDanger: true,
              }))
            ) {
              card.remove();
            }
          }}
          disabled={isOnly || isBusy}
          aria-busy={isBusy}
          className={`${ICON_BUTTON} text-danger`}
          aria-label={t("deleteMeal", { name: mealName })}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {isCollapsed && (
        <p className="text-sm text-muted tabular-nums">
          {Math.round(kcalOf(totals))} kcal
          {target && ` / ${Math.round(target.kcal)} kcal`}
          {t("collapsedFoods", { count: meal.items.length })}
        </p>
      )}

      <div id={bodyId} hidden={isCollapsed} className="space-y-3">
        {target ? (
          <p className="text-xs text-muted tabular-nums">
            {t("mealTarget", {
              share:
                meal.sharePercent !== null ? ` (${meal.sharePercent}%)` : "",
              kcal: Math.round(target.kcal),
              protein: target.protein,
              carbs: target.carbs,
              fat: target.fat,
            })}
          </p>
        ) : (
          <p className="text-xs text-muted">{t("noTargetToday")}</p>
        )}

        {meal.items.length > 0 && (
          <ul className="divide-y divide-line">
            {meal.items.map((item) => (
              <MealItemRow
                // Remounts when the grams change from outside (auto solve).
                key={`${item.id}-${item.grams}`}
                item={item}
                isFixed={card.fixedIds.includes(item.id)}
                isDisabled={isBusy}
                onGramsChange={(grams) => card.setGrams(item.id, grams)}
                onToggleFixed={() => card.toggleFixed(item.id)}
                onRemove={() => card.removeItem(item.id)}
              />
            ))}
          </ul>
        )}

        <FoodPicker
          mealName={mealName}
          library={library}
          takenFoodIds={takenFoodIds}
          isDisabled={isBusy}
          onPick={(food) => card.addFood(food)}
        />

        {meal.items.length > 0 && (
          <div className="space-y-2">
            <p
              className="text-sm font-semibold text-fg tabular-nums"
              aria-label={t("totalLabel", { name: mealName })}
            >
              {Math.round(kcalOf(totals))} kcal
              {target && (
                <span className="font-normal text-muted">
                  {" "}
                  / {Math.round(target.kcal)} kcal
                </span>
              )}
            </p>
            <MacroChips totals={totals} target={target} />
            <MealGapNotice
              gaps={gaps}
              library={library}
              takenFoodIds={takenFoodIds}
              isDisabled={isBusy}
              onAdd={(food, grams) => card.addFood(food, grams)}
            />
            <button
              type="button"
              onClick={card.solve}
              disabled={isBusy || !target || solvableCount < 1}
              aria-busy={isBusy}
              className={`${BUTTON_PRIMARY} w-full`}
            >
              {card.isPending ? (
                <Spinner size="md" />
              ) : (
                <Sparkles className="size-5" aria-hidden />
              )}
              {t("autoSolve")}
            </button>
            {!target && (
              <p className="text-xs text-muted">{t("setTargetFirst")}</p>
            )}
            {target && solvableCount < 1 && (
              <p className="text-xs text-muted">{t("allFixed")}</p>
            )}
          </div>
        )}

        <MealLogSummary items={meal.items} logs={logs} mark={mark} />
      </div>
    </section>
  );
};
