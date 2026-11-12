"use server";

import { toFieldErrors } from "@pt/contracts";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ADMIN_USERNAME_PATTERN,
  MIN_ADMIN_PASSWORD_LENGTH,
  USER_PASSWORD_MAX,
} from "@/constants/password";
import { ROUTES } from "@/constants/routes";
import { db } from "@/db";
import { admins, users } from "@/db/schema";
import { PT_MESSAGES } from "@/features/pts/constants/messages";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { requireSuperAdmin } from "@/services/auth-guard";
import { hashPassword } from "@/services/password";
import type { FormState } from "@/types/form";
import { createErrorState, createSuccessState } from "@/utils/form";
import { toUsernameKey } from "@/utils/username";

const createPtSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(ADMIN_USERNAME_PATTERN, PT_MESSAGES.USERNAME_INVALID),
  password: z
    .string()
    .min(MIN_ADMIN_PASSWORD_LENGTH, PT_MESSAGES.PASSWORD_TOO_SHORT)
    .max(USER_PASSWORD_MAX, PT_MESSAGES.PASSWORD_TOO_LONG),
});

// Creates a PT account (admins.role = 'pt'). Super admin only.
export const createPtAction = withFormErrorHandling(
  "createPt",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireSuperAdmin();

    const parsed = createPtSchema.safeParse({
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
    });

    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error);

      return createErrorState(Object.values(fieldErrors)[0] ?? "", {
        fieldErrors,
        values: { username: String(formData.get("username") ?? "") },
      });
    }
    const { username, password } = parsed.data;
    const usernameKey = toUsernameKey(username);
    const [existing] = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.usernameKey, usernameKey))
      .limit(1);

    if (existing) {
      return createErrorState(PT_MESSAGES.USERNAME_TAKEN, {
        fieldErrors: { username: PT_MESSAGES.USERNAME_TAKEN },
        values: { username },
      });
    }
    await db.insert(admins).values({
      username,
      usernameKey,
      passwordHash: await hashPassword(password),
      role: "pt",
    });

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
    const updated = await db
      .update(admins)
      .set({ verifiedAt: input.verified ? new Date() : null })
      .where(eq(admins.id, input.adminId))
      .returning({ id: admins.id });

    if (updated.length === 0) {
      return { status: "error" as const, message: PT_MESSAGES.ADMIN_NOT_FOUND };
    }
    revalidatePath(ROUTES.ADMIN_PTS);
    return { status: "success" as const };
  },
);

const assignSchema = z.object({
  userId: z.number().int().positive(),
  ptAdminId: z.number().int().positive().nullable(),
});

// Sets (or clears, with null) the PT responsible for a trainee. Super admin
// only; the target must be a PT account.
export const assignTraineePtAction = withResultErrorHandling(
  "assignTraineePt",
  async (userId: number, ptAdminId: number | null) => {
    await requireSuperAdmin();

    const input = assignSchema.parse({ userId, ptAdminId });

    if (input.ptAdminId !== null) {
      const [pt] = await db
        .select({ id: admins.id })
        .from(admins)
        .where(and(eq(admins.id, input.ptAdminId), eq(admins.role, "pt")))
        .limit(1);

      if (!pt) {
        return { status: "error" as const, message: PT_MESSAGES.PT_NOT_FOUND };
      }
    }
    const updated = await db
      .update(users)
      .set({ ptAdminId: input.ptAdminId })
      .where(eq(users.id, input.userId))
      .returning({ id: users.id });

    if (updated.length === 0) {
      return { status: "error" as const, message: PT_MESSAGES.USER_NOT_FOUND };
    }
    revalidatePath(ROUTES.ADMIN);
    return { status: "success" as const };
  },
);
