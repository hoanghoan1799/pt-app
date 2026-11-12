import type { MemberStatus, ProgressTrend } from "@pt/contracts";

import {
  type BestSet,
  compareSets,
  getBestSet,
  isPersonalBest,
  isSameExerciseBefore,
  type SetSession,
  toBestSet,
} from "./sets.js";

// Ported from apps/web/features/{members,dashboard}/utils.

export const calculatePercent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

// ---- "Tiến bộ" rows --------------------------------------------------------

export type ProgressSession = SetSession & { title: string };

export type ExerciseProgressRow = {
  youtubeId: string;
  title: string;
  weekBest: BestSet;
  previousBest: BestSet | null;
  changeKg: number | null;
  trend: ProgressTrend;
  lastDate: string;
};

const getTrend = (
  weekBest: BestSet,
  previousBest: BestSet | null,
): ProgressTrend => {
  if (previousBest === null) {
    return "first";
  }
  const diff = compareSets(weekBest, previousBest);

  if (diff > 0) {
    return "up";
  }
  return diff < 0 ? "down" : "same";
};

const isLater = (a: ProgressSession, b: ProgressSession) =>
  a.date > b.date || (a.date === b.date && a.exerciseId > b.exerciseId);

// Rows for one trainee's sessions (the caller filters by user). Per link: the
// selected week's best vs the best before the week (F4); links without a
// weighted set in the week are left out (F6, OQ2); no earlier weighted set
// means "first" (F6, D11). Sessions after the week are ignored. Newest first.
export const buildExerciseProgress = (
  sessions: ProgressSession[],
  weekStart: string,
  weekEnd: string,
): ExerciseProgressRow[] => {
  const byLink = new Map<string, ProgressSession[]>();

  for (const session of sessions) {
    if (session.date > weekEnd) {
      continue;
    }
    const linkSessions = byLink.get(session.youtubeId);

    if (linkSessions) {
      linkSessions.push(session);
    } else {
      byLink.set(session.youtubeId, [session]);
    }
  }

  const rows: ExerciseProgressRow[] = [];

  for (const [youtubeId, linkSessions] of byLink) {
    const weekSessions = linkSessions.filter(
      (session) => session.date >= weekStart && session.sets.length > 0,
    );
    const weekBest = getBestSet(
      weekSessions.flatMap((session) => session.sets),
    );

    if (weekBest === null) {
      continue;
    }

    const earlierBest = getBestSet(
      linkSessions
        .filter((session) => session.date < weekStart)
        .flatMap((session) => session.sets),
    );
    const previousBest = earlierBest && toBestSet(earlierBest);
    const latest = linkSessions.reduce((a, b) => (isLater(b, a) ? b : a));
    const lastDate = weekSessions.reduce(
      (date, session) => (session.date > date ? session.date : date),
      weekStart,
    );

    rows.push({
      youtubeId,
      title: latest.title,
      weekBest: toBestSet(weekBest),
      previousBest,
      changeKg: previousBest && weekBest.weightKg - previousBest.weightKg,
      trend: getTrend(weekBest, previousBest),
      lastDate,
    });
  }

  return rows.sort(
    (a, b) =>
      b.lastDate.localeCompare(a.lastDate) || a.title.localeCompare(b.title),
  );
};

// ---- Dashboard -------------------------------------------------------------

export type MemberProgress = {
  id: number;
  name: string;
  displayName: string;
  avatarUpdatedAt: Date | null;
  ptAdminId: number | null;
  ptName: string | null;
  assigned: number;
  completed: number;
  plannedDays: number;
  activeDays: number;
  nutritionDays: number;
  lastActiveAt: Date | null;
};

export type WeekSummary = {
  memberCount: number;
  plannedCount: number;
  activeCount: number;
  assigned: number;
  completed: number;
  percent: number;
};

export const summarizeWeek = (members: MemberProgress[]): WeekSummary => {
  const assigned = members.reduce((sum, member) => sum + member.assigned, 0);
  const completed = members.reduce((sum, member) => sum + member.completed, 0);

  return {
    memberCount: members.length,
    plannedCount: members.filter((member) => member.assigned > 0).length,
    activeCount: members.filter((member) => member.completed > 0).length,
    assigned,
    completed,
    percent: calculatePercent(completed, assigned),
  };
};

export const getMemberStatus = ({
  assigned,
  completed,
}: Pick<MemberProgress, "assigned" | "completed">): MemberStatus => {
  if (!assigned) {
    return "no-plan";
  }
  if (!completed) {
    return "not-started";
  }
  return completed >= assigned ? "done" : "in-progress";
};

// ---- Recent activity --------------------------------------------------------

type ActivityBase = {
  id: number;
  userId: number;
  userName: string;
  exerciseTitle: string;
  date: string;
  occurredAt: number;
};

export type CompletionActivity = ActivityBase & { kind: "completion" };

export type PersonalBestActivity = ActivityBase & {
  kind: "personalBest";
  best: BestSet;
  previousBest: BestSet;
};

export type ActivityItem = CompletionActivity | PersonalBestActivity;

// One exercise with logged sets inside the activity window.
export type ActivitySession = SetSession & {
  userName: string;
  exerciseTitle: string;
  // Epoch ms of the session's latest saved set.
  occurredAt: number;
};

// Window sessions whose sets are a personal best against `history` (D6, D8,
// D11). `history` may hold extra sessions (other users, links or later dates,
// even the window itself): only the same user + link on earlier dates count.
export const findPersonalBests = (
  window: ActivitySession[],
  history: SetSession[],
): PersonalBestActivity[] =>
  window.flatMap((session) => {
    const key = {
      userId: session.userId,
      youtubeId: session.youtubeId,
      date: session.date,
    };
    const earlier = history.filter((item) => isSameExerciseBefore(item, key));
    const best = getBestSet(session.sets);
    const previousBest = getBestSet(earlier.flatMap((item) => item.sets));

    if (
      best === null ||
      previousBest === null ||
      !isPersonalBest(session.sets, earlier, key)
    ) {
      return [];
    }

    return [
      {
        kind: "personalBest" as const,
        id: session.exerciseId,
        userId: session.userId,
        userName: session.userName,
        exerciseTitle: session.exerciseTitle,
        date: session.date,
        occurredAt: session.occurredAt,
        best: toBestSet(best),
        previousBest: toBestSet(previousBest),
      },
    ];
  });

// Newest first, at most `limit` items; on an exact tie a record comes first.
export const mergeActivity = (
  completions: ActivityItem[],
  records: ActivityItem[],
  limit: number,
): ActivityItem[] =>
  [...records, ...completions]
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, limit);
