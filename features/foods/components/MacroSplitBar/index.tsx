import clsx from "clsx";
import { useTranslations } from "next-intl";

import type { MacroShare } from "@/features/foods/types/food";
import {
  MACRO_COLORS,
  MACRO_LABELS,
} from "@/features/nutrition/constants/nutrition";

interface MacroSplitBarProps {
  split: MacroShare;
}

const SEGMENTS = ["protein", "carbs", "fat"] as const;

// Share of the food's calories that comes from protein, carbs and fat.
export const MacroSplitBar = ({ split }: MacroSplitBarProps) => {
  const t = useTranslations("foods.macroSplitBar");
  const tLabels = useTranslations("nutrition.labels");
  const description = SEGMENTS.map(
    (macro) => `${tLabels(MACRO_LABELS[macro].nameKey)} ${split[macro]}%`,
  ).join(", ");

  return (
    <div
      role="img"
      aria-label={t("label", { description })}
      className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-line"
    >
      {SEGMENTS.map(
        (macro) =>
          split[macro] > 0 && (
            <div
              key={macro}
              className={clsx("h-full", MACRO_COLORS[macro].bar)}
              style={{ width: `${split[macro]}%` }}
            />
          ),
      )}
    </div>
  );
};
