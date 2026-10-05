import clsx from "clsx";

import { STATUS_TEXT_CLASSES } from "@/features/nutrition/constants/progress";
import type { MacroAmounts } from "@/features/nutrition/types/nutrition";
import {
  calculateCalories,
  formatCalories,
} from "@/features/nutrition/utils/energy";
import { compareToTarget } from "@/features/nutrition/utils/nutrition";
import { formatComparison } from "@/features/nutrition/utils/progress-text";

interface CaloriesProgressRowProps {
  totals: MacroAmounts;
  target: MacroAmounts | null;
}

// Calories follow from the macros: 4 kcal/g carbs and protein, 9 kcal/g fat.
export const CaloriesProgressRow = ({
  totals,
  target,
}: CaloriesProgressRowProps) => {
  const eaten = calculateCalories(totals);
  const goal = target ? calculateCalories(target) : undefined;
  const comparison = compareToTarget(eaten, goal);

  return (
    <li className="flex items-baseline justify-between gap-2 border-b border-line pb-3">
      <span className="font-semibold text-fg">Năng lượng</span>
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
