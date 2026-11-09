import type { ExerciseProgressRow } from "@/features/members/types/progress";
import { formatWeightChange } from "@/features/nutrition/utils/weight";
import { formatSet } from "@/features/workouts/utils/set-logger";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

export type TrendTone = "neutral" | "up" | "down";

export interface TrendBadge {
  label: string;
  tone: TrendTone;
}

// Badge text for a "Tiến bộ" row (KAN-34): "Lần đầu", "+2,5 kg", "−2,5 kg",
// "Cùng mức, thêm reps" / "Cùng mức, ít reps" (same weight) or "Không đổi".
export const describeTrend = (
  { trend, changeKg }: Pick<ExerciseProgressRow, "trend" | "changeKg">,
  locale: Locale = DEFAULT_LOCALE,
): TrendBadge => {
  const t = getFormatTranslator(locale);

  switch (trend) {
    case "first":
      return { label: t("trend.first"), tone: "neutral" };
    case "up":
      return {
        label:
          changeKg === null || changeKg === 0
            ? t("trend.sameMoreReps")
            : formatWeightChange(changeKg, locale),
        tone: "up",
      };
    case "down":
      return {
        label:
          changeKg === null || changeKg === 0
            ? t("trend.sameFewerReps")
            : formatWeightChange(changeKg, locale),
        tone: "down",
      };
    default:
      return { label: t("trend.same"), tone: "neutral" };
  }
};

// ["Tốt nhất trước đó 40 kg × 10", "Tốt nhất tuần này 42,5 kg × 8"]; the
// previous figure is the best of all earlier weeks (F4), not last session. A
// first session has no previous best. Separate lines so a row never breaks inside "kg × reps".
export const describeBests = (
  {
    weekBest,
    previousBest,
  }: Pick<ExerciseProgressRow, "weekBest" | "previousBest">,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const t = getFormatTranslator(locale);
  const current = t("trend.bestWeek", { set: formatSet(weekBest, locale) });

  return previousBest
    ? [t("trend.bestBefore", { set: formatSet(previousBest, locale) }), current]
    : [current];
};
