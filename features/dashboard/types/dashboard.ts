export interface MemberProgress {
  id: number;
  name: string;
  // Exercises scheduled in the week, and how many of those are done.
  assigned: number;
  completed: number;
  // Days in the week with at least one exercise / one completion.
  plannedDays: number;
  activeDays: number;
  // Latest completion ever (epoch ms), not limited to the week.
  lastActiveAt: number | null;
}

export interface MemberRow extends MemberProgress {
  percent: number;
  status: "no-plan" | "not-started" | "in-progress" | "done";
  lastActiveLabel: string | null;
  href: string;
}

export interface WeekSummary {
  memberCount: number;
  plannedCount: number;
  activeCount: number;
  assigned: number;
  completed: number;
  percent: number;
}

export interface ActivityItem {
  id: number;
  userId: number;
  userName: string;
  exerciseTitle: string;
  date: string;
  completedAt: number;
}
