import { BedDouble, PartyPopper } from "lucide-react";

import { ProgressBar } from "@/components/common/ProgressBar";
import { DayHeading } from "@/features/workouts/components/DayHeading";
import { ExerciseCard } from "@/features/workouts/components/ExerciseCard";
import { RestDayState } from "@/features/workouts/components/RestDayState";
import { UserExerciseItem } from "@/features/workouts/components/UserExerciseItem";
import type { ScheduleDay } from "@/features/workouts/types/workout";
import { getDayProgress } from "@/features/workouts/utils/progress";

interface DayViewProps {
  day: ScheduleDay;
  today: string;
  // False for the admin's read-only "view as user" preview.
  isInteractive: boolean;
}

export const DayView = ({ day, today, isInteractive }: DayViewProps) => {
  const hasExercises = day.exercises.length > 0;
  const progress = getDayProgress(day);
  const canComplete = day.date <= today;

  return (
    <section className="space-y-4">
      <DayHeading
        day={day}
        isToday={day.date === today}
        fallbackTitle={hasExercises ? "Bài tập hôm nay" : "Ngày nghỉ"}
      />
      {hasExercises && progress.completed > 0 && (
        <ProgressBar percent={progress.percent} label="Tiến độ trong ngày" />
      )}
      {hasExercises && progress.percent === 100 && (
        <p className="flex items-center gap-2 rounded-xl bg-success/12 px-3 py-2.5 text-sm font-semibold text-success">
          <PartyPopper className="size-5 shrink-0" aria-hidden />
          Hoàn thành buổi tập! Nghỉ ngơi tốt nhé.
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
                <ExerciseCard exercise={exercise} index={index} />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <RestDayState
          icon={BedDouble}
          title="Nghỉ ngơi & hồi phục"
          description="Chưa có bài tập cho ngày này. Ngủ đủ, uống đủ nước nhé!"
        />
      )}
    </section>
  );
};
