import type { ScheduleDayResponse } from "@pt/contracts";

import type { ScheduleDayWithSets } from "@/features/workouts/types/workout";

// API schedule day -> the shape the workout components render. The API sends
// ISO timestamps; the components keep epoch milliseconds.
export const toScheduleDays = (
  days: ScheduleDayResponse[],
): ScheduleDayWithSets[] =>
  days.map((day) => ({
    date: day.date,
    title: day.title,
    note: day.note,
    exercises: day.exercises.map((exercise) => ({
      id: exercise.id,
      title: exercise.title,
      description: exercise.description,
      sets: exercise.sets,
      reps: exercise.reps,
      youtubeId: exercise.youtubeId,
      position: exercise.position,
      completedAt: exercise.completedAt
        ? Date.parse(exercise.completedAt)
        : null,
      loggedSets: exercise.loggedSets.map((set) => ({
        weightKg: set.weightKg,
        reps: set.reps,
      })),
      previousSets: exercise.previousSets.map((set) => ({
        weightKg: set.weightKg,
        reps: set.reps,
      })),
      isPersonalBest: exercise.isPersonalBest,
    })),
  }));
