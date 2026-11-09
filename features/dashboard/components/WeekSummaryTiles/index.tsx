import { CalendarCheck, Dumbbell, Flame, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatTile } from "@/features/dashboard/components/StatTile";
import type { WeekSummary } from "@/features/dashboard/types/dashboard";

interface WeekSummaryTilesProps {
  summary: WeekSummary;
}

export const WeekSummaryTiles = ({ summary }: WeekSummaryTilesProps) => {
  const t = useTranslations("dashboard.weekSummary");

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        icon={Users}
        label={t("users")}
        value={String(summary.memberCount)}
        hint={t("usersHint", { planned: summary.plannedCount })}
      />
      <StatTile
        icon={Flame}
        label={t("active")}
        value={`${summary.activeCount}/${summary.plannedCount}`}
        hint={t("activeHint")}
      />
      <StatTile
        icon={CalendarCheck}
        label={t("done")}
        value={`${summary.percent}%`}
        hint={t("doneHint")}
      />
      <StatTile
        icon={Dumbbell}
        label={t("exercises")}
        value={String(summary.completed)}
        hint={t("exercisesHint", { assigned: summary.assigned })}
      />
    </div>
  );
};
