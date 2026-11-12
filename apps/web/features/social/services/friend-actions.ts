"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { FRIEND_MESSAGES } from "@/features/social/constants/social";
import { searchTraineeByEmail } from "@/features/social/services/social-queries";
import {
  requireWho,
  type Who,
} from "@/features/social/services/social-session";
import type { SearchResult } from "@/features/social/types/social";
import {
  parseSearchEmail,
  reportSchema,
  resolveReportSchema,
  userIdSchema,
} from "@/features/social/utils/friend-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { callApi } from "@/services/api/call";
import type { ApiClient } from "@/services/api/client";
import { requireSuperAdmin, requireUser } from "@/services/auth-guard";
import type { ActionErrorResult } from "@/types/error";

// Trainee actions start with requireUser, admin ones with requireAdmin /
// requireSuperAdmin; input is validated with Zod and the API re-checks
// everything that depends on the data (terms, blocks, limits, scope).

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

const refresh = () => {
  revalidatePath(ROUTES.FRIENDS);
  revalidatePath("/feed");
  revalidatePath("/profile", "layout");
  revalidatePath("/post", "layout");
  revalidatePath(ROUTES.NOTIFICATIONS);
};

export type SearchFriendResult =
  { status: "success"; result: SearchResult | null } | ActionErrorResult;

export const searchFriendAction = withResultErrorHandling(
  "searchFriend",
  async (email: unknown): Promise<SearchFriendResult> => {
    await requireUser();
    const key = parseSearchEmail(email);

    if (key === null) {
      return fail(FRIEND_MESSAGES.EMAIL_INVALID);
    }
    return { status: "success", result: await searchTraineeByEmail(key) };
  },
);

// Runs a friend call on the other trainee's id for the signed-in trainee.
const friendAction = (
  name: string,
  run: (
    api: ApiClient,
    otherId: number,
  ) => Promise<{ response: Response; data?: unknown; error?: unknown }>,
) =>
  withResultErrorHandling(name, async (otherId: unknown) => {
    await requireUser();
    const id = userIdSchema.safeParse(otherId);

    if (!id.success) {
      return fail(FRIEND_MESSAGES.NOT_FOUND);
    }
    await callApi("user", (api) => run(api, id.data));
    refresh();
  });

export const sendFriendRequestAction = friendAction(
  "sendFriendRequest",
  (api, userId) =>
    api.POST("/v1/social/friends/requests", { body: { userId } }),
);
export const acceptFriendRequestAction = friendAction(
  "acceptFriendRequest",
  (api, userId) =>
    api.POST("/v1/social/friends/requests/{userId}/accept", {
      params: { path: { userId: String(userId) } },
    }),
);
export const declineFriendRequestAction = friendAction(
  "declineFriendRequest",
  (api, userId) =>
    api.POST("/v1/social/friends/requests/{userId}/decline", {
      params: { path: { userId: String(userId) } },
    }),
);
export const cancelFriendRequestAction = friendAction(
  "cancelFriendRequest",
  (api, userId) =>
    api.DELETE("/v1/social/friends/requests/{userId}", {
      params: { path: { userId: String(userId) } },
    }),
);
export const unfriendAction = friendAction("unfriend", (api, userId) =>
  api.DELETE("/v1/social/friends/{userId}", {
    params: { path: { userId: String(userId) } },
  }),
);
export const blockUserAction = friendAction("blockUser", (api, userId) =>
  api.PUT("/v1/social/blocks/{userId}", {
    params: { path: { userId: String(userId) } },
  }),
);
export const unblockUserAction = friendAction("unblockUser", (api, userId) =>
  api.DELETE("/v1/social/blocks/{userId}", {
    params: { path: { userId: String(userId) } },
  }),
);

// Trainees and admins report a post, comment or trainee.
export const reportAction = withResultErrorHandling(
  "createReport",
  async (who: Who, input: unknown) => {
    const actor = await requireWho(who);
    const parsed = reportSchema.safeParse(input);

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? FRIEND_MESSAGES.NOT_FOUND);
    }
    const { targetKind, targetId, reason } = parsed.data;

    await callApi(actor, (api) =>
      api.POST("/v1/social/reports", {
        body: { targetKind, targetId, ...(reason ? { reason } : {}) },
      }),
    );
    revalidatePath(ROUTES.ADMIN_REPORTS);
    revalidatePath(ROUTES.ADMIN);
  },
);

// Super admin only: keep or delete the reported content (spec A14).
export const resolveReportAction = withResultErrorHandling(
  "resolveReport",
  async (input: unknown) => {
    await requireSuperAdmin();
    const parsed = resolveReportSchema.safeParse(input);

    if (!parsed.success) {
      return fail(FRIEND_MESSAGES.REPORT_NOT_FOUND);
    }
    await callApi("admin", (api) =>
      api.POST("/v1/social/reports/{id}/resolve", {
        params: { path: { id: String(parsed.data.reportId) } },
        body: { resolution: parsed.data.resolution },
      }),
    );
    revalidatePath(ROUTES.ADMIN_REPORTS);
    revalidatePath(ROUTES.ADMIN);
    revalidatePath("/feed");
    revalidatePath("/admin/social", "layout");
  },
);
