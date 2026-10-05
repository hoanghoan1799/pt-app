import type { Progress, ScheduleDay } from "@/features/workouts/types/workout";
import { calculatePercent } from "@/utils/time";

const toProgress = (completed: number, total: number): Progress => ({
  completed,
  total,
  percent: calculatePercent(completed, total),
});

export const getDayProgress = (day: ScheduleDay) =>
  toProgress(
    day.exercises.filter((exercise) => exercise.completedAt !== null).length,
    day.exercises.length,
  );

export const getWeekProgress = (days: ScheduleDay[]) =>
  days
    .map(getDayProgress)
    .reduce(
      (sum, day) =>
        toProgress(sum.completed + day.completed, sum.total + day.total),
      toProgress(0, 0),
    );

export const isDayComplete = (day: ScheduleDay) => {
  const { completed, total } = getDayProgress(day);

  return total > 0 && completed === total;
};
