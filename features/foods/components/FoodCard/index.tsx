import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CARD } from "@/constants/styles";
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
import { MACRO_COLORS } from "@/features/nutrition/constants/nutrition";

interface FoodCardProps {
  food: Food;
  href: string;
}

export const FoodCard = ({ food, href }: FoodCardProps) => {
  const tLabels = useTranslations("foods.labels");
  const group = FOOD_GROUPS[food.group];
  const Icon = group.icon;

  return (
    <li>
      <Link
        href={href}
        className={clsx(CARD, "flex items-center gap-3 p-3 active:bg-line/50")}
      >
        <span
          className={clsx(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            group.tile,
          )}
        >
          <Icon className="size-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-semibold text-fg">
              {food.name}
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              <span className="font-bold text-fg">{formatKcal(food.kcal)}</span>
              <span className="text-muted"> kcal</span>
            </span>
          </span>
          <MacroSplitBar split={macroSplit(food)} />
          <span className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="truncate">
              {tLabels(group.labelKey)}
              {food.state && ` · ${tLabels(FOOD_STATE_LABELS[food.state])}`}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className={MACRO_COLORS.protein.text}>
                P {formatGrams(food.protein)}
              </span>{" "}
              <span className={MACRO_COLORS.carbs.text}>
                C {formatGrams(food.carbs)}
              </span>{" "}
              <span className={MACRO_COLORS.fat.text}>
                F {formatGrams(food.fat)}
              </span>
            </span>
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
};
