"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { db } from "@/db";
import {
  exerciseCompletions,
  exercises,
  users,
  workoutDays,
} from "@/db/schema";
import {
  MEMBER_MESSAGES,
  MEMBER_NAME_MAX_LENGTH,
} from "@/features/members/constants/messages";
import { requireAdmin } from "@/services/auth-guard";
import { findUserByName } from "@/services/users";
import type { FormState } from "@/types/form";
import { createErrorState, createSuccessState } from "@/utils/form";
import { normalizeName, toNameKey } from "@/utils/name";

const nameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(1, MEMBER_MESSAGES.NAME_REQUIRED)
      .max(MEMBER_NAME_MAX_LENGTH, MEMBER_MESSAGES.NAME_TOO_LONG),
  );

export const createMemberAction = async (
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> => {
  await requireAdmin();

  const rawName = String(formData.get("name") ?? "");
  const parsed = nameSchema.safeParse(rawName);

  if (!parsed.success) {
    return createErrorState(parsed.error.issues[0].message, {
      values: { name: rawName },
    });
  }

  const name = parsed.data;

  if (await findUserByName(name)) {
    return createErrorState(MEMBER_MESSAGES.NAME_TAKEN, {
      values: { name: rawName },
    });
  }

  await db.insert(users).values({ name, nameKey: toNameKey(name) });
  revalidatePath(ROUTES.ADMIN);
  return createSuccessState(`Đã thêm ${name}`);
};

export const deleteMemberAction = async (userId: number) => {
  await requireAdmin();

  const id = z.number().int().positive().parse(userId);
  const days = await db
    .select({ id: workoutDays.id })
    .from(workoutDays)
    .where(eq(workoutDays.userId, id));
  const dayIds = days.map((day) => day.id);

  await db.transaction(async (tx) => {
    await tx
      .delete(exerciseCompletions)
      .where(eq(exerciseCompletions.userId, id));

    if (dayIds.length) {
      await tx.delete(exercises).where(inArray(exercises.dayId, dayIds));
      await tx.delete(workoutDays).where(inArray(workoutDays.id, dayIds));
    }
    await tx.delete(users).where(eq(users.id, id));
  });

  revalidatePath(ROUTES.ADMIN);
  redirect(ROUTES.ADMIN);
};
