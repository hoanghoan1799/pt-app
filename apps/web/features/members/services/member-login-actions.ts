"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { withResultErrorHandling } from "@/services/action-errors";
import { callApi } from "@/services/api/call";
import { requireAdmin } from "@/services/auth-guard";

const userIdSchema = z.number().int().positive();

// Typo fix: the password and open sessions stay as they are (D11). The API
// checks the email, its uniqueness and the admin's scope over the trainee.
export const changeMemberEmailAction = withResultErrorHandling(
  "changeMemberEmail",
  async (userId: number, email: string) => {
    const id = userIdSchema.parse(userId);

    await requireAdmin();
    await callApi("admin", (api) =>
      api.PATCH("/v1/trainees/{userId}/email", {
        params: { path: { userId: id } },
        body: { email },
      }),
    );
    revalidatePath(ROUTES.ADMIN);
    return { status: "success" as const };
  },
);

export const resetMemberPasswordAction = withResultErrorHandling(
  "resetMemberPassword",
  async (userId: number) => {
    const id = userIdSchema.parse(userId);

    await requireAdmin();
    const { password } = await callApi("admin", (api) =>
      api.POST("/v1/trainees/{userId}/password-reset", {
        params: { path: { userId: id } },
      }),
    );

    revalidatePath(ROUTES.ADMIN);
    return { status: "success" as const, password };
  },
);
