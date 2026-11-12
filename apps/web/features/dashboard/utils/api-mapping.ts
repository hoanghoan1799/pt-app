import type {
  ActivityResponse,
  DashboardSummaryResponse,
} from "@pt/contracts";

import { avatarUrl } from "@/features/avatar/utils/avatar-rules";
import type {
  ActivityItem,
  MemberProgress,
} from "@/features/dashboard/types/dashboard";

const toEpochMs = (iso: string | null) => (iso ? Date.parse(iso) : null);

// API member row -> the dashboard's row (versioned avatar URL, epoch ms).
// `percent` and `status` are recomputed by toMemberRows, as before.
export const toMemberProgress = (
  member: DashboardSummaryResponse["members"][number],
): MemberProgress => ({
  id: member.id,
  name: member.name,
  displayName: member.displayName,
  avatarUrl: avatarUrl(
    "user",
    member.id,
    member.avatarUpdatedAt ? new Date(member.avatarUpdatedAt) : null,
  ),
  ptAdminId: member.ptAdminId,
  ptName: member.ptName,
  assigned: member.assigned,
  completed: member.completed,
  plannedDays: member.plannedDays,
  activeDays: member.activeDays,
  nutritionDays: member.nutritionDays,
  lastActiveAt: toEpochMs(member.lastActiveAt),
});

export const toActivityItems = (
  items: ActivityResponse["items"],
): ActivityItem[] =>
  items.map((item) => {
    const base = {
      id: item.id,
      userId: item.userId,
      userName: item.userName,
      displayName: item.displayName,
      exerciseTitle: item.exerciseTitle,
      date: item.date,
      occurredAt: Date.parse(item.occurredAt),
    };

    return item.kind === "completion"
      ? { ...base, kind: "completion" }
      : {
          ...base,
          kind: "personalBest",
          best: { weightKg: item.best.weightKg, reps: item.best.reps },
          previousBest: {
            weightKg: item.previousBest.weightKg,
            reps: item.previousBest.reps,
          },
        };
  });
