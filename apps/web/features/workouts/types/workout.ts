import type { LoggedSet } from "@/features/workouts/utils/sets";

export interface Exercise {
  id: number;
  title: string;
  description: string;
  sets: number | null;
  reps: string;
  youtubeId: string;
  position: number;
  // Epoch ms when the user marked it done, or null.
  completedAt: number | null;
}

export interface ExerciseSet {
  id: number;
  exerciseId: number;
  userId: number;
  // 0-based order within the exercise.
  position: number;
  // Kilograms; null means bodyweight.
  weightKg: number | null;
  reps: number;
  createdAt: Date;
}

// A best set always has a weight: bodyweight sets never count (OQ2).
export interface BestSet {
  weightKg: number;
  reps: number;
}

export interface ScheduleDay {
  date: string;
  title: string;
  note: string;
  exercises: Exercise[];
}

// An exercise with the trainee's logged sets (KAN-29), for the pages that show
// the set logger: /workouts, the admin preview and the admin member page.
export interface ExerciseWithSets extends Exercise {
  // This exercise's sets, ordered by position (index = position).
  loggedSets: LoggedSet[];
  // The previous session's sets; row n's hint is previousSets[n] (E7, D7).
  previousSets: LoggedSet[];
  // "Kỷ lục mới", computed on read (E6, D6, D11).
  isPersonalBest: boolean;
}

export interface ScheduleDayWithSets extends Omit<ScheduleDay, "exercises"> {
  exercises: ExerciseWithSets[];
}

export type MoveDirection = "up" | "down";

export interface MemberOption {
  id: number;
  name: string;
}

export interface Progress {
  completed: number;
  total: number;
  percent: number;
}
