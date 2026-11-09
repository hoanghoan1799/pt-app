import { useTranslations } from "next-intl";

import { ProgressBar } from "@/components/common/ProgressBar";
import type { Progress } from "@/features/workouts/types/workout";

interface WeekProgressProps {
  progress: Progress;
}

export const WeekProgress = ({ progress }: WeekProgressProps) => {
  const t = useTranslations("workouts.weekProgress");

  if (!progress.total) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-muted">{t("label")}</span>
        <span className="font-semibold text-fg">
          {t("summary", {
            completed: progress.completed,
            total: progress.total,
            percent: progress.percent,
          })}
        </span>
      </div>
      <ProgressBar percent={progress.percent} label={t("label")} />
    </div>
  );
};
