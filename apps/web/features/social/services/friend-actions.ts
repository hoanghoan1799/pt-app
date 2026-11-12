"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import {
  FRIEND_MESSAGES,
  SOCIAL_MESSAGES,
} from "@/features/social/constants/social";
import {
  resolveActor,
  traineeActor,
  type Who,
} from "@/features/social/services/actor-guard";
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  type FriendError,
  sendFriendRequest,
  unblockUser,
  unfriend,
} from "@/features/social/services/friend-mutations";
import {
  type SearchResult,
  searchTraineeByEmail,
} from "@/features/social/services/friend-queries";
import { actorOfAdmin } from "@/features/social/services/post-context";
import {
  createReport,
  resolveReport,
} from "@/features/social/services/report-mutations";
import { scheduleSocialPush } from "@/features/social/services/social-notifications";
import {
  parseSearchEmail,
  reportSchema,
  resolveReportSchema,
  userIdSchema,
} from "@/features/social/utils/friend-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireSuperAdmin } from "@/services/auth-guard";
import type { ActionErrorResult } from "@/types/error";

// Trainee actions resolve the actor first (requireUser + accepted terms),
// admin actions requireAdmin / requireSuperAdmin; input is validated with Zod
// and the services re-check everything that depends on the database.

const MESSAGES: Record<FriendError, string> = {
  not_found: FRIEND_MESSAGES.NOT_FOUND,
  already_friends: FRIEND_MESSAGES.ALREADY_FRIENDS,
  already_requested: FRIEND_MESSAGES.ALREADY_REQUESTED,
  rate_limited: FRIEND_MESSAGES.RATE_LIMITED,
};

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
    const actor = await traineeActor();

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    if (parseSearchEmail(email) === null) {
      return fail(FRIEND_MESSAGES.EMAIL_INVALID);
    }
    return {
      status: "success",
      result: await searchTraineeByEmail(actor.id, email),
    };
  },
);

// Runs a friend mutation on the other trainee's id for the signed-in trainee.
const friendAction = (
  name: string,
  run: (
    meId: number,
    otherId: number,
  ) => Promise<
    { ok: true; notificationId?: number } | { ok: false; error: FriendError }
  >,
) =>
  withResultErrorHandling(name, async (otherId: unknown) => {
    const actor = await traineeActor();

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const id = userIdSchema.safeParse(otherId);

    if (!id.success) {
      return fail(FRIEND_MESSAGES.NOT_FOUND);
    }
    const result = await run(actor.id, id.data);

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    if (result.notificationId !== undefined) {
      scheduleSocialPush({ notificationId: result.notificationId });
    }
    refresh();
  });

export const sendFriendRequestAction = friendAction(
  "sendFriendRequest",
  (meId, otherId) => sendFriendRequest(meId, otherId),
);
export const acceptFriendRequestAction = friendAction(
  "acceptFriendRequest",
  (meId, otherId) => acceptFriendRequest(meId, otherId),
);
export const declineFriendRequestAction = friendAction(
  "declineFriendRequest",
  (meId, otherId) => declineFriendRequest(meId, otherId),
);
export const cancelFriendRequestAction = friendAction(
  "cancelFriendRequest",
  (meId, otherId) => cancelFriendRequest(meId, otherId),
);
export const unfriendAction = friendAction("unfriend", (meId, otherId) =>
  unfriend(meId, otherId),
);
export const blockUserAction = friendAction("blockUser", (meId, otherId) =>
  blockUser(meId, otherId),
);
export const unblockUserAction = friendAction("unblockUser", (meId, otherId) =>
  unblockUser(meId, otherId),
);

// Trainees and admins report a post, comment or trainee.
export const reportAction = withResultErrorHandling(
  "createReport",
  async (who: Who, input: unknown) => {
    const actor = await resolveActor(who);

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = reportSchema.safeParse(input);

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? FRIEND_MESSAGES.NOT_FOUND);
    }
    const result = await createReport(actor, parsed.data);

    if (!result.ok) {
      return fail(FRIEND_MESSAGES.NOT_FOUND);
    }
    revalidatePath(ROUTES.ADMIN_REPORTS);
    revalidatePath(ROUTES.ADMIN);
  },
);

// Super admin only: keep or delete the reported content (spec A14).
export const resolveReportAction = withResultErrorHandling(
  "resolveReport",
  async (input: unknown) => {
    const admin = await requireSuperAdmin();
    const parsed = resolveReportSchema.safeParse(input);

    if (!parsed.success) {
      return fail(FRIEND_MESSAGES.REPORT_NOT_FOUND);
    }
    const result = await resolveReport(
      actorOfAdmin(admin),
      parsed.data.reportId,
      parsed.data.resolution,
    );

    if (!result.ok) {
      return fail(
        result.error === "forbidden"
          ? SOCIAL_MESSAGES.NOT_ALLOWED
          : FRIEND_MESSAGES.REPORT_NOT_FOUND,
      );
    }
    revalidatePath(ROUTES.ADMIN_REPORTS);
    revalidatePath(ROUTES.ADMIN);
    revalidatePath("/feed");
    revalidatePath("/admin/social", "layout");
  },
);
