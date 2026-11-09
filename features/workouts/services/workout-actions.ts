"use server";

import { and, asc, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  exerciseCompletions,
  exercises,
  exerciseSets,
  users,
  workoutDays,
} from "@/db/schema";
import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { getWeekSchedule } from "@/features/workouts/services/workout-queries";
import {
  copyWeekSchema,
  daySchema,
  deleteExerciseSchema,
  exerciseRefSchema,
  exerciseSchema,
} from "@/features/workouts/services/workout-schemas";
import type { MoveDirection } from "@/features/workouts/types/workout";
import { hasDayContent } from "@/features/workouts/utils/schedule";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { requireAdminForUser } from "@/services/admin-access";
import { requireAdmin } from "@/services/auth-guard";
import {
  getActiveLocale,
  getErrorsTranslator,
} from "@/services/localize-message";
import type { DeleteExerciseResult } from "@/types/error";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
  toFieldErrors,
} from "@/utils/form";
import { getAdminUserPath } from "@/utils/routes";
import {
  addDays,
  formatWeekRange,
  getWeekDates,
  getWeekStart,
} from "@/utils/week";

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

type SelectClient = Pick<typeof db, "select">;

// Logged sets are the trainee's history, so a copy must never overwrite them.
const targetWeekHasSets = async (
  client: SelectClient,
  userId: number,
  dates: string[],
) => {
  const [row] = await client
    .select({ id: exerciseSets.id })
    .from(exerciseSets)
    .innerJoin(exercises, eq(exercises.id, exerciseSets.exerciseId))
    .innerJoin(workoutDays, eq(workoutDays.id, exercises.dayId))
    .where(
      and(eq(workoutDays.userId, userId), inArray(workoutDays.date, dates)),
    )
    .limit(1);

  return Boolean(row);
};

export const saveDayAction = withFormErrorHandling(
  "saveDay",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const parsed = daySchema.safeParse(getFormValues(formData));

    if (!parsed.success) {
      return createErrorState(WORKOUT_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { userId, date, title, note } = parsed.data;

    await requireAdminForUser(userId);

    await db
      .insert(workoutDays)
      .values({ userId, date, title, note })
      .onConflictDoUpdate({
        target: [workoutDays.userId, workoutDays.date],
        set: { title, note },
      });

    revalidateMember(userId);
    return createSuccessState(WORKOUT_MESSAGES.DAY_SAVED);
  },
);

export const saveExerciseAction = withFormErrorHandling(
  "saveExercise",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const parsed = exerciseSchema.safeParse(getFormValues(formData));

    if (!parsed.success) {
      return createErrorState(WORKOUT_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const {
      exerciseId,
      userId,
      date,
      youtubeUrl,
      confirmResetSets,
      ...fields
    } = parsed.data;

    await requireAdminForUser(userId);

    const values = { ...fields, youtubeId: youtubeUrl };

    if (exerciseId) {
      const existing = await findExerciseForUser(exerciseId, userId);

      if (!existing) {
        return createErrorState(WORKOUT_MESSAGES.EXERCISE_NOT_FOUND);
      }

      // The stored link and the sets are read inside the write transaction, so
      // a set logged meanwhile can't slip past the check (the client's idea of
      // "has sets" is never trusted).
      const result = await db.transaction(async (tx) => {
        const [stored] = await tx
          .select({ youtubeId: exercises.youtubeId })
          .from(exercises)
          .where(eq(exercises.id, exerciseId))
          .limit(1);

        if (!stored) {
          return "not-found" as const;
        }

        if (stored.youtubeId !== values.youtubeId) {
          const [loggedSet] = await tx
            .select({ id: exerciseSets.id })
            .from(exerciseSets)
            .where(eq(exerciseSets.exerciseId, exerciseId))
            .limit(1);

          if (loggedSet) {
            if (!confirmResetSets) {
              return "needs-confirm" as const;
            }
            // OQ1: a new link starts a new history. The completion is kept.
            await tx
              .delete(exerciseSets)
              .where(eq(exerciseSets.exerciseId, exerciseId));
          }
        }

        await tx
          .update(exercises)
          .set(values)
          .where(eq(exercises.id, exerciseId));
        return "updated" as const;
      });

      // A refusal means the page was stale (deleted exercise, or sets logged
      // after it loaded): refresh it so the next save gets the right prompt.
      if (result === "not-found") {
        revalidateMember(userId);
        return createErrorState(WORKOUT_MESSAGES.EXERCISE_NOT_FOUND);
      }
      if (result === "needs-confirm") {
        revalidateMember(userId);
        return createErrorState(WORKOUT_MESSAGES.LINK_CHANGE_NEEDS_CONFIRM);
      }

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
  },
);

export const deleteExerciseAction = withResultErrorHandling(
  "deleteExercise",
  async (
    exerciseId: number,
    userId: number,
    options: { confirmDeleteSets?: boolean } = {},
  ): Promise<DeleteExerciseResult> => {
    await requireAdmin();

    const { confirmDeleteSets, ...ref } = deleteExerciseSchema.parse({
      exerciseId,
      userId,
      confirmDeleteSets: options.confirmDeleteSets,
    });

    await requireAdminForUser(ref.userId);
    const existing = await findExerciseForUser(ref.exerciseId, ref.userId);

    if (existing) {
      // The sets are counted inside the write transaction, so a set logged
      // after the PT's page loaded can't be wiped without the warning.
      const result = await db.transaction(async (tx) => {
        const [loggedSet] = await tx
          .select({ id: exerciseSets.id })
          .from(exerciseSets)
          .where(eq(exerciseSets.exerciseId, existing.id))
          .limit(1);

        if (loggedSet && !confirmDeleteSets) {
          return "needs-confirm" as const;
        }

        // Children first: foreign keys are not enforced (D10).
        await tx
          .delete(exerciseSets)
          .where(eq(exerciseSets.exerciseId, existing.id));
        await tx
          .delete(exerciseCompletions)
          .where(eq(exerciseCompletions.exerciseId, existing.id));
        await tx.delete(exercises).where(eq(exercises.id, existing.id));
        return "deleted" as const;
      });

      if (result === "needs-confirm") {
        // The page was stale: refresh it so `hasSets` is current.
        revalidateMember(ref.userId);
        return { status: "needs-confirm" };
      }
    }
    revalidateMember(ref.userId);
    return { status: "success" };
  },
);

export const moveExerciseAction = withResultErrorHandling(
  "moveExercise",
  async (exerciseId: number, userId: number, direction: MoveDirection) => {
    await requireAdmin();

    const ref = exerciseRefSchema.parse({ exerciseId, userId });

    await requireAdminForUser(ref.userId);
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
        await tx
          .update(exercises)
          .set({ position })
          .where(eq(exercises.id, id));
      }
    });
    revalidateMember(ref.userId);
  },
);

export const copyWeekAction = withFormErrorHandling(
  "copyWeek",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const parsed = copyWeekSchema.safeParse(getFormValues(formData));

    if (!parsed.success) {
      return createErrorState(WORKOUT_MESSAGES.INVALID_INPUT, {
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { userId, fromWeek, targetUserId, targetDate } = parsed.data;

    await requireAdminForUser(userId);
    await requireAdminForUser(targetUserId);
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

    const copied = await db.transaction(async (tx) => {
      // Checked inside the write transaction (libSQL opens it with BEGIN
      // IMMEDIATE), so no set can be saved between the check and the delete.
      if (await targetWeekHasSets(tx, targetUserId, targetDates)) {
        return false;
      }

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
        const replacedExercises = tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(inArray(exercises.dayId, existingIds));

        await tx
          .delete(exerciseSets)
          .where(inArray(exerciseSets.exerciseId, replacedExercises));
        await tx
          .delete(exerciseCompletions)
          .where(inArray(exerciseCompletions.exerciseId, replacedExercises));
        await tx.delete(exercises).where(inArray(exercises.dayId, existingIds));
        await tx
          .delete(workoutDays)
          .where(inArray(workoutDays.id, existingIds));
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

      return true;
    });

    if (!copied) {
      return createErrorState(WORKOUT_MESSAGES.COPY_TARGET_HAS_SETS);
    }

    revalidateMember(userId);
    revalidateMember(targetUserId);

    const t = await getErrorsTranslator();
    const values = {
      count: sourceDays.length,
      range: formatWeekRange(targetWeek, await getActiveLocale()),
    };

    return createSuccessState(
      targetUserId === userId
        ? t("toasts.weekCopied", values)
        : t("toasts.weekCopiedTo", { ...values, name: targetUser.name }),
    );
  },
);
