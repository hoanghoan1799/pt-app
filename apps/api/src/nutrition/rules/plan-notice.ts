import { ON_TARGET } from "./nutrition-math.js";

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

// Only days within this many days from the shown week are checked.
export const NOTICE_HORIZON_DAYS = 28;

// S3: a planned day is flagged when its kcal differ from the current target by
// more than ON_TARGET.kcalDiff (80 itself is fine). Days without items or
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
