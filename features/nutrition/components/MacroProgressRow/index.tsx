import clsx from "clsx";

import {
  MACRO_COLORS,
  MACRO_LABELS,
} from "@/features/nutrition/constants/nutrition";
import { STATUS_TEXT_CLASSES } from "@/features/nutrition/constants/progress";
import type { Macro } from "@/features/nutrition/types/nutrition";
import { describeFoodEquivalent } from "@/features/nutrition/utils/energy";
import { compareToTarget } from "@/features/nutrition/utils/nutrition";
import { formatComparison } from "@/features/nutrition/utils/progress-text";

interface MacroProgressRowProps {
  macro: Macro;
  eaten: number;
  target?: number;
}

export const MacroProgressRow = ({
  macro,
  eaten,
  target,
}: MacroProgressRowProps) => {
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
          <p className="flex justify-between gap-2 text-xs text-muted">
            <span className="truncate">
              {describeFoodEquivalent(macro, target)}
            </span>
            <span
              className={clsx(
                "shrink-0 font-semibold",
                STATUS_TEXT_CLASSES[comparison.status],
              )}
            >
              {formatComparison(comparison, "g")}
            </span>
          </p>
        </>
      ) : null}
    </li>
  );
};
