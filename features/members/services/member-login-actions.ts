"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { MEMBER_MESSAGES } from "@/features/members/constants/messages";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdminForUser } from "@/services/admin-access";
import { requireAdmin } from "@/services/auth-guard";
import { generatePassword, hashPassword } from "@/services/password";
import {
  findUserByEmail,
  findUserById,
  setUserEmail,
  setUserPassword,
} from "@/services/users";
import type { ActionErrorResult } from "@/types/error";
import { emailSchema } from "@/utils/email";

const userIdSchema = z.number().int().positive();

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

// Shared checks: the member exists and the email is valid and not used by
// anyone else (compared by email_key, so case does not matter).
const validateMemberEmail = async (userId: number, email: string) => {
  const id = userIdSchema.parse(userId);
  const parsedEmail = emailSchema.safeParse(email);

  if (!parsedEmail.success) {
    return { error: fail(parsedEmail.error.issues[0].message) };
  }

  if (!(await findUserById(id))) {
    return { error: fail(MEMBER_MESSAGES.NOT_FOUND) };
  }

  const owner = await findUserByEmail(parsedEmail.data);

  if (owner && owner.id !== id) {
    return { error: fail(MEMBER_MESSAGES.EMAIL_TAKEN) };
  }
  return { id, email: parsedEmail.data };
};

// Typo fix: the password and open sessions stay as they are (D11).
export const changeMemberEmailAction = withResultErrorHandling(
  "changeMemberEmail",
  async (userId: number, email: string) => {
    await requireAdmin();
    await requireAdminForUser(userId);

    const checked = await validateMemberEmail(userId, email);

    if (checked.error) {
      return checked.error;
    }

    await setUserEmail(checked.id, checked.email);
    revalidatePath(ROUTES.ADMIN);
    return { status: "success" as const };
  },
);

export const resetMemberPasswordAction = withResultErrorHandling(
  "resetMemberPassword",
  async (userId: number) => {
    await requireAdmin();

    const id = userIdSchema.parse(userId);

    await requireAdminForUser(id);
    const user = await findUserById(id);

    if (!user) {
      return fail(MEMBER_MESSAGES.NOT_FOUND);
    }

    if (!user.emailKey) {
      return fail(MEMBER_MESSAGES.NO_LOGIN);
    }

    const password = generatePassword();

    await setUserPassword(id, await hashPassword(password));
    revalidatePath(ROUTES.ADMIN);
    return { status: "success" as const, password };
  },
);
