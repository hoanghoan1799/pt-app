import type {
  MemberProgress,
  MemberRow,
  WeekSummary,
} from "@/features/dashboard/types/dashboard";
import { calculatePercent, formatRelativeTime } from "@/utils/time";

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

const getMemberStatus = ({
  assigned,
  completed,
}: MemberProgress): MemberRow["status"] => {
  if (!assigned) {
    return "no-plan";
  }
  if (!completed) {
    return "not-started";
  }
  return completed >= assigned ? "done" : "in-progress";
};

interface MemberRowOptions {
  weekStart: string;
  timeZone: string;
  now: number;
  getHref: (memberId: number, weekStart: string) => string;
}

// Display-ready rows; relative times are computed once on the server so the
// client list renders the same text it was hydrated with.
export const toMemberRows = (
  members: MemberProgress[],
  { weekStart, timeZone, now, getHref }: MemberRowOptions,
): MemberRow[] =>
  members.map((member) => ({
    ...member,
    percent: calculatePercent(member.completed, member.assigned),
    status: getMemberStatus(member),
    lastActiveLabel:
      member.lastActiveAt === null
        ? null
        : formatRelativeTime(member.lastActiveAt, timeZone, now),
    href: getHref(member.id, weekStart),
  }));
