"use server";

import { createHash, timingSafeEqual } from "node:crypto";

import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import {
  AUTH_MESSAGES,
  LOGIN_FAILURE_DELAY_MS,
} from "@/features/auth/constants/messages";
import {
  endSession,
  startAdminSession,
  startUserSession,
} from "@/services/session";
import { findUserByName } from "@/services/users";
import type { FormState } from "@/types/form";
import { createErrorState } from "@/utils/form";
import { normalizeName } from "@/utils/name";

const hashValue = (value: string) =>
  createHash("sha256").update(value).digest();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const loginUserAction = async (
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> => {
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
};

export const loginAdminAction = async (
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> => {
  const password = String(formData.get("password") ?? "");
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    return createErrorState(AUTH_MESSAGES.ADMIN_NOT_CONFIGURED);
  }

  if (!password) {
    return createErrorState(AUTH_MESSAGES.PASSWORD_REQUIRED);
  }

  if (!timingSafeEqual(hashValue(password), hashValue(expectedPassword))) {
    await wait(LOGIN_FAILURE_DELAY_MS);
    return createErrorState(AUTH_MESSAGES.PASSWORD_WRONG);
  }

  await startAdminSession();
  redirect(ROUTES.ADMIN);
};

export const logoutUserAction = async () => {
  await endSession(USER_COOKIE);
  redirect(ROUTES.HOME);
};

export const logoutAdminAction = async () => {
  await endSession(ADMIN_COOKIE);
  redirect(ROUTES.ADMIN_LOGIN);
};
