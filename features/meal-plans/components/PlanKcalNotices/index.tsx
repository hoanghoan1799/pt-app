import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  formatPlanKcalNotice,
  type PlanKcalNotice,
} from "@/features/meal-plans/utils/plan-notice";
import { formatFullDay } from "@/utils/week";

interface PlanKcalNoticesProps {
  notices: PlanKcalNotice[];
}

// S3: the target changed (weigh-in or profile) and these planned days no
// longer match it; the PT sees by how much to change the plan.
export const PlanKcalNotices = ({ notices }: PlanKcalNoticesProps) => {
  const t = useTranslations("mealPlans.planKcalNotices");

  if (!notices.length) {
    return null;
  }

  return (
    <section
      aria-label={t("sectionLabel")}
      className="space-y-1.5 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {t("title")}
      </p>
      <ul className="space-y-1 text-sm text-fg">
        {notices.map((notice) => (
          <li key={notice.date}>
            <span className="font-medium">{formatFullDay(notice.date)}:</span>{" "}
            {formatPlanKcalNotice(notice.gapKcal)}
          </li>
        ))}
      </ul>
    </section>
  );
};
