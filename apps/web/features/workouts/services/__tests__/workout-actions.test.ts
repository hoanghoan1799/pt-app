import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { ApiError } from "@/services/api/errors";

// The rules (scope, stale links, logged-set protection, copy transactions,
// "not before its day") now live in the API and are covered by
// apps/api/test/workouts-pt.e2e.test.ts and workouts-trainee.e2e.test.ts.
// These tests cover what the web actions still own: input validation before
// the call, which endpoint is called with what, how each API answer is
// translated and when the pages are revalidated.

type Call = { method: string; path: string; init?: Record<string, unknown> };

const state = vi.hoisted(() => ({
  calls: [] as {
    method: string;
    path: string;
    init?: Record<string, unknown>;
  }[],
  answer: { ok: true, data: {} } as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/localize-message", () => ({
  localizeResult: async (value: unknown) => value,
  getActiveLocale: async () => "vi",
  getErrorsTranslator: async () => (key: string) => key,
}));
vi.mock("@/services/api/call", () => {
  const run = async (run: (api: unknown) => Promise<unknown>) => {
    const record =
      (method: string) =>
      async (path: string, init?: Record<string, unknown>) => {
        state.calls.push({ method, path, init });
        return {};
      };

    await run({
      GET: record("GET"),
      PUT: record("PUT"),
      POST: record("POST"),
      DELETE: record("DELETE"),
    });
    return state.answer as { ok: boolean; data?: unknown; error?: ApiError };
  };

  return {
    tryApi: vi.fn(async (_actor: string, call: never) => run(call)),
    callApi: vi.fn(async (_actor: string, call: never) => {
      const outcome = await run(call);

      if (!outcome.ok) {
        throw outcome.error;
      }
      return outcome.data;
    }),
  };
});
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1 })),
  requireUser: vi.fn(async () => ({ id: 9 })),
}));

const { revalidatePath } = await import("next/cache");
const actions = await import("@/features/workouts/services/workout-actions");
const sets = await import("@/features/workouts/services/set-actions");
const completion =
  await import("@/features/workouts/services/completion-actions");

const refuse = (status: number, code: string, message: string) => {
  state.answer = { ok: false, error: new ApiError({ status, code, message }) };
};

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
};

const sent = (): Call[] => state.calls;

const EXERCISE = {
  userId: "5",
  date: "2026-11-02",
  title: "Bench",
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  reps: "10",
  sets: "3",
};

beforeEach(() => {
  state.calls = [];
  state.answer = { ok: true, data: {} };
  vi.mocked(revalidatePath).mockClear();
});

describe("saveDayAction", () => {
  it("validates before calling the API", async () => {
    const result = await actions.saveDayAction(
      INITIAL_FORM_STATE,
      form({ userId: "5", date: "nope" }),
    );

    expect(result.status).toBe("error");
    expect(sent()).toEqual([]);
  });

  it("puts the day and revalidates the member's pages", async () => {
    const result = await actions.saveDayAction(
      INITIAL_FORM_STATE,
      form({ userId: "5", date: "2026-11-02", title: "Push" }),
    );

    expect(result).toMatchObject({ message: WORKOUT_MESSAGES.DAY_SAVED });
    expect(sent()[0]).toMatchObject({
      method: "PUT",
      path: "/v1/trainees/{userId}/workout-days/{date}",
      init: {
        params: { path: { userId: "5", date: "2026-11-02" } },
        body: { title: "Push", note: "" },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/5", "layout");
  });

  it("shows the API's message when the trainee is refused", async () => {
    refuse(404, "TRAINEE_NOT_FOUND", "Không tìm thấy user");

    const result = await actions.saveDayAction(
      INITIAL_FORM_STATE,
      form({ userId: "5", date: "2026-11-02" }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Không tìm thấy user",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveExerciseAction", () => {
  it("creates at the end of the day, sending the video as its id", async () => {
    const result = await actions.saveExerciseAction(
      INITIAL_FORM_STATE,
      form(EXERCISE),
    );

    expect(result).toMatchObject({ message: WORKOUT_MESSAGES.EXERCISE_CREATED });
    expect(sent()[0]).toMatchObject({
      method: "POST",
      path: "/v1/trainees/{userId}/workout-days/{date}/exercises",
      init: {
        body: {
          title: "Bench",
          youtubeUrl: "dQw4w9WgXcQ",
          sets: 3,
          confirmResetSets: false,
        },
      },
    });
  });

  it("updates an existing exercise and passes the reset confirmation on", async () => {
    const result = await actions.saveExerciseAction(
      INITIAL_FORM_STATE,
      form({ ...EXERCISE, exerciseId: "8", confirmResetSets: "true" }),
    );

    expect(result).toMatchObject({ message: WORKOUT_MESSAGES.EXERCISE_UPDATED });
    expect(sent()[0]).toMatchObject({
      method: "PUT",
      path: "/v1/trainees/{userId}/exercises/{exerciseId}",
      init: {
        params: { path: { userId: "5", exerciseId: "8" } },
        body: { confirmResetSets: true },
      },
    });
  });

  it("asks for confirmation when a new link would delete sets, and refreshes the stale page", async () => {
    refuse(
      409,
      "LINK_CHANGE_NEEDS_CONFIRM",
      WORKOUT_MESSAGES.LINK_CHANGE_NEEDS_CONFIRM,
    );

    const result = await actions.saveExerciseAction(
      INITIAL_FORM_STATE,
      form({ ...EXERCISE, exerciseId: "8" }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: WORKOUT_MESSAGES.LINK_CHANGE_NEEDS_CONFIRM,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/5", "layout");
  });
});

describe("deleteExerciseAction", () => {
  it("deletes without the confirmation flag by default", async () => {
    expect(await actions.deleteExerciseAction(8, 5)).toEqual({
      status: "success",
    });
    expect(sent()[0]).toMatchObject({
      method: "DELETE",
      init: { params: { query: { confirmDeleteSets: "false" } } },
    });
  });

  it("answers needs-confirm when sets would go, and refreshes the page", async () => {
    refuse(409, "EXERCISE_HAS_SETS", "x");

    expect(await actions.deleteExerciseAction(8, 5)).toEqual({
      status: "needs-confirm",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/5", "layout");
  });

  it("sends the confirmation after the PT agreed", async () => {
    await actions.deleteExerciseAction(8, 5, { confirmDeleteSets: true });

    expect(sent()[0].init).toMatchObject({
      params: { query: { confirmDeleteSets: "true" } },
    });
  });
});

describe("moveExerciseAction", () => {
  it("posts the direction", async () => {
    await actions.moveExerciseAction(8, 5, "up");

    expect(sent()[0]).toMatchObject({
      method: "POST",
      path: "/v1/trainees/{userId}/exercises/{exerciseId}/move",
      init: { body: { direction: "up" } },
    });
  });
});

describe("copyWeekAction", () => {
  const copy = (targetUserId: string) =>
    actions.copyWeekAction(
      INITIAL_FORM_STATE,
      form({
        userId: "5",
        fromWeek: "2026-11-02",
        targetUserId,
        targetDate: "2026-11-09",
      }),
    );

  it("revalidates both members and reports the copied days", async () => {
    state.answer = {
      ok: true,
      data: { copiedDays: 3, targetUserId: 5, targetWeekStart: "2026-11-09" },
    };

    const result = await copy("5");

    expect(result).toMatchObject({ status: "success", message: "toasts.weekCopied" });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("shows the API's refusal (target week already logged)", async () => {
    refuse(
      409,
      "COPY_TARGET_HAS_SETS",
      WORKOUT_MESSAGES.COPY_TARGET_HAS_SETS,
    );

    expect(await copy("6")).toMatchObject({
      status: "error",
      message: WORKOUT_MESSAGES.COPY_TARGET_HAS_SETS,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("copyDayToDatesAction", () => {
  it("rejects bad input before calling the API", async () => {
    expect(
      await actions.copyDayToDatesAction({
        userId: 5,
        date: "2026-11-02",
        dates: [],
      }),
    ).toEqual({ status: "error", message: WORKOUT_MESSAGES.INVALID_INPUT });
    expect(sent()).toEqual([]);
  });

  it("returns how many days were written", async () => {
    state.answer = { ok: true, data: { copied: 2 } };

    expect(
      await actions.copyDayToDatesAction({
        userId: 5,
        date: "2026-11-02",
        dates: ["2026-11-10", "2026-11-11"],
      }),
    ).toEqual({ status: "success", copied: 2 });
  });

  it("refreshes the page when a target day is locked by logged sets", async () => {
    refuse(
      409,
      "COPY_DAY_TARGET_HAS_SETS",
      WORKOUT_MESSAGES.COPY_DAY_TARGET_HAS_SETS,
    );

    expect(
      await actions.copyDayToDatesAction({
        userId: 5,
        date: "2026-11-02",
        dates: ["2026-11-10"],
      }),
    ).toEqual({
      status: "error",
      message: WORKOUT_MESSAGES.COPY_DAY_TARGET_HAS_SETS,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/5", "layout");
  });
});

describe("getWorkoutCopyMonthInfoAction", () => {
  it("returns the plan and log dates", async () => {
    state.answer = {
      ok: true,
      data: { planDates: ["2026-11-02"], logDates: ["2026-11-03"] },
    };

    expect(
      await actions.getWorkoutCopyMonthInfoAction({
        userId: 5,
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    ).toEqual({
      status: "success",
      planDates: ["2026-11-02"],
      logDates: ["2026-11-03"],
    });
  });
});

describe("saveExerciseSetsAction", () => {
  it("validates the sets before calling the API", async () => {
    expect(
      await sets.saveExerciseSetsAction(3, [{ weightKg: 40.25, reps: 10 }]),
    ).toMatchObject({
      status: "error",
      message: WORKOUT_MESSAGES.SET_WEIGHT_STEP,
    });
    expect(sent()).toEqual([]);
  });

  it("returns the personal-best flag and revalidates the trainee's and PT's pages", async () => {
    state.answer = { ok: true, data: { personalBest: true, completedAt: "x" } };

    expect(
      await sets.saveExerciseSetsAction(3, [{ weightKg: 40, reps: 10 }]),
    ).toEqual({ status: "success", personalBest: true });
    expect(sent()[0]).toMatchObject({
      method: "PUT",
      path: "/v1/me/exercises/{exerciseId}/sets",
      init: {
        params: { path: { exerciseId: "3" } },
        body: { sets: [{ weightKg: 40, reps: 10 }] },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/workouts");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/9", "layout");
  });

  it("refreshes /workouts when the PT deleted the exercise meanwhile", async () => {
    refuse(404, "EXERCISE_NOT_FOUND", WORKOUT_MESSAGES.EXERCISE_NOT_FOUND);

    expect(
      await sets.saveExerciseSetsAction(3, [{ weightKg: 40, reps: 10 }]),
    ).toEqual({
      status: "error",
      message: WORKOUT_MESSAGES.EXERCISE_NOT_FOUND,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/workouts");
  });
});

describe("setExerciseCompletionAction", () => {
  it("sets the state, not a toggle", async () => {
    expect(await completion.setExerciseCompletionAction(3, true)).toEqual({
      status: "success",
    });
    expect(sent()[0]).toMatchObject({
      method: "PUT",
      init: { body: { completed: true } },
    });
  });

  it("shows 'too early' without revalidating", async () => {
    refuse(409, "COMPLETION_TOO_EARLY", WORKOUT_MESSAGES.COMPLETION_TOO_EARLY);

    expect(await completion.setExerciseCompletionAction(3, true)).toEqual({
      status: "error",
      message: WORKOUT_MESSAGES.COMPLETION_TOO_EARLY,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
