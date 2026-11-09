import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";

import {
  MACRO_COLORS,
  MACRO_LABELS,
} from "@/features/nutrition/constants/nutrition";
import { STATUS_TEXT_CLASSES } from "@/features/nutrition/constants/progress";
import type { Macro } from "@/features/nutrition/types/nutrition";
import {
  compareToTarget,
  getRingPercent,
} from "@/features/nutrition/utils/nutrition";
import { formatComparison } from "@/features/nutrition/utils/progress-text";

interface MacroRingProps {
  macro: Macro;
  eaten: number;
  target?: number;
}

const SIZE = 60;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// One macro as a ~60px ring with "eaten / target g" and the Còn/Vượt text.
export const MacroRing = ({ macro, eaten, target }: MacroRingProps) => {
  const locale = useLocale();
  const percent = getRingPercent(eaten, target);
  const comparison = compareToTarget(eaten, target, macro);
  const comparisonText = formatComparison(comparison, "g", locale);
  const t = useTranslations("nutrition.macroRing");
  const tLabels = useTranslations("nutrition.labels");
  const name = tLabels(MACRO_LABELS[macro].nameKey);

  return (
    <li className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <div
        role={target ? "progressbar" : undefined}
        aria-label={
          target ? t("progressLabel", { name, eaten, target }) : undefined
        }
        aria-valuemin={target ? 0 : undefined}
        aria-valuemax={target ? 100 : undefined}
        aria-valuenow={target ? percent : undefined}
        data-percent={target ? percent : undefined}
        className="relative size-[60px] shrink-0"
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-line"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
            className={clsx(
              "transition-[stroke-dashoffset] duration-500",
              MACRO_COLORS[macro].ring,
            )}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-fg tabular-nums">
          {target ? `${percent}%` : "–"}
        </span>
      </div>
      <p className={clsx("text-sm font-semibold", MACRO_COLORS[macro].text)}>
        {name}
      </p>
      <p className="text-xs tabular-nums">
        <span className="font-bold text-fg">{eaten}</span>
        {target ? <span className="text-muted"> / {target} g</span> : " g"}
      </p>
      {comparisonText && (
        <p
          className={clsx(
            "text-xs font-semibold",
            STATUS_TEXT_CLASSES[comparison.status],
          )}
        >
          {comparisonText}
        </p>
      )}
    </li>
  );
};
