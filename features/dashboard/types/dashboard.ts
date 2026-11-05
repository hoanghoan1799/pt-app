import type { BestSet } from "@/features/workouts/types/workout";

export interface MemberProgress {
  id: number;
  name: string;
  // Exercises scheduled in the week, and how many of those are done.
  assigned: number;
  completed: number;
  // Days in the week with at least one exercise / one completion.
  plannedDays: number;
  activeDays: number;
  // Days in the week with at least one food log entry.
  nutritionDays: number;
  // Latest completion ever (epoch ms), not limited to the week.
  lastActiveAt: number | null;
}

export interface MemberRow extends MemberProgress {
  percent: number;
  status: "no-plan" | "not-started" | "in-progress" | "done";
  lastActiveLabel: string | null;
  href: string;
  // Unread chat messages from this trainee for the signed-in admin.
  unread: number;
}

export interface WeekSummary {
  memberCount: number;
  plannedCount: number;
  activeCount: number;
  assigned: number;
  completed: number;
  percent: number;
}

interface ActivityBase {
  // Completion id, or exercise id for a personal best; list keys are
  // `${kind}-${id}` because the two id spaces overlap (F2).
  id: number;
  userId: number;
  userName: string;
  exerciseTitle: string;
  // Scheduled day (YYYY-MM-DD) of the exercise.
  date: string;
  // Epoch ms: completion time, or when the record's sets were saved.
  occurredAt: number;
}

export interface CompletionActivity extends ActivityBase {
  kind: "completion";
}

// Computed on read from the logged sets (D8): the session's best strictly
// beats every earlier weighted set of the same user + link (D6, D11).
export interface PersonalBestActivity extends ActivityBase {
  kind: "personalBest";
  best: BestSet;
  previousBest: BestSet;
}

export type ActivityItem = CompletionActivity | PersonalBestActivity;
