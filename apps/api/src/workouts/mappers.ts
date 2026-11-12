import type {
  ActivityResponse,
  DashboardSummaryResponse,
  ExerciseResponse,
  ProgressResponse,
  ScheduleDayResponse,
  WorkoutDayResponse,
} from "@pt/contracts";

import type { Exercise } from "../database/entities/exercise.entity.js";
import type { WorkoutDay } from "../database/entities/workout-day.entity.js";
import { isTimedReps } from "./domain/exercise-rules.js";
import type {
  ActivityItem,
  ExerciseProgressRow,
  MemberProgress,
  WeekSummary,
} from "./domain/progress.js";
import { calculatePercent, getMemberStatus } from "./domain/progress.js";
import type { ScheduleDayWithSets } from "./domain/sets.js";

// Domain/entity -> response. Explicit field lists: a new column never reaches a
// client by accident, and entities are never returned.

const iso = (date: Date) => date.toISOString();

export const toExerciseResponse = (
  exercise: Pick<
    Exercise,
    "id" | "title" | "description" | "sets" | "reps" | "youtubeId" | "position"
  >,
  completedAt: Date | null = null,
): ExerciseResponse => ({
  id: exercise.id,
  title: exercise.title,
  description: exercise.description,
  sets: exercise.sets,
  reps: exercise.reps,
  youtubeId: exercise.youtubeId,
  position: exercise.position,
  completedAt: completedAt ? iso(completedAt) : null,
  timed: isTimedReps(exercise.reps),
});

export const toWorkoutDayResponse = (
  day: Pick<WorkoutDay, "date" | "title" | "note">,
): WorkoutDayResponse => ({
  date: day.date,
  title: day.title,
  note: day.note,
});

export const toScheduleDayResponse = (
  day: ScheduleDayWithSets,
): ScheduleDayResponse => ({
  date: day.date,
  title: day.title,
  note: day.note,
  exercises: day.exercises.map((exercise) => ({
    ...toExerciseResponse(exercise, exercise.completedAt),
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
});

export const toScheduleResponse = (days: ScheduleDayWithSets[]) => ({
  days: days.map(toScheduleDayResponse),
});

export const toProgressResponse = (
  weekStart: string,
  rows: ExerciseProgressRow[],
): ProgressResponse => ({ weekStart, rows });

export const toDashboardSummaryResponse = (
  weekStart: string,
  members: MemberProgress[],
  summary: WeekSummary,
): DashboardSummaryResponse => ({
  weekStart,
  summary,
  members: members.map((member) => ({
    id: member.id,
    name: member.name,
    displayName: member.displayName,
    avatarUpdatedAt: member.avatarUpdatedAt
      ? iso(member.avatarUpdatedAt)
      : null,
    ptAdminId: member.ptAdminId,
    ptName: member.ptName,
    assigned: member.assigned,
    completed: member.completed,
    plannedDays: member.plannedDays,
    activeDays: member.activeDays,
    nutritionDays: member.nutritionDays,
    lastActiveAt: member.lastActiveAt ? iso(member.lastActiveAt) : null,
    percent: calculatePercent(member.completed, member.assigned),
    status: getMemberStatus(member),
  })),
});

export const toActivityResponse = (
  items: ActivityItem[],
  displayNames: ReadonlyMap<number, string>,
): ActivityResponse => ({
  items: items.map((item) => {
    const base = {
      id: item.id,
      userId: item.userId,
      userName: item.userName,
      displayName: displayNames.get(item.userId) ?? item.userName,
      exerciseTitle: item.exerciseTitle,
      date: item.date,
      occurredAt: new Date(item.occurredAt).toISOString(),
    };

    return item.kind === "completion"
      ? { kind: "completion" as const, ...base }
      : {
          kind: "personalBest" as const,
          ...base,
          best: item.best,
          previousBest: item.previousBest,
        };
  }),
});
