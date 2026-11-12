import type { BestSet } from "@/features/workouts/types/workout";

// "first" = no earlier weighted set ("Lần đầu", F6, D11). Otherwise the week's
// best compared with the best before the week (F4): heavier, or same weight
// with more reps, is "up" (Q8).
export type ProgressTrend = "first" | "up" | "same" | "down";

// One "Tiến bộ" row on the admin Summary tab: one per exercise link (Q6).
export interface ExerciseProgressRow {
  youtubeId: string;
  // Latest title of the link up to the selected week (F5).
  title: string;
  weekBest: BestSet;
  previousBest: BestSet | null;
  // weekBest minus previousBest in kg; null when there is no previous best.
  changeKg: number | null;
  trend: ProgressTrend;
  // Latest date (YYYY-MM-DD) the link was logged in the selected week.
  lastDate: string;
}
