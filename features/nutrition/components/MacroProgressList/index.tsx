import clsx from "clsx";

import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
} from "@/features/nutrition/constants/nutrition";
import type {
  Macro,
  MacroAmounts,
  MacroComparison,
  NutritionTarget,
} from "@/features/nutrition/types/nutrition";
import {
  compareToTarget,
  formatLang,
} from "@/features/nutrition/utils/nutrition";

interface MacroProgressListProps {
  totals: MacroAmounts;
  target: NutritionTarget | null;
}

const getStatusText = ({ status, difference }: MacroComparison) => {
  if (status === "under") {
    return `còn ${difference} g`;
  }
  if (status === "over") {
    return `vượt ${difference} g`;
  }
  return status === "on" ? "đạt ✓" : "";
};

const MacroRow = ({
  macro,
  eaten,
  target,
}: {
  macro: Macro;
  eaten: number;
  target?: number;
}) => {
  const comparison = compareToTarget(eaten, target);
  const width = Math.min(100, comparison.percent);

  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0">
          <span className={clsx("font-semibold", MACRO_COLORS[macro].text)}>
            {MACRO_LABELS[macro].name}
          </span>{" "}
          <span className="text-xs text-muted">
            {MACRO_LABELS[macro].foods}
          </span>
        </p>
        <p className="shrink-0 text-sm tabular-nums">
          <span className="font-bold text-fg">{eaten}</span>
          {target ? <span className="text-muted"> / {target} g</span> : " g"}
        </p>
      </div>
      {target ? (
        <>
          <div
            role="progressbar"
            aria-label={`${MACRO_LABELS[macro].name}: ${eaten}/${target} g`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={width}
            className="h-2 overflow-hidden rounded-full bg-line"
          >
            <div
              className={clsx(
                "h-full rounded-full transition-[width] duration-500",
                MACRO_COLORS[macro].bar,
              )}
              style={{ width: `${width}%` }}
            />
          </div>
          <p className="flex justify-between text-xs text-muted">
            <span>Mục tiêu {formatLang(target)}</span>
            <span
              className={clsx(
                "font-semibold",
                comparison.status === "on" && "text-success",
                comparison.status === "over" && "text-danger",
              )}
            >
              {getStatusText(comparison)}
            </span>
          </p>
        </>
      ) : null}
    </li>
  );
};

export const MacroProgressList = ({
  totals,
  target,
}: MacroProgressListProps) => (
  <ul className="space-y-4">
    {MACROS.map((macro) => (
      <MacroRow
        key={macro}
        macro={macro}
        eaten={totals[macro]}
        target={target?.[macro]}
      />
    ))}
  </ul>
);
