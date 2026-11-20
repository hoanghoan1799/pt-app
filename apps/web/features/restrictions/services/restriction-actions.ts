"use server";

import {
  blockUserSchema,
  liftRestrictionSchema,
  RESTRICTION_ERROR_CODES,
  RESTRICTION_MESSAGES,
} from "@pt/contracts";
import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import type { ApiError } from "@/services/api/errors";
import { requireSuperAdmin } from "@/services/auth-guard";
import type { ActionErrorResult } from "@/types/error";
import { getAdminUserPath } from "@/utils/routes";

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

// A missing (or out of scope) trainee is a 404 from the API, with one of
// several "not found" texts: the block sheet always says the same thing.
const isNotFound = (error: ApiError) => error.status === 404;

// The trainee page, the list badge and the trainee's own screens change.
const refresh = (userId: number) => {
  revalidatePath(ROUTES.ADMIN);
  revalidatePath(getAdminUserPath(userId), "layout");
  revalidatePath(ROUTES.FEED);
};

// Super admin only: requireSuperAdmin() (requireAdmin() plus the role) sends a
// PT back to the dashboard before anything is sent, and the API answers 403
// to a PT as well. The input is untrusted: bad values are refused here, a
// missing trainee by the API.
export const blockUserAction = withResultErrorHandling(
  "blockUser",
  async (input: unknown) => {
    await requireSuperAdmin();
    const parsed = blockUserSchema.safeParse(input);

    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? RESTRICTION_MESSAGES.INVALID_INPUT,
      );
    }
    const { userId, ...body } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.PUT("/v1/trainees/{userId}/restriction", {
        params: { path: { userId } },
        body,
      }),
    );

    if (!outcome.ok) {
      return fail(
        isNotFound(outcome.error)
          ? RESTRICTION_MESSAGES.USER_NOT_FOUND
          : outcome.error.message,
      );
    }
    refresh(userId);
  },
);

// "Gỡ chặn": lifts the active block early (D7).
export const liftRestrictionAction = withResultErrorHandling(
  "liftRestriction",
  async (input: unknown) => {
    await requireSuperAdmin();
    const parsed = liftRestrictionSchema.safeParse({ userId: input });

    if (!parsed.success) {
      return fail(RESTRICTION_MESSAGES.INVALID_INPUT);
    }
    const { userId } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.DELETE("/v1/trainees/{userId}/restriction", {
        params: { path: { userId } },
      }),
    );

    if (!outcome.ok) {
      return fail(
        outcome.error.code === RESTRICTION_ERROR_CODES.NOT_RESTRICTED
          ? RESTRICTION_MESSAGES.NOT_RESTRICTED
          : isNotFound(outcome.error)
            ? RESTRICTION_MESSAGES.USER_NOT_FOUND
            : outcome.error.message,
      );
    }
    refresh(userId);
  },
);
