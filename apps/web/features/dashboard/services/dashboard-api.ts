import "server-only";

import type {
  ActivityItem,
  MemberProgress,
  PtFilter,
} from "@/features/dashboard/types/dashboard";
import {
  toActivityItems,
  toMemberProgress,
} from "@/features/dashboard/utils/api-mapping";
import { callApi } from "@/services/api/call";

// Trainees the admin hid, or outside a PT's workspace, are left out by the API,
// so the list and the totals built from it never count them. Only a super
// admin's `ptFilter` counts; the API ignores it for a PT.
export const getMemberProgress = async (
  weekStart: string,
  ptFilter: PtFilter = "all",
): Promise<MemberProgress[]> => {
  const { members } = await callApi("admin", (api) =>
    api.GET("/v1/dashboard/summary", {
      params: {
        query: {
          week: weekStart,
          ...(ptFilter === "all" ? {} : { pt: String(ptFilter) }),
        },
      },
    }),
  );

  return members.map(toMemberProgress);
};

interface RecentActivityOptions {
  limit: number;
  // One trainee's history (the member page); otherwise the whole dashboard.
  userId?: number;
}

// Completions and personal bests, newest first. Admin-only: both callers are
// pages under app/admin/(protected) that call requireAdmin().
export const getRecentActivity = async ({
  limit,
  userId,
}: RecentActivityOptions): Promise<ActivityItem[]> => {
  const query = { limit: String(limit) };
  const { items } = await callApi("admin", (api) =>
    userId === undefined
      ? api.GET("/v1/dashboard/activity", { params: { query } })
      : api.GET("/v1/trainees/{userId}/activity", {
          params: { path: { userId: String(userId) }, query },
        }),
  );

  return toActivityItems(items);
};
