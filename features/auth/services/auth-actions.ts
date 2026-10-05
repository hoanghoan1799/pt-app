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
import { getDummyPasswordHash, verifyPassword } from "@/services/password";
import {
  endSession,
  startAdminSession,
  startUserSession,
} from "@/services/session";
import { findUserByName } from "@/services/users";
import type { FormState } from "@/types/form";
import { createErrorState } from "@/utils/form";
import { normalizeName } from "@/utils/name";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const loginUserAction = withFormErrorHandling(
  "loginUser",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const name = String(formData.get("name") ?? "");
    const values = { name };

    if (!normalizeName(name)) {
      return createErrorState(AUTH_MESSAGES.NAME_REQUIRED, { values });
    }

    const user = await findUserByName(name);

    if (!user) {
      return createErrorState(AUTH_MESSAGES.NAME_NOT_FOUND, { values });
    }

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

    const admin = await findAdminByUsername(username);
    // Always run one hash check so an unknown username isn't faster to reject.
    const isPasswordCorrect = await verifyPassword(
      password,
      admin?.passwordHash ?? (await getDummyPasswordHash()),
    );

    if (!admin || !isPasswordCorrect) {
      await wait(LOGIN_FAILURE_DELAY_MS);
      return createErrorState(AUTH_MESSAGES.CREDENTIALS_WRONG, { values });
    }

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
