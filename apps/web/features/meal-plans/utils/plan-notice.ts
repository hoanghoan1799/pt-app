import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// S3: the API flags the planned days whose kcal differ from the current target
// by more than ON_TARGET.kcalDiff (apps/api/src/nutrition/rules/plan-notice.ts);
// the web only words the notice.
export interface PlanKcalNotice {
  date: string;
  // Planned minus target, whole kcal: positive = the plan is above the target.
  gapKcal: number;
}

// "Plan lệch +120 kcal so với mục tiêu mới"
export const formatPlanKcalNotice = (
  gapKcal: number,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)("planNotice", {
    gap: `${gapKcal > 0 ? "+" : ""}${gapKcal}`,
  });
