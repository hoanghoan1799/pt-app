"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import {
  AUTH_MESSAGES,
  LOGIN_FAILURE_DELAY_MS,
} from "@/features/auth/constants/messages";
import { withFormErrorHandling } from "@/services/action-errors";
import { findAdminByUsername } from "@/services/admins";
import {
  adminLimiterKey,
  clearAttempts,
  isLocked,
  recordFailure,
  userLimiterKey,
} from "@/services/login-limiter";
import { getDummyPasswordHash, verifyPassword } from "@/services/password";
import {
  endSession,
  startAdminSession,
  startUserSession,
} from "@/services/session";
import { findUserByEmail } from "@/services/users";
import type { FormState } from "@/types/form";
import { emailSchema, toEmailKey } from "@/utils/email";
import { createErrorState } from "@/utils/form";
import { toUsernameKey } from "@/utils/username";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const loginWithEmailAction = withFormErrorHandling(
  "loginWithEmail",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const values = { email };

    if (!email || !password) {
      return createErrorState(AUTH_MESSAGES.EMAIL_CREDENTIALS_REQUIRED, {
        values,
      });
    }

    const limiterKey = userLimiterKey(toEmailKey(email));

    if (await isLocked(limiterKey)) {
      return createErrorState(AUTH_MESSAGES.LOGIN_LOCKED, { values });
    }

    // A malformed email can never match a stored one: same generic failure.
    const user = emailSchema.safeParse(email).success
      ? await findUserByEmail(email)
      : null;
    // Always run one hash check so unknown emails and trainees without a
    // password yet are not faster to reject.
    const isPasswordCorrect = await verifyPassword(
      password,
      user?.passwordHash ?? (await getDummyPasswordHash()),
    );

    if (!user?.passwordHash || !isPasswordCorrect) {
      await recordFailure(limiterKey);
      await wait(LOGIN_FAILURE_DELAY_MS);
      return createErrorState(AUTH_MESSAGES.EMAIL_LOGIN_WRONG, { values });
    }

    await clearAttempts(limiterKey);
    await startUserSession(user.id);
    redirect(ROUTES.WORKOUTS);
  },
);

export const loginAdminAction = withFormErrorHandling(
  "loginAdmin",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const values = { username };

    if (!username || !password) {
      return createErrorState(AUTH_MESSAGES.CREDENTIALS_REQUIRED, { values });
    }

    const limiterKey = adminLimiterKey(toUsernameKey(username));

    if (await isLocked(limiterKey)) {
      return createErrorState(AUTH_MESSAGES.LOGIN_LOCKED, { values });
    }

    const admin = await findAdminByUsername(username);
    // Always run one hash check so an unknown username isn't faster to reject.
    const isPasswordCorrect = await verifyPassword(
      password,
      admin?.passwordHash ?? (await getDummyPasswordHash()),
    );

    if (!admin || !isPasswordCorrect) {
      await recordFailure(limiterKey);
      await wait(LOGIN_FAILURE_DELAY_MS);
      return createErrorState(AUTH_MESSAGES.CREDENTIALS_WRONG, { values });
    }

    await clearAttempts(limiterKey);
    await startAdminSession(admin.id);
    redirect(ROUTES.ADMIN);
  },
);

export const logoutUserAction = async () => {
  await endSession(USER_COOKIE);
  redirect(ROUTES.HOME);
};

export const logoutAdminAction = async () => {
  await endSession(ADMIN_COOKIE);
  redirect(ROUTES.ADMIN_LOGIN);
};
