import clsx from "clsx";
import { useTranslations } from "next-intl";

import { STATUS_TEXT_CLASSES } from "@/features/nutrition/constants/progress";
import type { MacroAmounts } from "@/features/nutrition/types/nutrition";
import { formatCalories } from "@/features/nutrition/utils/energy";
import {
  calculateCalories,
  compareToTarget,
} from "@/features/nutrition/utils/nutrition";
import { formatComparison } from "@/features/nutrition/utils/progress-text";

interface CaloriesProgressRowProps {
  // Counted kcal of the day.
  kcal: number;
  target: MacroAmounts | null;
}

// The goal follows from the target macros (4/4/9); what was eaten is the
// day's counted kcal.
export const CaloriesProgressRow = ({
  kcal: eaten,
  target,
}: CaloriesProgressRowProps) => {
  const t = useTranslations("nutrition.caloriesProgressRow");
  const goal = target ? calculateCalories(target) : undefined;
  const comparison = compareToTarget(eaten, goal, "kcal");

  return (
    <li className="flex items-baseline justify-between gap-2 border-b border-line pb-3">
      <span className="font-semibold text-fg">{t("energy")}</span>
      <span className="text-right text-sm tabular-nums">
        <span className="font-bold text-fg">{formatCalories(eaten)}</span>
        {goal ? (
          <span className="text-muted"> / {formatCalories(goal)}</span>
        ) : null}
        {comparison.status !== "none" && (
          <span
            className={clsx(
              "block text-xs font-semibold",
              STATUS_TEXT_CLASSES[comparison.status],
            )}
          >
            {formatComparison(comparison, "kcal")}
          </span>
        )}
      </span>
    </li>
  );
};
