import { BedDouble } from "lucide-react";

import { DayHeading } from "@/features/workouts/components/DayHeading";
import { ExerciseCard } from "@/features/workouts/components/ExerciseCard";
import { RestDayState } from "@/features/workouts/components/RestDayState";
import type { ScheduleDay } from "@/features/workouts/types/workout";

interface DayViewProps {
  day: ScheduleDay;
  isToday: boolean;
}

export const DayView = ({ day, isToday }: DayViewProps) => {
  const hasExercises = day.exercises.length > 0;

  return (
    <section className="space-y-4">
      <DayHeading
        day={day}
        isToday={isToday}
        fallbackTitle={hasExercises ? "Bài tập hôm nay" : "Ngày nghỉ"}
      />
      {hasExercises ? (
        <ol className="space-y-4">
          {day.exercises.map((exercise, index) => (
            <li key={exercise.id}>
              <ExerciseCard exercise={exercise} index={index} />
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
