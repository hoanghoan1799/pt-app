"use server";

import { createPtRequestSchema, toFieldErrors } from "@pt/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { PT_MESSAGES } from "@/features/pts/constants/messages";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { callApi, tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
import { requireSuperAdmin } from "@/services/auth-guard";
import type { FormState } from "@/types/form";
import { createErrorState, createSuccessState } from "@/utils/form";

// Creates a PT account (admins.role = 'pt'). Super admin only; the API checks
// the username rules and that it is free (USERNAME_TAKEN).
export const createPtAction = withFormErrorHandling(
  "createPt",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireSuperAdmin();

    const rawUsername = String(formData.get("username") ?? "");
    const parsed = createPtRequestSchema.safeParse({
      username: rawUsername,
      password: String(formData.get("password") ?? ""),
    });

    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error);

      return createErrorState(Object.values(fieldErrors)[0] ?? "", {
        fieldErrors,
        values: { username: rawUsername },
      });
    }
    const { username } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/pts", { body: parsed.data }),
    );

    if (!outcome.ok) {
      return outcome.error.code === "USERNAME_TAKEN"
        ? createErrorState(outcome.error.message, {
            fieldErrors: { username: outcome.error.message },
            values: { username },
          })
        : apiErrorToFormState(outcome.error, { values: { username } });
    }

    revalidatePath(ROUTES.ADMIN_PTS);
    return createSuccessState(PT_MESSAGES.CREATED);
  },
);

const verifySchema = z.object({
  adminId: z.number().int().positive(),
  verified: z.boolean(),
});

// Grants or removes the blue tick of any admin account. Super admin only.
export const setAdminVerifiedAction = withResultErrorHandling(
  "setAdminVerified",
  async (adminId: number, verified: boolean) => {
    await requireSuperAdmin();

    const input = verifySchema.parse({ adminId, verified });

    await callApi("admin", (api) =>
      api.PUT("/v1/admins/{adminId}/verified", {
        params: { path: { adminId: input.adminId } },
        body: { verified: input.verified },
      }),
    );

    revalidatePath(ROUTES.ADMIN_PTS);
    return { status: "success" as const };
  },
);

const assignSchema = z.object({
  userId: z.number().int().positive(),
  ptAdminId: z.number().int().positive().nullable(),
});

// Sets (or clears, with null) the PT responsible for a trainee. Super admin
// only; the API checks that the target is a PT account.
export const assignTraineePtAction = withResultErrorHandling(
  "assignTraineePt",
  async (userId: number, ptAdminId: number | null) => {
    await requireSuperAdmin();

    const input = assignSchema.parse({ userId, ptAdminId });

    await callApi("admin", (api) =>
      api.PUT("/v1/trainees/{userId}/pt", {
        params: { path: { userId: input.userId } },
        body: { ptAdminId: input.ptAdminId },
      }),
    );

    revalidatePath(ROUTES.ADMIN);
    return { status: "success" as const };
  },
);
