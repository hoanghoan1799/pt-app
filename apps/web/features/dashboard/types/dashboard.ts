import type { BestSet } from "@/features/workouts/types/workout";

// Dashboard filter by PT: everyone, trainees without a PT, or one PT's.
export type PtFilter = "all" | "none" | number;

export interface MemberProgress {
  id: number;
  name: string;
  // The nickname an admin set, else the real name (same as the inbox).
  displayName: string;
  // Versioned /api/avatar URL; null = no photo.
  avatarUrl: string | null;
  // The PT responsible for this trainee (users.pt_admin_id); null = none.
  ptAdminId: number | null;
  ptName: string | null;
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
  // Nickname if set, else userName; filled in by the page.
  displayName?: string;
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
