import type {
  ScheduleDay,
  ScheduleDayWithSets,
} from "@/features/workouts/types/workout";
import {
  getPreviousSession,
  isPersonalBest,
  type SetSession,
} from "@/features/workouts/utils/sets";

// Attaches each exercise's own sets, the previous session's sets (hints by row
// position, E7) and the record flag (E6) to a week from getWeekSchedule.
export const attachSetsToWeek = (
  days: ScheduleDay[],
  userId: number,
  sessions: SetSession[],
): ScheduleDayWithSets[] => {
  const byExercise = new Map(
    sessions.map((session) => [session.exerciseId, session]),
  );

  return days.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      const key = { userId, youtubeId: exercise.youtubeId, date: day.date };
      const loggedSets = byExercise.get(exercise.id)?.sets ?? [];

      return {
        ...exercise,
        loggedSets,
        previousSets: getPreviousSession(sessions, key)?.sets ?? [],
        isPersonalBest: isPersonalBest(loggedSets, sessions, key),
      };
    }),
  }));
};
