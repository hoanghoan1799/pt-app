import { ChartColumn, Dumbbell, Flame, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { CARD } from "@/constants/styles";
import type { TrainingStats } from "@/features/social/types/social";

interface ProfileStatsProps {
  // Null: the viewer may not see them (locked box).
  stats: TrainingStats | null;
}

// Trainee profiles only: workouts, day streak and total sets, or a locked box.
export const ProfileStats = ({ stats }: ProfileStatsProps) => {
  const t = useTranslations("social.profile");

  if (!stats) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-3.5 py-3 text-xs text-muted">
        <Lock className="size-4 shrink-0" aria-hidden />
        {t("statsLocked")}
      </div>
    );
  }
  const cells = [
    { Icon: Dumbbell, value: stats.workouts, label: t("statsWorkouts") },
    { Icon: Flame, value: stats.streak, label: t("statsStreak") },
    { Icon: ChartColumn, value: stats.totalSets, label: t("statsSets") },
  ];

  return (
    <div className={`${CARD} grid grid-cols-3 py-3`}>
      {cells.map(({ Icon, value, label }) => (
        <div
          key={label}
          className="flex min-w-0 items-center justify-center gap-2 px-1.5 not-first:border-l not-first:border-line"
        >
          <Icon className="size-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0">
            <b className="block text-xl leading-tight tabular-nums">{value}</b>
            <span className="block truncate text-[11px] text-muted">
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
