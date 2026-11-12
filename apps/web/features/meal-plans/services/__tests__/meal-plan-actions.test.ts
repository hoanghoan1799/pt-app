import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/fake-call";

// The plan rules (one plan per day, 10 meals, last meal stays, shares total
// 100, auto-solve, copy replaces plans, past days refused, workspace scope)
// live in the API and are covered by apps/api/test/meal-plans.e2e.test.ts.
// These tests cover what the web actions still own: the Zod check, which
// endpoint is called with what, how an answer is shown and the revalidation.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/fake-call");
  const fake = createFakeApi();

  return { callApi: fake.callApi, tryApi: fake.tryApi, fake };
});
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1 })),
}));

const actions =
  await import("@/features/meal-plans/services/meal-plan-actions");
const { fake } = (await import("@/services/api/call")) as unknown as {
  fake: FakeApi;
};

const PAGE = "/admin/users/5/nutrition";

beforeEach(() => {
  fake.reset();
  vi.mocked(revalidatePath).mockClear();
});

const sentOnce = () => {
  expect(fake.requests).toHaveLength(1);
  return fake.requests[0];
};

describe("plan days", () => {
  it("creates the day for the trainee and refreshes their page", async () => {
    const result = await actions.createDayPlanAction({
      userId: 5,
      date: "2026-11-02",
    });

    expect(result).toEqual({ status: "success" });
    expect(sentOnce()).toMatchObject({
      actor: "admin",
      method: "POST",
      path: "/v1/trainees/{userId}/meal-plan-days",
      params: { path: { userId: 5 } },
      body: { date: "2026-11-02" },
    });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE);
  });

  it("shows the API's message when the day already has a plan, without revalidating", async () => {
    fake.refuse(409, "PLAN_EXISTS", "Ngày này đã có plan");

    expect(
      await actions.createDayPlanAction({ userId: 5, date: "2026-11-02" }),
    ).toEqual({ status: "error", message: "Ngày này đã có plan" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses bad input without calling the API", async () => {
    const result = await actions.createDayPlanAction({
      userId: 5,
      date: "not-a-date",
    });

    expect(result).toMatchObject({
      status: "error",
      message: "Vui lòng kiểm tra lại thông tin",
    });
    expect(fake.requests).toHaveLength(0);
  });

  it("deletes a day", async () => {
    await actions.deleteDayPlanAction({ userId: 5, dayId: 8 });

    expect(sentOnce()).toMatchObject({
      method: "DELETE",
      path: "/v1/meal-plan-days/{dayId}",
      params: { path: { dayId: 8 } },
    });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE);
  });
});

describe("meals", () => {
  it("adds a meal", async () => {
    await actions.addMealAction({ userId: 5, dayId: 8 });

    expect(sentOnce()).toMatchObject({
      method: "POST",
      path: "/v1/meal-plan-days/{dayId}/meals",
      params: { path: { dayId: 8 } },
    });
  });

  it("shows the API's message at the 10-meal limit and for the last meal", async () => {
    fake.refuse(409, "TOO_MANY_MEALS", "Một ngày tối đa 10 bữa");
    expect(await actions.addMealAction({ userId: 5, dayId: 8 })).toEqual({
      status: "error",
      message: "Một ngày tối đa 10 bữa",
    });

    fake.refuse(409, "LAST_MEAL", "Plan cần ít nhất một bữa.");
    expect(await actions.removeMealAction({ userId: 5, mealId: 3 })).toEqual({
      status: "error",
      message: "Plan cần ít nhất một bữa.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("removes a meal", async () => {
    await actions.removeMealAction({ userId: 5, mealId: 3 });

    expect(sentOnce()).toMatchObject({
      method: "DELETE",
      path: "/v1/meals/{mealId}",
      params: { path: { mealId: 3 } },
    });
  });

  it("renames a meal with the normalized name", async () => {
    await actions.renameMealAction({
      userId: 5,
      mealId: 3,
      name: "  Bữa   phụ ",
    });

    expect(sentOnce()).toMatchObject({
      method: "PATCH",
      path: "/v1/meals/{mealId}",
      body: { name: "Bữa phụ" },
    });
  });

  it("refuses an empty name without calling the API", async () => {
    expect(
      (await actions.renameMealAction({ userId: 5, mealId: 3, name: " " }))
        .status,
    ).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });

  it("reorders with the list of meal ids", async () => {
    await actions.reorderMealsAction({ userId: 5, dayId: 8, mealIds: [3, 2] });

    expect(sentOnce()).toMatchObject({
      method: "PUT",
      path: "/v1/meal-plan-days/{dayId}/meals/order",
      params: { path: { dayId: 8 } },
      body: { mealIds: [3, 2] },
    });
  });

  it("sets the shares, or null for an equal split", async () => {
    await actions.setMealSharesAction({
      userId: 5,
      dayId: 8,
      shares: [
        { mealId: 3, percent: 60 },
        { mealId: 2, percent: 40 },
      ],
    });
    await actions.setMealSharesAction({ userId: 5, dayId: 8, shares: null });

    expect(fake.requests.map((request) => request.body)).toEqual([
      {
        shares: [
          { mealId: 3, percent: 60 },
          { mealId: 2, percent: 40 },
        ],
      },
      { shares: null },
    ]);
  });

  it("shows the API's message when the shares do not total 100", async () => {
    fake.refuse(400, "SHARES_TOTAL", "Tổng phần trăm các bữa phải bằng 100");

    expect(
      await actions.setMealSharesAction({
        userId: 5,
        dayId: 8,
        shares: [{ mealId: 3, percent: 50 }],
      }),
    ).toEqual({
      status: "error",
      message: "Tổng phần trăm các bữa phải bằng 100",
    });
  });
});

describe("foods in a meal", () => {
  it("adds a food with the grams or leaves them to the API's default", async () => {
    await actions.addItemAction({ userId: 5, mealId: 3, foodId: 11 });
    await actions.addItemAction({
      userId: 5,
      mealId: 3,
      foodId: 12,
      grams: 150.04,
    });

    expect(fake.requests.map((request) => request.body)).toEqual([
      { foodId: 11, grams: undefined },
      { foodId: 12, grams: 150 },
    ]);
    expect(fake.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/meals/{mealId}/items",
      params: { path: { mealId: 3 } },
    });
  });

  it("shows the API's message for a food already in the meal", async () => {
    fake.refuse(409, "FOOD_ALREADY_IN_MEAL", "Món này đã có trong bữa");

    expect(
      await actions.addItemAction({ userId: 5, mealId: 3, foodId: 11 }),
    ).toEqual({ status: "error", message: "Món này đã có trong bữa" });
  });

  it("removes a food and changes its grams", async () => {
    await actions.removeItemAction({ userId: 5, itemId: 21 });
    await actions.updateItemGramsAction({ userId: 5, itemId: 21, grams: 250 });

    expect(fake.requests).toMatchObject([
      {
        method: "DELETE",
        path: "/v1/meal-items/{itemId}",
        params: { path: { itemId: 21 } },
      },
      {
        method: "PATCH",
        path: "/v1/meal-items/{itemId}",
        params: { path: { itemId: 21 } },
        body: { grams: 250 },
      },
    ]);
  });

  it("refuses 0 g without calling the API", async () => {
    expect(
      (
        await actions.updateItemGramsAction({
          userId: 5,
          itemId: 21,
          grams: 0,
        })
      ).status,
    ).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });

  it("auto-solves with the fixed items and shows the 'no target' refusal", async () => {
    await actions.autoSolveMealAction({
      userId: 5,
      mealId: 3,
      fixedItemIds: [21],
    });
    expect(sentOnce()).toMatchObject({
      method: "POST",
      path: "/v1/meals/{mealId}/auto-solve",
      body: { fixedItemIds: [21] },
    });

    fake.refuse(409, "NO_TARGET", "Chưa có mục tiêu dinh dưỡng cho ngày này");
    expect(
      await actions.autoSolveMealAction({
        userId: 5,
        mealId: 3,
        fixedItemIds: [],
      }),
    ).toMatchObject({ status: "error" });
  });
});

describe("copying plans", () => {
  it("copies a day and reports copied and skipped", async () => {
    fake.reply({ copied: 2, skipped: 1 });

    const result = await actions.copyDayAction({
      userId: 5,
      dayId: 8,
      dates: ["2026-11-10", "2026-11-11", "2026-11-12"],
    });

    expect(result).toEqual({ status: "success", copied: 2, skipped: 1 });
    expect(sentOnce()).toMatchObject({
      method: "POST",
      path: "/v1/trainees/{userId}/meal-plan-days/copy",
      params: { path: { userId: 5 } },
      body: { dayId: 8, dates: ["2026-11-10", "2026-11-11", "2026-11-12"] },
    });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE);
  });

  it("shows the API's message for a past target day", async () => {
    fake.refuse(
      400,
      "PAST_TARGET_DAYS",
      "Không thể sao chép sang ngày đã qua.",
    );

    expect(
      await actions.copyDayAction({
        userId: 5,
        dayId: 8,
        dates: ["2020-01-01"],
      }),
    ).toEqual({
      status: "error",
      message: "Không thể sao chép sang ngày đã qua.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an empty date list without calling the API", async () => {
    expect(
      (await actions.copyDayAction({ userId: 5, dayId: 8, dates: [] })).status,
    ).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });

  it("applies last week and reports the counts", async () => {
    fake.reply({ copied: 3, skipped: 0 });

    const result = await actions.applyLastWeekAction({
      userId: 5,
      weekStart: "2026-11-09",
    });

    expect(result).toEqual({ status: "success", copied: 3, skipped: 0 });
    expect(sentOnce()).toMatchObject({
      path: "/v1/trainees/{userId}/meal-plan-days/apply-last-week",
      body: { weekStart: "2026-11-09" },
    });
  });

  it("shows the API's message when last week has no plan", async () => {
    fake.refuse(404, "NO_LAST_WEEK", "Tuần trước chưa có plan nào");

    expect(
      await actions.applyLastWeekAction({ userId: 5, weekStart: "2026-11-09" }),
    ).toEqual({ status: "error", message: "Tuần trước chưa có plan nào" });
  });

  it("reads the plan and log dates of a month for the copy sheet", async () => {
    fake.reply({ planDates: ["2026-11-10"], logDates: ["2026-11-11"] });

    const result = await actions.getCopyMonthInfoAction({
      userId: 5,
      from: "2026-11-01",
      to: "2026-11-30",
    });

    expect(result).toEqual({
      status: "success",
      planDates: ["2026-11-10"],
      logDates: ["2026-11-11"],
    });
    expect(sentOnce()).toMatchObject({
      method: "GET",
      path: "/v1/trainees/{userId}/meal-plan-days/copy-info",
      params: {
        path: { userId: 5 },
        query: { from: "2026-11-01", to: "2026-11-30" },
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a range longer than a month grid", async () => {
    expect(
      (
        await actions.getCopyMonthInfoAction({
          userId: 5,
          from: "2026-01-01",
          to: "2026-12-31",
        })
      ).status,
    ).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });
});
