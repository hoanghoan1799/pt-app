import "server-only";

import { and, asc, between, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { exercises, workoutDays } from "@/db/schema";
import type { Exercise, ScheduleDay } from "@/features/workouts/types/workout";
import { getWeekDates } from "@/features/workouts/utils/week";

const toExercise = (row: typeof exercises.$inferSelect): Exercise => ({
  id: row.id,
  title: row.title,
  description: row.description,
  sets: row.sets,
  reps: row.reps,
  youtubeId: row.youtubeId,
  position: row.position,
});

export const getWeekSchedule = async (
  userId: number,
  weekStart: string,
): Promise<ScheduleDay[]> => {
  const dates = getWeekDates(weekStart);
  const days = await db
    .select()
    .from(workoutDays)
    .where(
      and(
        eq(workoutDays.userId, userId),
        between(workoutDays.date, dates[0], dates[dates.length - 1]),
      ),
    );
  const dayIds = days.map((day) => day.id);
  const exerciseRows = dayIds.length
    ? await db
        .select()
        .from(exercises)
        .where(inArray(exercises.dayId, dayIds))
        .orderBy(asc(exercises.position), asc(exercises.id))
    : [];

  return dates.map((date) => {
    const day = days.find((item) => item.date === date);

    return {
      date,
      title: day?.title ?? "",
      note: day?.note ?? "",
      exercises: day
        ? exerciseRows.filter((row) => row.dayId === day.id).map(toExercise)
        : [],
    };
  });
};
