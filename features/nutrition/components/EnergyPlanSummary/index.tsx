import clsx from "clsx";
import { useTranslations } from "next-intl";

import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
} from "@/features/nutrition/constants/nutrition";
import type { EnergyPlan } from "@/features/nutrition/types/nutrition";
import { formatCalories } from "@/features/nutrition/utils/energy";

interface EnergyPlanSummaryProps {
  plan: EnergyPlan;
}

export const EnergyPlanSummary = ({ plan }: EnergyPlanSummaryProps) => {
  const t = useTranslations("nutrition.energyPlanSummary");
  const tLabels = useTranslations("nutrition.labels");

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { key: "bmr", label: "BMR", value: plan.bmr, hint: t("restHint") },
          {
            key: "tdee",
            label: "TDEE",
            value: plan.tdee,
            hint: t("burnedHint"),
          },
          {
            key: "target",
            label: t("target"),
            value: plan.targetCalories,
            hint: t("eatenHint"),
          },
        ].map((item) => (
          <div
            key={item.key}
            className={clsx(
              "rounded-xl px-2 py-2.5",
              item.key === "target" ? "bg-accent/12" : "bg-line/60",
            )}
          >
            <dt className="text-xs font-semibold text-muted">{item.label}</dt>
            <dd
              className={clsx(
                "mt-0.5 text-base leading-tight font-bold tabular-nums",
                item.key === "target" ? "text-accent" : "text-fg",
              )}
            >
              {formatCalories(item.value)}
            </dd>
            <dd className="text-[11px] text-muted">{item.hint}</dd>
          </div>
        ))}
      </dl>
      {plan.isFlooredToBmr && (
        <p
          role="status"
          className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
        >
          {t("flooredNotice", { kcal: formatCalories(plan.targetCalories) })}
        </p>
      )}
      <ul className="space-y-1.5 text-sm">
        {MACROS.map((macro) => (
          <li key={macro} className="flex items-baseline justify-between gap-2">
            <span className={clsx("font-semibold", MACRO_COLORS[macro].text)}>
              {tLabels(MACRO_LABELS[macro].nameKey)}
            </span>
            <span className="truncate text-right text-muted">
              <span className="font-bold text-fg tabular-nums">
                {plan.macros[macro]} g
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
