import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import type { FakeApi } from "@/services/api/fake-call";

// The log rules (own plan only, no future day, active library food, 30 logs
// per meal, numbers stored with the log, "Đạt" freezes the planned items, a
// note-only mark, removing an empty mark) live in the API and are covered by
// apps/api/test/meal-logs.e2e.test.ts. These tests cover what the web actions
// still own: the Zod check, which endpoint is called with what, how an answer
// is shown and the revalidation.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/fake-call");
  const fake = createFakeApi();

  return { callApi: fake.callApi, tryApi: fake.tryApi, fake };
});
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => ({ id: 9 })),
}));

const logActions =
  await import("@/features/meal-plans/services/meal-log-actions");
const { saveMealPreferencesAction } =
  await import("@/features/meal-plans/services/meal-preferences-actions");
const { fake } = (await import("@/services/api/call")) as unknown as {
  fake: FakeApi;
};

const revalidated = () =>
  vi.mocked(revalidatePath).mock.calls.map(([path]) => path);

beforeEach(() => {
  fake.reset();
  vi.mocked(revalidatePath).mockClear();
});

describe("addMealLogAction", () => {
  it("logs a library food in the meal and refreshes the trainee and PT pages", async () => {
    const result = await logActions.addMealLogAction({
      kind: "library",
      mealId: 3,
      foodId: 11,
      grams: 200,
    });

    expect(result).toEqual({ status: "success" });
    expect(fake.requests).toEqual([
      expect.objectContaining({
        actor: "user",
        method: "POST",
        path: "/v1/me/meals/{mealId}/logs",
        params: { path: { mealId: 3 } },
        body: { kind: "library", foodId: 11, grams: 200 },
      }),
    ]);
    expect(revalidated()).toEqual([
      "/nutrition",
      "/summary",
      "/admin/users/9/nutrition",
      "/admin",
    ]);
  });

  it("logs a free food with the numbers the trainee typed", async () => {
    await logActions.addMealLogAction({
      kind: "free",
      mealId: 3,
      customName: "  Bánh   quy ",
      grams: 30,
      kcal: 150,
      protein: undefined,
    } as never);

    expect(fake.requests[0].body).toEqual({
      kind: "free",
      customName: "Bánh quy",
      grams: 30,
      kcal: 150,
      protein: null,
      carbs: null,
      fat: null,
    });
  });

  it("refuses 0 g of a library food without calling the API", async () => {
    const result = await logActions.addMealLogAction({
      kind: "library",
      mealId: 3,
      foodId: 11,
      grams: 0,
    });

    expect(result.status).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });

  it("shows the API's message for a future day and the 30-log limit", async () => {
    fake.refuse(409, "FUTURE_DAY", "Chưa tới ngày này");
    expect(
      await logActions.addMealLogAction({
        kind: "library",
        mealId: 3,
        foodId: 11,
        grams: 100,
      }),
    ).toEqual({ status: "error", message: "Chưa tới ngày này" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateMealLogAction", () => {
  it("PATCHes the log without its id in the body", async () => {
    await logActions.updateMealLogAction({ logId: 40, grams: 250 });

    expect(fake.requests[0]).toMatchObject({
      method: "PATCH",
      path: "/v1/me/meal-logs/{id}",
      params: { path: { id: 40 } },
      body: { grams: 250, kcal: null, protein: null, carbs: null, fat: null },
    });
  });

  it("shows the API's message when the food left the library", async () => {
    fake.refuse(
      409,
      "FOOD_MISSING",
      "Món này không còn trong thư viện, hãy xóa rồi ghi lại",
    );

    expect(
      await logActions.updateMealLogAction({ logId: 40, grams: 250 }),
    ).toMatchObject({ status: "error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removeMealLogAction", () => {
  it("DELETEs the log", async () => {
    expect(await logActions.removeMealLogAction({ logId: 40 })).toEqual({
      status: "success",
    });
    expect(fake.requests[0]).toMatchObject({
      method: "DELETE",
      path: "/v1/me/meal-logs/{id}",
      params: { path: { id: 40 } },
    });
  });

  it("says the log is gone when the API answers 404", async () => {
    fake.refuse(404, "LOG_NOT_FOUND", "Món này không còn trong nhật ký");

    expect(await logActions.removeMealLogAction({ logId: 40 })).toEqual({
      status: "error",
      message: "Món này không còn trong nhật ký",
    });
  });
});

describe("setMealMarkAction", () => {
  it("PUTs the mark with the trimmed note", async () => {
    await logActions.setMealMarkAction({
      mealId: 3,
      achieved: true,
      note: "  thiếu cơm  ",
    });

    expect(fake.requests[0]).toMatchObject({
      method: "PUT",
      path: "/v1/me/meals/{mealId}/mark",
      params: { path: { mealId: 3 } },
      body: { achieved: true, note: "thiếu cơm" },
    });
    expect(revalidated()).toContain("/summary");
  });

  it("refuses a note over 300 characters without calling the API", async () => {
    const result = await logActions.setMealMarkAction({
      mealId: 3,
      achieved: false,
      note: "x".repeat(301),
    });

    expect(result.status).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("saveMealPreferencesAction", () => {
  const toFormData = (fields: Record<string, string>) => {
    const formData = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    return formData;
  };

  it("PUTs the request to the PT and refreshes both pages", async () => {
    const result = await saveMealPreferencesAction(
      INITIAL_FORM_STATE,
      toFormData({ mealCount: "4", foodNote: "Không ăn hành" }),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Đã lưu yêu cầu của bạn",
    });
    expect(fake.requests[0]).toMatchObject({
      actor: "user",
      method: "PUT",
      path: "/v1/me/meal-preferences",
      body: { mealCount: "4", foodNote: "Không ăn hành" },
    });
    expect(revalidated()).toEqual(["/nutrition", "/admin/users/9/nutrition"]);
  });

  it("refuses 7 meals before calling the API and keeps what was typed", async () => {
    const result = await saveMealPreferencesAction(
      INITIAL_FORM_STATE,
      toFormData({ mealCount: "7", foodNote: "x" }),
    );

    expect(result).toMatchObject({
      status: "error",
      values: { mealCount: "7", foodNote: "x" },
    });
    expect(result.fieldErrors?.mealCount).toBeTruthy();
    expect(fake.requests).toHaveLength(0);
  });
});
