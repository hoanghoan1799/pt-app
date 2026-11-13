"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import { withFormErrorHandling } from "@/services/action-errors";
import { runApi, tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
import { applyStoredLocale } from "@/services/locale-cookie";
import { endSession, startSession } from "@/services/session";
import type { FormState } from "@/types/form";
import { createErrorState } from "@/utils/form";

// Shown in the "signed-in devices" list of the API.
const CLIENT = { clientKind: "web" as const };

// Wrong credentials, lockout and validation come back from the API as 4xx with
// the text to show (`error.message`); the limiter lives in the API.
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

    const outcome = await tryApi("none", (api) =>
      api.POST("/v1/auth/login", { body: { email, password, ...CLIENT } }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error, { values });
    }

    await startSession("user", outcome.data.token);
    await applyStoredLocale(outcome.data.actor.locale);
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

    const outcome = await tryApi("none", (api) =>
      api.POST("/v1/auth/admin/login", {
        body: { username, password, ...CLIENT },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error, { values });
    }

    await startSession("admin", outcome.data.token);
    await applyStoredLocale(outcome.data.actor.locale);
    redirect(ROUTES.ADMIN);
  },
);

// Revokes the session on the API, then forgets the cookie. A failing API call
// (already expired, API down) must not keep the user signed in on this device.
export const logoutUserAction = async () => {
  await runApi("user", (api) => api.POST("/v1/auth/logout"));
  await endSession(USER_COOKIE);
  redirect(ROUTES.HOME);
};

export const logoutAdminAction = async () => {
  await runApi("admin", (api) => api.POST("/v1/auth/logout"));
  await endSession(ADMIN_COOKIE);
  redirect(ROUTES.ADMIN_LOGIN);
};
