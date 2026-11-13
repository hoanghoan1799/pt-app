"use server";

import {
  copyDaySchema,
  copyMonthInfoSchema,
  copyWeekSchema,
  daySchema,
  deleteExerciseSchema,
  exerciseRefSchema,
  exerciseSchema,
} from "@pt/contracts";
import { toFieldErrors } from "@pt/contracts";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import type { MoveDirection } from "@/features/workouts/types/workout";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { callApi, tryApi } from "@/services/api/call";
import { apiErrorToFormState } from "@/services/api/errors";
import { requireAdmin } from "@/services/auth-guard";
import {
  getActiveLocale,
  getErrorsTranslator,
} from "@/services/localize-message";
import type { ActionErrorResult, DeleteExerciseResult } from "@/types/error";
import type { FormState } from "@/types/form";
import {
  createErrorState,
  createSuccessState,
  getFormValues,
} from "@/utils/form";
import { getAdminUserPath } from "@/utils/routes";
import { formatWeekRange } from "@/utils/week";

const revalidateMember = (userId: number) => {
  // "layout" also refreshes the nested preview page.
  revalidatePath(getAdminUserPath(userId), "layout");
};

// API codes after which the PT's page was stale: refresh it so the next try
// starts from what is stored.
const STALE_PAGE_CODES = new Set([
  "EXERCISE_NOT_FOUND",
  "LINK_CHANGE_NEEDS_CONFIRM",
  "EXERCISE_HAS_SETS",
  "COPY_DAY_TARGET_HAS_SETS",
]);

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
    const outcome = await tryApi("admin", (api) =>
      api.PUT("/v1/trainees/{userId}/workout-days/{date}", {
        params: { path: { userId: String(userId), date: date } },
        body: { title, note },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error, {
        values: getFormValues(formData),
      });
    }

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
    // `youtubeUrl` is already the 11-character id here; the API accepts it.
    const body = { ...fields, youtubeUrl, confirmResetSets };
    const outcome = exerciseId
      ? await tryApi("admin", (api) =>
          api.PUT("/v1/trainees/{userId}/exercises/{exerciseId}", {
            params: { path: { userId: String(userId), exerciseId: String(exerciseId) } },
            body,
          }),
        )
      : await tryApi("admin", (api) =>
          api.POST("/v1/trainees/{userId}/workout-days/{date}/exercises", {
            params: { path: { userId: String(userId), date: date } },
            body,
          }),
        );

    if (!outcome.ok) {
      if (STALE_PAGE_CODES.has(outcome.error.code)) {
        revalidateMember(userId);
      }
      return apiErrorToFormState(outcome.error, {
        values: getFormValues(formData),
      });
    }

    revalidateMember(userId);
    return createSuccessState(
      exerciseId
        ? WORKOUT_MESSAGES.EXERCISE_UPDATED
        : WORKOUT_MESSAGES.EXERCISE_CREATED,
    );
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
    const outcome = await tryApi("admin", (api) =>
      api.DELETE("/v1/trainees/{userId}/exercises/{exerciseId}", {
        params: {
          path: { userId: String(ref.userId), exerciseId: String(ref.exerciseId) },
          query: { confirmDeleteSets: confirmDeleteSets ? "true" : "false" },
        },
      }),
    );

    if (!outcome.ok && outcome.error.code === "EXERCISE_HAS_SETS") {
      // The page was stale: refresh it so `hasSets` is current.
      revalidateMember(ref.userId);
      return { status: "needs-confirm" };
    }
    if (!outcome.ok) {
      throw outcome.error;
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

    await callApi("admin", (api) =>
      api.POST("/v1/trainees/{userId}/exercises/{exerciseId}/move", {
        params: { path: { userId: String(ref.userId), exerciseId: String(ref.exerciseId) } },
        body: { direction },
      }),
    );
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
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/trainees/{userId}/workout-days/copy-week", {
        params: { path: { userId: String(userId) } },
        body: { fromWeek, targetUserId, targetDate },
      }),
    );

    if (!outcome.ok) {
      return apiErrorToFormState(outcome.error);
    }

    revalidateMember(userId);
    revalidateMember(targetUserId);

    const t = await getErrorsTranslator();
    const values = {
      count: outcome.data.copiedDays,
      range: formatWeekRange(
        outcome.data.targetWeekStart,
        await getActiveLocale(),
      ),
    };

    if (targetUserId === userId) {
      return createSuccessState(t("toasts.weekCopied", values));
    }

    const target = await callApi("admin", (api) =>
      api.GET("/v1/trainees/{userId}", {
        params: { path: { userId: targetUserId } },
      }),
    );

    return createSuccessState(
      t("toasts.weekCopiedTo", { ...values, name: target.name }),
    );
  },
);

export type CopyDayResult =
  { status: "success"; copied: number } | ActionErrorResult;

export type WorkoutCopyMonthInfoResult =
  | { status: "success"; planDates: string[]; logDates: string[] }
  | ActionErrorResult;

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

// Copies one day (title, note, exercises in order) to the chosen dates of the
// same trainee. A target day that already has a workout is replaced; a target
// with logged sets refuses the whole request. Completions and sets are not
// copied.
export const copyDayToDatesAction = withResultErrorHandling(
  "copyDayToDates",
  async (input: z.input<typeof copyDaySchema>): Promise<CopyDayResult> => {
    await requireAdmin();

    const parsed = copyDaySchema.safeParse(input);

    if (!parsed.success) {
      return fail(WORKOUT_MESSAGES.INVALID_INPUT);
    }

    const { userId, date, dates } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/trainees/{userId}/workout-days/copy-day", {
        params: { path: { userId: String(userId) } },
        body: { date, dates },
      }),
    );

    if (!outcome.ok) {
      if (STALE_PAGE_CODES.has(outcome.error.code)) {
        revalidateMember(userId);
      }
      return fail(outcome.error.message);
    }

    revalidateMember(userId);
    return { status: "success", copied: outcome.data.copied };
  },
);

// The copy sheet's month picker marks days that already have a workout and
// locks the ones with logged sets, beyond the weeks the page loaded.
export const getWorkoutCopyMonthInfoAction = withResultErrorHandling(
  "getWorkoutCopyMonthInfo",
  async (
    input: z.input<typeof copyMonthInfoSchema>,
  ): Promise<WorkoutCopyMonthInfoResult> => {
    await requireAdmin();

    const parsed = copyMonthInfoSchema.safeParse(input);

    if (!parsed.success) {
      return fail(WORKOUT_MESSAGES.INVALID_INPUT);
    }

    const { userId, from, to } = parsed.data;
    const { planDates, logDates } = await callApi("admin", (api) =>
      api.GET("/v1/trainees/{userId}/workout-days/copy-info", {
        params: { path: { userId: String(userId) }, query: { from, to } },
      }),
    );

    return { status: "success", planDates, logDates };
  },
);
