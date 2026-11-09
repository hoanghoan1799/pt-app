import { CircleCheck, MessageSquareText } from "lucide-react";
import { useTranslations } from "next-intl";

import { MealLogList } from "@/features/meal-plans/components/MealLogList";
import type { MealLog, MealMark } from "@/features/meal-plans/types/meal-log";
import type { PlanItem } from "@/features/meal-plans/types/meal-plan";
import {
  countMealNutrition,
  formatNutrition,
} from "@/features/meal-plans/utils/meal-log";

interface MealLogSummaryProps {
  // The meal's planned items: a meal marked "Đạt" counts them.
  items: PlanItem[];
  logs: MealLog[];
  mark: MealMark | null;
}

// S4: what the trainee reported for a meal, read-only for the PT: "Đạt", the
// note about what was short or over, and the foods they logged.
export const MealLogSummary = ({ items, logs, mark }: MealLogSummaryProps) => {
  const t = useTranslations("mealPlans.mealLogSummary");

  if (!logs.length && !mark) {
    return (
      <p className="rounded-xl bg-line/50 px-3 py-2 text-xs text-muted">
        {t("noLogs")}
      </p>
    );
  }

  return (
    <div
      className="space-y-2 rounded-xl bg-accent/5 px-3 py-2.5"
      aria-label={t("sectionLabel")}
      role="group"
    >
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        {t("sectionLabel")}
      </p>
      {mark?.achieved && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {t("onPlan")}
        </p>
      )}
      {mark?.note && (
        <p className="flex gap-2 text-sm text-fg">
          <MessageSquareText
            className="mt-0.5 size-4 shrink-0 text-accent"
            aria-hidden
          />
          <span className="whitespace-pre-line">{mark.note}</span>
        </p>
      )}
      {logs.length > 0 && <MealLogList logs={logs} />}
      {(logs.length > 0 || mark?.achieved) && (
        <p className="text-sm font-semibold text-fg tabular-nums">
          {t("eaten")}{" "}
          {formatNutrition(
            countMealNutrition(
              items,
              logs,
              mark?.achieved ?? false,
              mark?.frozen,
            ),
          )}
        </p>
      )}
    </div>
  );
};
