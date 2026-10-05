"use server";

import { and, asc, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { exercises, users, workoutDays } from "@/db/schema";
import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { getWeekSchedule } from "@/features/workouts/services/workout-queries";
import {
  copyWeekSchema,
  daySchema,
  exerciseRefSchema,
  exerciseSchema,
} from "@/features/workouts/services/workout-schemas";
import type { MoveDirection } from "@/features/workouts/types/workout";
import { hasDayContent } from "@/features/workouts/utils/schedule";
import {
  addDays,
  formatWeekRange,
  getWeekDates,
  getWeekStart,
} from "@/features/workouts/utils/week";
import { requireAdmin } from "@/services/auth-guard";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
  toFieldErrors,
} from "@/utils/form";
import { getAdminUserPath } from "@/utils/routes";

const revalidateMember = (userId: number) => {
  // "layout" also refreshes the nested preview page.
  revalidatePath(getAdminUserPath(userId), "layout");
};

const ensureDay = async (userId: number, date: string) => {
  const [day] = await db
    .insert(workoutDays)
    .values({ userId, date })
    .onConflictDoUpdate({
      target: [workoutDays.userId, workoutDays.date],
      set: { userId },
    })
    .returning({ id: workoutDays.id });

  return day.id;
};

const findExerciseForUser = async (exerciseId: number, userId: number) => {
  const [row] = await db
    .select({ id: exercises.id, dayId: exercises.dayId })
    .from(exercises)
    .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
    .where(and(eq(exercises.id, exerciseId), eq(workoutDays.userId, userId)))
    .limit(1);

  return row ?? null;
};

export const saveDayAction = async (
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> => {
  await requireAdmin();

  const parsed = daySchema.safeParse(getFormValues(formData));

  if (!parsed.success) {
    return createErrorState(WORKOUT_MESSAGES.INVALID_INPUT, {
      fieldErrors: toFieldErrors(parsed.error),
    });
  }

  const { userId, date, title, note } = parsed.data;

  await db
    .insert(workoutDays)
    .values({ userId, date, title, note })
    .onConflictDoUpdate({
      target: [workoutDays.userId, workoutDays.date],
      set: { title, note },
    });

  revalidateMember(userId);
  return createSuccessState(WORKOUT_MESSAGES.DAY_SAVED);
};

export const saveExerciseAction = async (
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> => {
  await requireAdmin();

  const parsed = exerciseSchema.safeParse(getFormValues(formData));

  if (!parsed.success) {
    return createErrorState(WORKOUT_MESSAGES.INVALID_INPUT, {
      fieldErrors: toFieldErrors(parsed.error),
    });
  }

  const { exerciseId, userId, date, youtubeUrl, ...fields } = parsed.data;
  const values = { ...fields, youtubeId: youtubeUrl };

  if (exerciseId) {
    const existing = await findExerciseForUser(exerciseId, userId);

    if (!existing) {
      return createErrorState(WORKOUT_MESSAGES.EXERCISE_NOT_FOUND);
    }

    await db.update(exercises).set(values).where(eq(exercises.id, exerciseId));
    revalidateMember(userId);
    return createSuccessState(WORKOUT_MESSAGES.EXERCISE_UPDATED);
  }

  const dayId = await ensureDay(userId, date);
  const [{ lastPosition }] = await db
    .select({ lastPosition: max(exercises.position) })
    .from(exercises)
    .where(eq(exercises.dayId, dayId));

  await db
    .insert(exercises)
    .values({ ...values, dayId, position: (lastPosition ?? -1) + 1 });

  revalidateMember(userId);
  return createSuccessState(WORKOUT_MESSAGES.EXERCISE_CREATED);
};

export const deleteExerciseAction = async (
  exerciseId: number,
  userId: number,
) => {
  await requireAdmin();

  const ref = exerciseRefSchema.parse({ exerciseId, userId });
  const existing = await findExerciseForUser(ref.exerciseId, ref.userId);

  if (existing) {
    await db.delete(exercises).where(eq(exercises.id, existing.id));
  }
  revalidateMember(ref.userId);
};

export const moveExerciseAction = async (
  exerciseId: number,
  userId: number,
  direction: MoveDirection,
) => {
  await requireAdmin();

  const ref = exerciseRefSchema.parse({ exerciseId, userId });
  const existing = await findExerciseForUser(ref.exerciseId, ref.userId);

  if (!existing) {
    return;
  }

  const siblings = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.dayId, existing.dayId))
    .orderBy(asc(exercises.position), asc(exercises.id));
  const ids = siblings.map((row) => row.id);
  const index = ids.indexOf(existing.id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (targetIndex < 0 || targetIndex >= ids.length) {
    return;
  }

  [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];

  // Renumbering every sibling also repairs gaps or duplicate positions.
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.update(exercises).set({ position }).where(eq(exercises.id, id));
    }
  });
  revalidateMember(ref.userId);
};

export const copyWeekAction = async (
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> => {
  await requireAdmin();

  const parsed = copyWeekSchema.safeParse(getFormValues(formData));

  if (!parsed.success) {
    return createErrorState(WORKOUT_MESSAGES.INVALID_INPUT, {
      fieldErrors: toFieldErrors(parsed.error),
    });
  }

  const { userId, fromWeek, targetUserId, targetDate } = parsed.data;
  const sourceWeek = getWeekStart(fromWeek);
  const targetWeek = getWeekStart(targetDate);

  if (userId === targetUserId && sourceWeek === targetWeek) {
    return createErrorState(WORKOUT_MESSAGES.COPY_SAME_WEEK);
  }

  const [targetUser] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!targetUser) {
    return createErrorState(WORKOUT_MESSAGES.USER_NOT_FOUND);
  }

  const sourceDays = (await getWeekSchedule(userId, sourceWeek)).filter(
    hasDayContent,
  );

  if (!sourceDays.length) {
    return createErrorState(WORKOUT_MESSAGES.COPY_EMPTY);
  }

  const targetDates = getWeekDates(targetWeek);

  await db.transaction(async (tx) => {
    // The target week is replaced as a whole so the copy matches the source.
    const existingDays = await tx
      .select({ id: workoutDays.id })
      .from(workoutDays)
      .where(
        and(
          eq(workoutDays.userId, targetUserId),
          inArray(workoutDays.date, targetDates),
        ),
      );
    const existingIds = existingDays.map((day) => day.id);

    if (existingIds.length) {
      await tx.delete(exercises).where(inArray(exercises.dayId, existingIds));
      await tx.delete(workoutDays).where(inArray(workoutDays.id, existingIds));
    }

    for (const day of sourceDays) {
      const offset = getWeekDates(sourceWeek).indexOf(day.date);
      const [created] = await tx
        .insert(workoutDays)
        .values({
          userId: targetUserId,
          date: addDays(targetWeek, offset),
          title: day.title,
          note: day.note,
        })
        .returning({ id: workoutDays.id });

      if (day.exercises.length) {
        await tx.insert(exercises).values(
          day.exercises.map((exercise, position) => ({
            dayId: created.id,
            title: exercise.title,
            description: exercise.description,
            sets: exercise.sets,
            reps: exercise.reps,
            youtubeId: exercise.youtubeId,
            position,
          })),
        );
      }
    }
  });

  revalidateMember(userId);
  revalidateMember(targetUserId);

  const target = targetUserId === userId ? "" : ` của ${targetUser.name}`;

  return createSuccessState(
    `Đã sao chép ${sourceDays.length} ngày sang tuần ${formatWeekRange(targetWeek)}${target}`,
  );
};
