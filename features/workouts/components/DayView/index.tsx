import { BedDouble, PartyPopper } from "lucide-react";
import { useTranslations } from "next-intl";

import { ProgressBar } from "@/components/common/ProgressBar";
import { DayHeading } from "@/features/workouts/components/DayHeading";
import { ExerciseCard } from "@/features/workouts/components/ExerciseCard";
import { LoggedSetList } from "@/features/workouts/components/LoggedSetList";
import { RestDayState } from "@/features/workouts/components/RestDayState";
import { UserExerciseItem } from "@/features/workouts/components/UserExerciseItem";
import type { ScheduleDayWithSets } from "@/features/workouts/types/workout";
import { getDayProgress } from "@/features/workouts/utils/progress";
import {
  canLogSets,
  canShowLoggedSets,
} from "@/features/workouts/utils/set-logger";

interface DayViewProps {
  day: ScheduleDayWithSets;
  today: string;
  // False for the admin's read-only "view as user" preview.
  isInteractive: boolean;
}

export const DayView = ({ day, today, isInteractive }: DayViewProps) => {
  const t = useTranslations("workouts.dayView");
  const hasExercises = day.exercises.length > 0;
  const progress = getDayProgress(day);
  const canComplete = day.date <= today;

  return (
    <section className="space-y-4">
      <DayHeading
        day={day}
        isToday={day.date === today}
        fallbackTitle={hasExercises ? t("workoutTitle") : t("restTitle")}
      />
      {hasExercises && progress.completed > 0 && (
        <ProgressBar percent={progress.percent} label={t("progressLabel")} />
      )}
      {hasExercises && progress.percent === 100 && (
        <p className="flex items-center gap-2 rounded-xl bg-success/12 px-3 py-2.5 text-sm font-semibold text-success">
          <PartyPopper className="size-5 shrink-0" aria-hidden />
          {t("complete")}
        </p>
      )}
      {hasExercises ? (
        <ol className="space-y-4">
          {day.exercises.map((exercise, index) => (
            <li key={exercise.id}>
              {isInteractive ? (
                <UserExerciseItem
                  exercise={exercise}
                  index={index}
                  canComplete={canComplete}
                />
              ) : (
                <ExerciseCard
                  exercise={exercise}
                  index={index}
                  isPersonalBest={exercise.isPersonalBest}
                  footer={
                    (canLogSets(exercise, canComplete) ||
                      canShowLoggedSets(
                        exercise,
                        exercise.loggedSets.length,
                      )) && <LoggedSetList sets={exercise.loggedSets} />
                  }
                />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <RestDayState
          icon={BedDouble}
          title={t("restDayTitle")}
          description={t("restDayDescription")}
        />
      )}
    </section>
  );
};
