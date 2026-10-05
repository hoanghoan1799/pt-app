import { ProgressBar } from "@/components/common/ProgressBar";
import type { Progress } from "@/features/workouts/types/workout";

interface WeekProgressProps {
  progress: Progress;
}

export const WeekProgress = ({ progress }: WeekProgressProps) => {
  if (!progress.total) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-muted">Tiến độ tuần</span>
        <span className="font-semibold text-fg">
          {progress.completed}/{progress.total} bài · {progress.percent}%
        </span>
      </div>
      <ProgressBar percent={progress.percent} label="Tiến độ tuần" />
    </div>
  );
};
