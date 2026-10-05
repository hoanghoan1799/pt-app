import type { ScheduleDay } from "@/features/workouts/types/workout";

export const hasDayContent = (day: ScheduleDay) =>
  Boolean(day.title || day.note || day.exercises.length);
