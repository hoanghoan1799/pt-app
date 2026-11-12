import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FoodEntry } from "../src/database/entities/food-entry.entity.js";
import { MealLog } from "../src/database/entities/meal-log.entity.js";
import { MealMark } from "../src/database/entities/meal-mark.entity.js";
import { MealMarkItem } from "../src/database/entities/meal-mark-item.entity.js";
import { MealPlanDay } from "../src/database/entities/meal-plan-day.entity.js";
import { NutritionTarget } from "../src/database/entities/nutrition-target.entity.js";
import {
  bootNutritionWorld,
  FOODS,
  type NutritionWorld,
  seedFood,
  TODAY,
} from "./support/nutrition.js";

let w: NutritionWorld;
let chicken: number;
let rice: number;
let archived: number;

beforeAll(async () => {
  w = await bootNutritionWorld();
  chicken = await seedFood(w.ds, FOODS.chicken);
  rice = await seedFood(w.ds, FOODS.rice);
  archived = await seedFood(w.ds, { ...FOODS.oil, archived: true });
});

afterAll(async () => {
  await w.close();
});

beforeEach(async () => {
  await w.ds.getRepository(MealPlanDay).createQueryBuilder().delete().execute();
  await w.ds.getRepository(NutritionTarget).createQueryBuilder().delete().execute();
  await w.ds.getRepository(FoodEntry).createQueryBuilder().delete().execute();
  await w.ds.query(`UPDATE foods SET protein = $2, carbs = $3, fat = $4 WHERE id = $1`, [chicken, 31, 0, 3.6]);
});

type Meal = { id: number; items: { id: number; foodId: number; grams: number }[] };
type Day = { id: number; date: string; meals: Meal[] };

const ptPost = async (path: string, body?: object) => w.call("post", path, w.tokens.ptA, body);

const createDay = async (date: string, userId = w.ids.mine, token = w.tokens.ptA) => {
  const response = await w.call("post", `/trainees/${userId}/meal-plan-days`, token, { date });

  expect(response.status).toBe(201);
  return response.body as Day;
};

const addItem = async (mealId: number, foodId: number, grams: number) => {
  const response = await ptPost(`/meals/${mealId}/items`, { foodId, grams });

  expect(response.status).toBe(201);
  return response.body as Day;
};

// Today's plan: breakfast 200 g chicken, lunch 300 g rice, dinner empty.
const todayPlan = async () => {
  const day = await createDay(TODAY);

  await addItem(day.meals[0].id, chicken, 200);
  return addItem(day.meals[1].id, rice, 300);
};

const nutritionDay = async (date = TODAY, token = w.tokens.mine) => {
  const response = await w.call("get", `/me/nutrition?week=${date}`, token);

  return (response.body.days as { date: string; totals: object; totalKcal: number; loggedCount: number }[]).find((day) => day.date === date)!;
};

describe("authentication and ownership", () => {
  it("answers 401 without a session and 403 to an admin, on every meal log route", async () => {
    const day = await todayPlan();
    const mealId = day.meals[0].id;
    const log = await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId, customName: "x", grams: 0 });
    const routes = [
      ["get", "/me/meal-plan-days"],
      ["post", `/me/meals/${mealId}/logs`, { kind: "free", customName: "x", grams: 0 }],
      ["patch", `/me/meal-logs/${log.id}`, { grams: 1 }],
      ["delete", `/me/meal-logs/${log.id}`],
      ["put", `/me/meals/${mealId}/mark`, { achieved: true, note: "" }],
    ] as const;

    for (const [method, path, body] of routes) {
      expect((await w.call(method, path, undefined, body)).status, `anon ${method} ${path}`).toBe(401);

      const admin = await w.call(method, path, w.tokens.ptA, body);

      expect(admin.status, `admin ${method} ${path}`).toBe(403);
      expect(admin.body.code).toBe("FORBIDDEN");
    }
    expect(await w.ds.getRepository(MealLog).count()).toBe(1);
  });

  it("a trainee cannot log in, edit, remove or mark another trainee's plan", async () => {
    const theirs = await createDay(TODAY, w.ids.theirs, w.tokens.ptB);
    const theirMeal = theirs.meals[0].id;
    const theirLog = await w.ds.getRepository(MealLog).save({ userId: w.ids.theirs, mealId: theirMeal, customName: "của họ", grams: 0, protein: 5 });

    const add = await w.call("post", `/me/meals/${theirMeal}/logs`, w.tokens.mine, { kind: "free", customName: "hack", grams: 0 });
    const mark = await w.call("put", `/me/meals/${theirMeal}/mark`, w.tokens.mine, { achieved: true, note: "" });
    const edit = await w.call("patch", `/me/meal-logs/${theirLog.id}`, w.tokens.mine, { customName: "hack", grams: 0 });
    const remove = await w.call("delete", `/me/meal-logs/${theirLog.id}`, w.tokens.mine);

    expect(add.status).toBe(404);
    expect(add.body).toMatchObject({ code: "MEAL_NOT_FOUND", message: "Bữa này không còn trong plan của bạn" });
    expect(mark.body.code).toBe("MEAL_NOT_FOUND");
    expect(edit.body).toMatchObject({ code: "LOG_NOT_FOUND", message: "Món này không còn trong nhật ký" });
    expect(remove.body.code).toBe("LOG_NOT_FOUND");
    expect(await w.ds.getRepository(MealLog).find()).toMatchObject([{ id: theirLog.id, customName: "của họ" }]);
    expect(await w.ds.getRepository(MealMark).count()).toBe(0);
  });

  it("a meal id that does not exist answers like a foreign one", async () => {
    const response = await w.call("post", "/me/meals/999999/logs", w.tokens.mine, { kind: "free", customName: "x", grams: 0 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("MEAL_NOT_FOUND");
  });
});

describe("POST /me/meals/:mealId/logs", () => {
  it("logs a library food with grams and stores its numbers", async () => {
    const day = await todayPlan();
    const response = await w.call("post", `/me/meals/${day.meals[0].id}/logs`, w.tokens.mine, { kind: "library", foodId: chicken, grams: 200 });

    expect(response.status).toBe(201);
    // 200 g chicken: P 62, F 7.2 -> 4/4/9 = 312.8 kcal (the library's own 165 kcal is not used).
    expect(response.body).toMatchObject({
      mealId: day.meals[0].id, foodId: chicken, isFree: false, isArchived: false, isMissingFood: false, grams: 200,
      typed: { kcal: null, protein: null, carbs: null, fat: null },
      nutrition: { kcal: 312.8, protein: 62, carbs: 0, fat: 7.2 },
    });
    expect(response.body.name).toContain("Ức gà");

    const row = await w.ds.getRepository(MealLog).findOneByOrFail({ id: response.body.id });

    expect(row).toMatchObject({ userId: w.ids.mine, foodId: chicken, grams: 200, kcal: 312.8, protein: 62, carbs: 0, fat: 7.2, customName: null });
  });

  it("logs a free food with optional numbers and a trimmed name", async () => {
    const day = await todayPlan();
    const pho = await w.call("post", `/me/meals/${day.meals[1].id}/logs`, w.tokens.mine, { kind: "free", customName: "  Phở   bò ", grams: 0, kcal: 450, protein: 25 });

    expect(pho.status).toBe(201);
    expect(pho.body).toMatchObject({
      name: "Phở bò", isFree: true, foodId: null, grams: 0,
      typed: { kcal: 450, protein: 25, carbs: null, fat: null },
      nutrition: { kcal: 450, protein: 25, carbs: 0, fat: 0 },
    });

    const water = await w.call("post", `/me/meals/${day.meals[1].id}/logs`, w.tokens.mine, { kind: "free", customName: "Nước", grams: 150 });

    expect(water.body).toMatchObject({ typed: { kcal: null, protein: null }, nutrition: null });

    const derived = await w.call("post", `/me/meals/${day.meals[1].id}/logs`, w.tokens.mine, { kind: "free", customName: "Bánh", grams: 0, protein: 20, carbs: 50, fat: 10 });

    // kcal follow the macros (4/4/9) when left empty: 80 + 200 + 90.
    expect(derived.body.nutrition).toEqual({ kcal: 370, protein: 20, carbs: 50, fat: 10 });
  });

  it("rejects a day after today (400 FUTURE_DAY) and writes nothing", async () => {
    const tomorrow = await createDay("2026-11-13");
    const response = await w.call("post", `/me/meals/${tomorrow.meals[0].id}/logs`, w.tokens.mine, { kind: "free", customName: "x", grams: 0 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "FUTURE_DAY", message: "Chưa tới ngày này, quay lại ghi sau nhé" });
    expect(await w.ds.getRepository(MealLog).count()).toBe(0);
  });

  it("rejects a food that is archived or missing (404 FOOD_NOT_FOUND)", async () => {
    const day = await todayPlan();

    for (const foodId of [archived, 999999]) {
      const response = await w.call("post", `/me/meals/${day.meals[0].id}/logs`, w.tokens.mine, { kind: "library", foodId, grams: 100 });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "FOOD_NOT_FOUND", message: "Món này không còn trong thư viện" });
    }
    expect(await w.ds.getRepository(MealLog).count()).toBe(0);
  });

  it("rejects bad numbers: zero grams, too many grams, negative or huge macros, empty name", async () => {
    const day = await todayPlan();
    const path = `/me/meals/${day.meals[0].id}/logs`;

    for (const body of [
      { kind: "library", foodId: chicken, grams: 0 },
      { kind: "library", foodId: chicken, grams: 3001 },
      { kind: "library", foodId: chicken, grams: "100" },
      { kind: "library", grams: 100 },
      { kind: "free", customName: "x", grams: 0, protein: -1 },
      { kind: "free", customName: "x", grams: 0, protein: 1001 },
      { kind: "free", customName: "x", grams: 0, kcal: 5001 },
      { kind: "free", customName: "   ", grams: 0 },
      { kind: "free", customName: "x".repeat(61), grams: 0 },
      { kind: "other", customName: "x", grams: 0 },
    ]) {
      const response = await w.call("post", path, w.tokens.mine, body);

      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
    expect(await w.ds.getRepository(MealLog).count()).toBe(0);
  });

  it("allows at most 30 foods in a meal, even when adds arrive together", async () => {
    const day = await todayPlan();
    const path = `/me/meals/${day.meals[0].id}/logs`;
    const body = { kind: "free", customName: "x", grams: 0 };

    for (let i = 0; i < 28; i += 1) {
      await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: day.meals[0].id, customName: "x", grams: 0 });
    }

    const responses = await Promise.all(Array.from({ length: 6 }, () => w.call("post", path, w.tokens.mine, body)));
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 201, 409, 409, 409, 409]);
    expect(responses.find((r) => r.status === 409)!.body).toMatchObject({ code: "TOO_MANY_LOGS", message: "Một bữa tối đa 30 món" });
    expect(await w.ds.getRepository(MealLog).count({ where: { mealId: day.meals[0].id } })).toBe(30);
  });
});

describe("PATCH /me/meal-logs/:id", () => {
  const addLibrary = async (mealId: number, grams = 200) => {
    const response = await w.call("post", `/me/meals/${mealId}/logs`, w.tokens.mine, { kind: "library", foodId: chicken, grams });

    return response.body as { id: number };
  };

  it("changes the grams of a library food, keeps its food and recomputes from the library as it is now", async () => {
    const day = await todayPlan();
    const log = await addLibrary(day.meals[0].id);

    // The PT corrects the food's macros after the log was made.
    await w.ds.query(`UPDATE foods SET protein = 30, fat = 4 WHERE id = $1`, [chicken]);

    const response = await w.call("patch", `/me/meal-logs/${log.id}`, w.tokens.mine, { grams: 100 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ foodId: chicken, grams: 100, nutrition: { kcal: 156, protein: 30, carbs: 0, fat: 4 } });
    expect(await w.ds.getRepository(MealLog).findOneByOrFail({ id: log.id })).toMatchObject({ grams: 100, kcal: 156, protein: 30, fat: 4 });
  });

  it("keeps the stored numbers when the food is edited later (KAN-93)", async () => {
    const day = await todayPlan();
    const log = await addLibrary(day.meals[0].id);

    await w.ds.query(`UPDATE foods SET protein = 99 WHERE id = $1`, [chicken]);

    const read = await w.call("get", "/me/meal-plan-days", w.tokens.mine);

    expect(read.body.logs.find((l: { id: number }) => l.id === log.id).nutrition).toEqual({ kcal: 312.8, protein: 62, carbs: 0, fat: 7.2 });
  });

  it("rejects 0 g for a library food", async () => {
    const day = await todayPlan();
    const log = await addLibrary(day.meals[0].id);
    const response = await w.call("patch", `/me/meal-logs/${log.id}`, w.tokens.mine, { grams: 0 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "GRAMS_REQUIRED", message: "Nhập số gram lớn hơn 0" });
    expect((await w.ds.getRepository(MealLog).findOneByOrFail({ id: log.id })).grams).toBe(200);
  });

  it("edits a free food's name, grams and macros, and can clear the macros", async () => {
    const day = await todayPlan();
    const created = await w.call("post", `/me/meals/${day.meals[0].id}/logs`, w.tokens.mine, { kind: "free", customName: "Phở", grams: 0, kcal: 450, protein: 25 });
    const edited = await w.call("patch", `/me/meal-logs/${created.body.id}`, w.tokens.mine, { customName: " Bún  bò ", grams: 300, kcal: 500, protein: 30, carbs: 60, fat: 12 });

    expect(edited.body).toMatchObject({ name: "Bún bò", grams: 300, typed: { kcal: 500, protein: 30, carbs: 60, fat: 12 }, nutrition: { kcal: 500, protein: 30, carbs: 60, fat: 12 } });

    const cleared = await w.call("patch", `/me/meal-logs/${created.body.id}`, w.tokens.mine, { customName: "Bún bò", grams: 300 });

    expect(cleared.body).toMatchObject({ typed: { kcal: null, protein: null, carbs: null, fat: null }, nutrition: null });

    const nameless = await w.call("patch", `/me/meal-logs/${created.body.id}`, w.tokens.mine, { grams: 300 });

    expect(nameless.status).toBe(400);
    expect(nameless.body).toMatchObject({ code: "NAME_REQUIRED", message: "Nhập tên món" });
  });

  it("cannot edit a log of a day after today", async () => {
    const tomorrow = await createDay("2026-11-13");
    const log = await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: tomorrow.meals[0].id, customName: "x", grams: 0 });
    const response = await w.call("patch", `/me/meal-logs/${log.id}`, w.tokens.mine, { customName: "y", grams: 0 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("FUTURE_DAY");
    expect((await w.ds.getRepository(MealLog).findOneByOrFail({ id: log.id })).customName).toBe("x");
  });

  it("can edit a log whose food was archived since", async () => {
    const day = await todayPlan();
    const log = await addLibrary(day.meals[0].id);

    await w.ds.query(`UPDATE foods SET archived_at = now() WHERE id = $1`, [chicken]);

    const response = await w.call("patch", `/me/meal-logs/${log.id}`, w.tokens.mine, { grams: 250 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ grams: 250, isArchived: true });
    await w.ds.query(`UPDATE foods SET archived_at = NULL WHERE id = $1`, [chicken]);
  });
});

describe("DELETE /me/meal-logs/:id", () => {
  it("removes the trainee's own log only", async () => {
    const day = await todayPlan();
    const mine = await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: day.meals[0].id, customName: "a", grams: 0 });
    const other = await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: day.meals[0].id, customName: "b", grams: 0 });

    expect((await w.call("delete", `/me/meal-logs/${mine.id}`, w.tokens.mine)).status).toBe(204);
    expect(await w.ds.getRepository(MealLog).find()).toMatchObject([{ id: other.id }]);

    const again = await w.call("delete", `/me/meal-logs/${mine.id}`, w.tokens.mine);

    expect(again.status).toBe(404);
    expect(again.body.code).toBe("LOG_NOT_FOUND");
  });
});

describe("PUT /me/meals/:mealId/mark", () => {
  const mark = (mealId: number, body: { achieved: boolean; note: string }) => w.call("put", `/me/meals/${mealId}/mark`, w.tokens.mine, body);

  it("marks Đạt, then updates the same row with a note", async () => {
    const day = await todayPlan();
    const first = await mark(day.meals[0].id, { achieved: true, note: "" });

    expect(first.status).toBe(200);
    expect(first.body.mark).toMatchObject({ mealId: day.meals[0].id, achieved: true, note: "" });

    const second = await mark(day.meals[0].id, { achieved: true, note: "  hơi ít cơm " });

    expect(second.body.mark).toMatchObject({ achieved: true, note: "hơi ít cơm" });
    expect(await w.ds.getRepository(MealMark).find()).toMatchObject([{ mealId: day.meals[0].id, userId: w.ids.mine, achieved: true, note: "hơi ít cơm" }]);
  });

  it("keeps a note without Đạt, and removes the mark when both are cleared", async () => {
    const day = await todayPlan();

    await mark(day.meals[0].id, { achieved: true, note: "" });

    const noteOnly = await mark(day.meals[0].id, { achieved: false, note: "bỏ bữa" });

    expect(noteOnly.body.mark).toMatchObject({ achieved: false, note: "bỏ bữa", frozen: [] });
    expect(await w.ds.getRepository(MealMarkItem).count()).toBe(0);

    const cleared = await mark(day.meals[0].id, { achieved: false, note: "  " });

    expect(cleared.body).toEqual({ mark: null });
    expect(await w.ds.getRepository(MealMark).count()).toBe(0);
  });

  it("rejects a foreign meal, a future day and a too long note", async () => {
    const day = await todayPlan();
    const tomorrow = await createDay("2026-11-13");
    const theirs = await createDay(TODAY, w.ids.theirs, w.tokens.ptB);

    expect((await mark(theirs.meals[0].id, { achieved: true, note: "" })).body.code).toBe("MEAL_NOT_FOUND");
    expect((await mark(tomorrow.meals[0].id, { achieved: true, note: "" })).body.code).toBe("FUTURE_DAY");
    expect((await mark(day.meals[0].id, { achieved: true, note: "x".repeat(301) })).status).toBe(400);
    expect(await w.ds.getRepository(MealMark).count()).toBe(0);
  });

  describe("freezing the eaten numbers (KAN-93)", () => {
    it("snapshots every planned item with its numbers when marked", async () => {
      const day = await todayPlan();
      const response = await mark(day.meals[0].id, { achieved: true, note: "" });

      expect(response.body.mark.frozen).toEqual([{ foodId: chicken, nutrition: { kcal: 312.8, protein: 62, carbs: 0, fat: 7.2 } }]);
      expect(await w.ds.getRepository(MealMarkItem).find()).toMatchObject([{ mealId: day.meals[0].id, foodId: chicken, grams: 200, protein: 62, carbs: 0, fat: 7.2, kcal: 312.8 }]);
    });

    it("keeps the eaten total when the PT changes grams or the food's macros", async () => {
      const day = await todayPlan();

      await mark(day.meals[0].id, { achieved: true, note: "" });
      expect(await nutritionDay()).toMatchObject({ totals: { carbs: 0, protein: 62, fat: 7 }, totalKcal: 313, loggedCount: 1 });

      await w.call("patch", `/meal-items/${day.meals[0].items[0].id}`, w.tokens.ptA, { grams: 400 });
      await w.ds.query(`UPDATE foods SET protein = 50 WHERE id = $1`, [chicken]);
      await addItem(day.meals[0].id, rice, 100);
      expect(await nutritionDay()).toMatchObject({ totals: { carbs: 0, protein: 62, fat: 7 }, totalKcal: 313 });
    });

    it("keeps the snapshot when only the note changes, and drops it on un-mark", async () => {
      const day = await todayPlan();

      await mark(day.meals[0].id, { achieved: true, note: "" });
      await w.call("patch", `/meal-items/${day.meals[0].items[0].id}`, w.tokens.ptA, { grams: 400 });
      await mark(day.meals[0].id, { achieved: true, note: "ghi chú" });
      expect(await w.ds.getRepository(MealMarkItem).find()).toMatchObject([{ grams: 200 }]);
      await mark(day.meals[0].id, { achieved: false, note: "ghi chú" });
      expect(await w.ds.getRepository(MealMarkItem).count()).toBe(0);
      expect(await nutritionDay()).toMatchObject({ totals: { protein: 0 }, loggedCount: 0 });
    });

    it("takes a fresh snapshot when marked again after the PT edited the grams", async () => {
      const day = await todayPlan();

      await mark(day.meals[0].id, { achieved: true, note: "" });
      await mark(day.meals[0].id, { achieved: false, note: "x" });
      await w.call("patch", `/meal-items/${day.meals[0].items[0].id}`, w.tokens.ptA, { grams: 400 });
      await mark(day.meals[0].id, { achieved: true, note: "x" });
      expect(await nutritionDay()).toMatchObject({ totals: { protein: 124, fat: 14 }, totalKcal: 626 });
    });

    it("replaces the frozen item with a same-food log added after the mark", async () => {
      const day = await todayPlan();

      await mark(day.meals[0].id, { achieved: true, note: "" });
      await w.call("post", `/me/meals/${day.meals[0].id}/logs`, w.tokens.mine, { kind: "library", foodId: chicken, grams: 100 });
      // 100 g logged instead of the planned 200 g.
      expect(await nutritionDay()).toMatchObject({ totals: { protein: 31, fat: 4 }, loggedCount: 1 });
    });

    it("reads a mark made before KAN-93 (no snapshot rows) from the live plan", async () => {
      const day = await todayPlan();

      await w.ds.getRepository(MealMark).save({ mealId: day.meals[0].id, userId: w.ids.mine, achieved: true, note: "" });
      expect(await nutritionDay()).toMatchObject({ totals: { protein: 62 }, loggedCount: 1 });
      await w.call("patch", `/meal-items/${day.meals[0].items[0].id}`, w.tokens.ptA, { grams: 400 });
      expect(await nutritionDay()).toMatchObject({ totals: { protein: 124 } });
    });

    it("agrees across the plan read, the day totals and the week strip", async () => {
      const day = await todayPlan();

      await mark(day.meals[0].id, { achieved: true, note: "" });
      await mark(day.meals[1].id, { achieved: true, note: "" });

      const plan = await w.call("get", "/me/meal-plan-days", w.tokens.mine);

      expect(plan.body.marks.map((m: { frozen: unknown[] }) => m.frozen.length)).toEqual([1, 1]);
      expect(plan.body.completion[TODAY]).toBe("partial");
      // Chicken 200 g + rice 300 g: P 62 + 8.1, C 84.6, F 7.2 + 0.9.
      expect(await nutritionDay()).toMatchObject({ totals: { carbs: 85, protein: 70, fat: 8 }, loggedCount: 2 });
    });
  });
});

describe("GET /me/meal-plan-days", () => {
  it("returns the plan with logs, marks and completion for the week, for this trainee only", async () => {
    const day = await todayPlan();
    const theirs = await createDay(TODAY, w.ids.theirs, w.tokens.ptB);

    await w.call("post", `/me/meals/${day.meals[0].id}/logs`, w.tokens.mine, { kind: "library", foodId: chicken, grams: 200 });
    await w.call("put", `/me/meals/${day.meals[0].id}/mark`, w.tokens.mine, { achieved: true, note: "" });
    await w.call("put", `/me/meals/${day.meals[1].id}/mark`, w.tokens.mine, { achieved: false, note: "ít" });
    await w.ds.getRepository(MealLog).save({ userId: w.ids.theirs, mealId: theirs.meals[0].id, customName: "Khác", grams: 0 });

    const response = await w.call("get", "/me/meal-plan-days?week=2026-11-15", w.tokens.mine);

    expect(response.status).toBe(200);
    expect(response.body.weekStart).toBe("2026-11-09");
    expect(response.body.days.map((d: Day) => d.date)).toEqual([TODAY]);
    expect(response.body.days[0].meals.map((m: Meal) => m.items.map((i) => [i.foodId, i.grams]))).toEqual([[[chicken, 200]], [[rice, 300]], []]);
    expect(response.body.logs).toHaveLength(1);
    expect(response.body.marks.map((m: { mealId: number; achieved: boolean }) => [m.mealId, m.achieved])).toEqual([[day.meals[0].id, true], [day.meals[1].id, false]]);
    // One of three planned meals achieved: partial. A note-only mark counts nothing.
    expect(response.body.completion[TODAY]).toBe("partial");
    expect(response.body.completion["2026-11-09"]).toBe("none");
    expect(Object.keys(response.body.completion)).toHaveLength(7);
  });

  it("reports complete when every planned meal is achieved, and none for extra food or a mark of a deleted meal", async () => {
    const day = await todayPlan();

    for (const meal of day.meals) {
      await w.call("put", `/me/meals/${meal.id}/mark`, w.tokens.mine, { achieved: true, note: "" });
    }
    expect((await w.call("get", "/me/meal-plan-days", w.tokens.mine)).body.completion[TODAY]).toBe("complete");

    await w.call("delete", `/meals/${day.meals[2].id}`, w.tokens.ptA);
    expect((await w.call("get", "/me/meal-plan-days", w.tokens.mine)).body.completion[TODAY]).toBe("complete");

    const second = await createDay("2026-11-11");

    await w.call("post", `/me/meals/${second.meals[0].id}/logs`, w.tokens.mine, { kind: "free", customName: "x", grams: 0 });
    expect((await w.call("get", "/me/meal-plan-days", w.tokens.mine)).body.completion["2026-11-11"]).toBe("none");
  });

  it("has an empty week when there is no plan", async () => {
    const response = await w.call("get", "/me/meal-plan-days?week=2026-12-07", w.tokens.mine);

    expect(response.body).toMatchObject({ weekStart: "2026-12-07", days: [], logs: [], marks: [], preferences: { preferredMealCount: null, foodNote: null } });
  });
});

describe("meal logs in the nutrition overview", () => {
  it("adds meal logs to the old entries in the day totals, for this trainee only", async () => {
    const day = await todayPlan();
    const theirs = await createDay(TODAY, w.ids.theirs, w.tokens.ptB);

    await w.ds.getRepository(FoodEntry).save({ userId: w.ids.mine, date: TODAY, meal: "lunch", description: "Cũ", carbs: 60, protein: 30, fat: 10 });
    await w.call("post", `/me/meals/${day.meals[0].id}/logs`, w.tokens.mine, { kind: "library", foodId: chicken, grams: 200 });
    await w.call("post", `/me/meals/${day.meals[1].id}/logs`, w.tokens.mine, { kind: "free", customName: "Phở", grams: 0, kcal: 450, protein: 25 });
    await w.call("post", `/me/meals/${day.meals[1].id}/logs`, w.tokens.mine, { kind: "free", customName: "Nước", grams: 0 });
    await w.ds.getRepository(MealLog).save({ userId: w.ids.theirs, mealId: theirs.meals[0].id, customName: "Khác", grams: 0, protein: 99 });

    const days = (await w.call("get", "/me/nutrition", w.tokens.mine)).body.days as { date: string; totals: object; loggedCount: number; entries: unknown[] }[];
    const today = days.find((d) => d.date === TODAY)!;

    // C 60; P 30 + 62 + 25 = 117; F 10 + 7.2 = 17.2 -> 17.
    expect(today.totals).toEqual({ carbs: 60, protein: 117, fat: 17 });
    expect(today.loggedCount).toBe(4);
    expect(today.entries).toHaveLength(1);
    expect(days.filter((d) => d.loggedCount > 0).map((d) => d.date)).toEqual([TODAY]);
    // kcal: entries 4/4/9 = 240 + 120 + 90 = 450, plus 312.8 + 450 + 0.
    expect((today as unknown as { totalKcal: number }).totalKcal).toBe(1213);
    // The PT sees the same numbers.
    const asPt = (await w.call("get", `/trainees/${w.ids.mine}/nutrition`, w.tokens.ptA)).body.days.find((d: { date: string }) => d.date === TODAY);

    expect(asPt.totals).toEqual(today.totals);
  });

  it("flags planned days whose kcal differ from the target by more than 80 (PT view)", async () => {
    const day = await createDay("2026-11-13");

    await addItem(day.meals[0].id, rice, 300);
    await w.ds.getRepository(NutritionTarget).save({ userId: w.ids.mine, effectiveFrom: "2026-11-01", carbs: 100, protein: 10, fat: 5, note: "", source: "manual" });
    // Rice 300 g: P 8.1 C 84.6 F 0.9 -> 32.4 + 338.4 + 8.1 = 378.9 kcal vs target 400 + 40 + 45 = 485: -106.
    const response = await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days?week=2026-11-13`, w.tokens.ptA);

    expect(response.body.planKcalNotices).toEqual([{ date: "2026-11-13", gapKcal: -106 }]);

    await w.ds.getRepository(NutritionTarget).update({ userId: w.ids.mine }, { carbs: 90 });
    // Target now 360 + 40 + 45 = 445 -> gap -66: within 80.
    expect((await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days?week=2026-11-13`, w.tokens.ptA)).body.planKcalNotices).toEqual([]);
  });

  it("copying a day over a day with logs replaces them; the trainee can no longer edit the old ones", async () => {
    const day = await todayPlan();
    const saturday = await createDay("2026-11-14");
    const log = await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: saturday.meals[0].id, customName: "x", grams: 0 });

    await w.ds.getRepository(MealMark).save({ mealId: saturday.meals[1].id, userId: w.ids.mine, achieved: true, note: "" });
    expect((await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days/copy-info?from=2026-11-13&to=2026-11-20`, w.tokens.ptA)).body).toEqual({ planDates: ["2026-11-14"], logDates: ["2026-11-14"] });

    const copied = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/copy`, w.tokens.ptA, { dayId: day.id, dates: ["2026-11-14"] });

    expect(copied.body).toEqual({ copied: 1, skipped: 0 });
    expect(await w.ds.getRepository(MealLog).count()).toBe(0);
    expect(await w.ds.getRepository(MealMark).count()).toBe(0);

    const edit = await w.call("patch", `/me/meal-logs/${log.id}`, w.tokens.mine, { customName: "y", grams: 0 });

    expect(edit.status).toBe(404);
    expect(edit.body.code).toBe("LOG_NOT_FOUND");
  });
});

