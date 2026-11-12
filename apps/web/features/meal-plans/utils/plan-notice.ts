import { ON_TARGET } from "@/features/nutrition/constants/energy";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

export interface PlannedDayKcal {
  date: string;
  // kcal the plan adds up to (4/4/9 from its macros).
  plannedKcal: number;
  // kcal of the target that applies on `date`; null when none is set.
  targetKcal: number | null;
}

export interface PlanKcalNotice {
  date: string;
  // Planned minus target, whole kcal: positive = the plan is above the target.
  gapKcal: number;
}

// S3: a planned day is flagged when its kcal differ from the current target
// by more than ON_TARGET.kcalDiff (80 itself is fine). Days without items or
// without a target have nothing to compare. Oldest day first.
export const getPlanKcalNotices = (days: PlannedDayKcal[]): PlanKcalNotice[] =>
  days
    .flatMap(({ date, plannedKcal, targetKcal }) => {
      if (plannedKcal <= 0 || targetKcal === null) {
        return [];
      }

      const gap = plannedKcal - targetKcal;

      return Math.abs(gap) > ON_TARGET.kcalDiff
        ? [{ date, gapKcal: Math.round(gap) }]
        : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));

// "Plan lệch +120 kcal so với mục tiêu mới"
export const formatPlanKcalNotice = (
  gapKcal: number,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)("planNotice", {
    gap: `${gapKcal > 0 ? "+" : ""}${gapKcal}`,
  });
