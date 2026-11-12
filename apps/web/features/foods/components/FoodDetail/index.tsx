import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";

import { CARD } from "@/constants/styles";
import { FoodAmountCalculator } from "@/features/foods/components/FoodAmountCalculator";
import { MacroSplitBar } from "@/features/foods/components/MacroSplitBar";
import {
  FOOD_GROUPS,
  FOOD_STATE_LABELS,
} from "@/features/foods/constants/foods";
import type { Food } from "@/features/foods/types/food";
import {
  formatGrams,
  formatKcal,
  macroSplit,
} from "@/features/foods/utils/food-math";
import {
  MACRO_COLORS,
  MACRO_LABELS,
} from "@/features/nutrition/constants/nutrition";

interface FoodDetailProps {
  food: Food;
}

const MACRO_ORDER = ["protein", "carbs", "fat"] as const;

// What a food is made of per 100 g, plus the amount calculator. Read-only:
// the admin page adds the edit form below it.
export const FoodDetail = ({ food }: FoodDetailProps) => {
  const locale = useLocale();
  const t = useTranslations("foods.foodDetail");
  const tFoodLabels = useTranslations("foods.labels");
  const tNutritionLabels = useTranslations("nutrition.labels");
  const group = FOOD_GROUPS[food.group];
  const Icon = group.icon;
  const split = macroSplit(food);

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-4 p-4`}>
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl",
              group.tile,
            )}
          >
            <Icon className="size-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted">
              {tFoodLabels(group.labelKey)}
              {food.state && ` · ${tFoodLabels(FOOD_STATE_LABELS[food.state])}`}
            </p>
            <p className="text-3xl font-bold text-fg tabular-nums">
              {formatKcal(food.kcal, locale)}{" "}
              <span className="text-base font-medium text-muted">
                kcal / 100 g
              </span>
            </p>
          </div>
        </div>

        <MacroSplitBar split={split} />

        <dl className="grid grid-cols-3 gap-2">
          {MACRO_ORDER.map((macro) => (
            <div
              key={macro}
              className={clsx(
                "rounded-xl px-2 py-3 text-center",
                MACRO_COLORS[macro].soft,
              )}
            >
              <dt
                className={clsx(
                  "text-xs font-semibold",
                  MACRO_COLORS[macro].text,
                )}
              >
                {t("macroShare", {
                  name: tNutritionLabels(MACRO_LABELS[macro].nameKey),
                  percent: split[macro],
                })}
              </dt>
              <dd className="mt-0.5 text-lg font-bold text-fg tabular-nums">
                {formatGrams(food[macro], locale)}
                <span className="text-xs font-medium text-muted"> g</span>
              </dd>
            </div>
          ))}
        </dl>

        <ul className="space-y-1 text-sm text-muted">
          {food.fiber !== null && (
            <li>{t("fiber", { grams: formatGrams(food.fiber, locale) })}</li>
          )}
          {food.servingLabel && food.servingGrams && (
            <li>
              {t("serving", {
                label: food.servingLabel,
                grams: formatGrams(food.servingGrams, locale),
              })}
            </li>
          )}
          {food.source && <li>{t("source", { source: food.source })}</li>}
        </ul>
      </section>

      <FoodAmountCalculator key={food.id} food={food} />
    </div>
  );
};
