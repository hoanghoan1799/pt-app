import clsx from "clsx";

import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
} from "@/features/nutrition/constants/nutrition";
import type { EnergyPlan } from "@/features/nutrition/types/nutrition";
import {
  describeFoodEquivalent,
  formatCalories,
} from "@/features/nutrition/utils/energy";

interface EnergyPlanSummaryProps {
  plan: EnergyPlan;
}

export const EnergyPlanSummary = ({ plan }: EnergyPlanSummaryProps) => (
  <div className="space-y-3">
    <dl className="grid grid-cols-3 gap-2 text-center">
      {[
        { label: "BMR", value: plan.bmr, hint: "nghỉ ngơi" },
        { label: "TDEE", value: plan.tdee, hint: "tiêu hao/ngày" },
        { label: "Mục tiêu", value: plan.targetCalories, hint: "nạp/ngày" },
      ].map((item) => (
        <div
          key={item.label}
          className={clsx(
            "rounded-xl px-2 py-2.5",
            item.label === "Mục tiêu" ? "bg-accent/12" : "bg-line/60",
          )}
        >
          <dt className="text-xs font-semibold text-muted">{item.label}</dt>
          <dd
            className={clsx(
              "mt-0.5 text-base leading-tight font-bold tabular-nums",
              item.label === "Mục tiêu" ? "text-accent" : "text-fg",
            )}
          >
            {formatCalories(item.value)}
          </dd>
          <dd className="text-[11px] text-muted">{item.hint}</dd>
        </div>
      ))}
    </dl>
    <ul className="space-y-1.5 text-sm">
      {MACROS.map((macro) => (
        <li key={macro} className="flex items-baseline justify-between gap-2">
          <span className={clsx("font-semibold", MACRO_COLORS[macro].text)}>
            {MACRO_LABELS[macro].name}
          </span>
          <span className="truncate text-right text-muted">
            <span className="font-bold text-fg tabular-nums">
              {plan.macros[macro]} g
            </span>{" "}
            {describeFoodEquivalent(macro, plan.macros[macro])}
          </span>
        </li>
      ))}
    </ul>
  </div>
);
