"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { resolveTraineePt } from "@/features/members/services/resolve-trainee-pt";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { callApi, tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
import { requireAdmin } from "@/services/auth-guard";
import { getErrorsTranslator } from "@/services/localize-message";
import type { FormState } from "@/types/form";
import { createErrorState, createSuccessState } from "@/utils/form";

// The form field a refused create belongs to, by API error code.
const CREATE_ERROR_FIELDS: Record<string, string> = {
  NAME_TAKEN: "name",
  EMAIL_TAKEN: "email",
  PT_NOT_FOUND: "ptAdminId",
};

export const createMemberAction = withFormErrorHandling(
  "createMember",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    const admin = await requireAdmin();

    const rawName = String(formData.get("name") ?? "");
    const rawEmail = String(formData.get("email") ?? "");
    const values = { name: rawName, email: rawEmail };
    const pt = resolveTraineePt(admin, String(formData.get("ptAdminId") ?? ""));

    if (pt.status === "error") {
      return createErrorState(pt.message, {
        fieldErrors: { ptAdminId: pt.message },
        values,
      });
    }

    // The API validates, refuses duplicates and generates the password.
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/trainees", {
        body: { name: rawName, email: rawEmail, ptAdminId: pt.ptAdminId },
      }),
    );

    if (!outcome.ok) {
      const field = CREATE_ERROR_FIELDS[outcome.error.code];

      return field
        ? createErrorState(outcome.error.message, {
            fieldErrors: { [field]: outcome.error.message },
            values,
          })
        : apiErrorToFormState(outcome.error, { values });
    }
    const created = outcome.data;

    revalidatePath(ROUTES.ADMIN);

    const t = await getErrorsTranslator();

    // The password goes back to the caller once and is never logged.
    return {
      ...createSuccessState(t("toasts.memberAdded", { name: created.name })),
      credentials: {
        name: created.name,
        email: rawEmail.trim(),
        password: created.password,
      },
    };
  },
);

// The API deletes the trainee and everything they own (chat, workouts, meals,
// social content, aliases, hidden rows, push subscriptions) in one transaction.
export const deleteMemberAction = withResultErrorHandling(
  "deleteMember",
  async (userId: number) => {
    const id = z.number().int().positive().parse(userId);

    await requireAdmin();
    // Scope only: the API ignores "hidden" for deletes.
    await callApi("admin", (api) =>
      api.DELETE("/v1/trainees/{userId}", { params: { path: { userId: id } } }),
    );

    revalidatePath(ROUTES.ADMIN);
    redirect(ROUTES.ADMIN);
  },
);
