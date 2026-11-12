"use client";

import { Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/common/Input";
import {
  FOOD_GROUPS,
  FOOD_STATE_LABELS,
} from "@/features/foods/constants/foods";
import { useFoodPicker } from "@/features/meal-plans/hooks/use-food-picker";
import type { PlanFood } from "@/features/meal-plans/types/meal-plan";

interface FoodPickerProps {
  mealName: string;
  library: PlanFood[];
  takenFoodIds: number[];
  isDisabled: boolean;
  onPick: (food: PlanFood) => void;
}

export const FoodPicker = ({
  mealName,
  library,
  takenFoodIds,
  isDisabled,
  onPick,
}: FoodPickerProps) => {
  const t = useTranslations("mealPlans.foodPicker");
  const tFoods = useTranslations("foods.labels");
  const picker = useFoodPicker(library, takenFoodIds);
  const inputId = useId();

  const handlePick = (food: PlanFood) => {
    onPick(food);
    picker.clear();
  };

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="sr-only">
        {t("addTo", { meal: mealName })}
      </label>
      <Input
        id={inputId}
        type="search"
        clearable
        leadingIcon={<Search className="size-5" aria-hidden />}
        value={picker.query}
        onChange={(event) => picker.setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
      />
      {picker.isSearching &&
        (picker.results.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {picker.results.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handlePick(food)}
                  className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition active:bg-line disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug text-fg">
                      {food.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {tFoods(FOOD_GROUPS[food.group].labelKey)}
                      {food.state
                        ? ` · ${tFoods(FOOD_STATE_LABELS[food.state])}`
                        : ""}
                      {" · "}
                      {food.kcal} kcal/100 g
                    </span>
                  </span>
                  <Plus className="size-5 shrink-0 text-accent" aria-hidden />
                  <span className="sr-only">
                    {t("pickFood", { name: food.name })}
                  </span>
                </button>
              </li>
            ))}
            {picker.hasMore && (
              <li className="px-3 py-2 text-xs text-muted">
                {t("moreResults")}
              </li>
            )}
          </ul>
        ) : (
          <p className="px-1 text-sm text-muted">{t("noResults")}</p>
        ))}
    </div>
  );
};
