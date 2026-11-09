"use client";

import clsx from "clsx";
import { Lock, LockOpen, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { ICON_BUTTON, INPUT } from "@/constants/styles";
import { FOOD_STATE_LABELS } from "@/features/foods/constants/foods";
import { formatKcal } from "@/features/foods/utils/food-math";
import { useGramsInput } from "@/features/meal-plans/hooks/use-grams-input";
import type { PlanItem } from "@/features/meal-plans/types/meal-plan";
import { kcalOf, macrosOf } from "@/features/meal-plans/utils/plan-totals";

interface MealItemRowProps {
  item: PlanItem;
  isFixed: boolean;
  isDisabled: boolean;
  onGramsChange: (grams: number) => void;
  onToggleFixed: () => void;
  onRemove: () => void;
}

const round = (value: number) =>
  (Math.round(value * 10) / 10).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
  });

export const MealItemRow = ({
  item,
  isFixed,
  isDisabled,
  onGramsChange,
  onToggleFixed,
  onRemove,
}: MealItemRowProps) => {
  const t = useTranslations("mealPlans.mealItemRow");
  const tFoods = useTranslations("foods.labels");
  const { food } = item;
  const gramsInput = useGramsInput(item.grams, onGramsChange);
  const macros = macrosOf(food, item.grams);

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-medium text-fg">
            {food.name}
            {food.state && (
              <span className="font-normal text-muted">
                {" "}
                · {tFoods(FOOD_STATE_LABELS[food.state])}
              </span>
            )}
          </p>
          {food.isArchived && (
            <p className="mt-0.5 text-xs font-medium text-warning">
              {t("archived")}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted tabular-nums">
            {formatKcal(kcalOf(macros))} kcal · P {round(macros.protein)} · C{" "}
            {round(macros.carbs)} · F {round(macros.fat)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={isDisabled}
          className={`${ICON_BUTTON} -mt-1.5 -mr-2 text-danger`}
          aria-label={t("delete", { name: food.name })}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-32">
          <input
            aria-label={t("gramsLabel", { name: food.name })}
            value={gramsInput.text}
            onChange={(event) => gramsInput.setText(event.target.value)}
            onBlur={gramsInput.handleBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            inputMode="decimal"
            className={`${INPUT} pr-9 text-right tabular-nums`}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
            g
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleFixed}
          aria-pressed={isFixed}
          aria-label={t("lockLabel", { name: food.name })}
          className={clsx(
            "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition active:scale-[0.98]",
            isFixed
              ? "border-accent bg-accent/10 text-accent"
              : "border-line text-muted",
          )}
        >
          {isFixed ? (
            <Lock className="size-4" aria-hidden />
          ) : (
            <LockOpen className="size-4" aria-hidden />
          )}
          {isFixed ? t("fixed") : t("auto")}
        </button>
      </div>
    </li>
  );
};
