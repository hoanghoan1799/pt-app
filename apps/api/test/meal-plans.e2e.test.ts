import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MealLog } from "../src/database/entities/meal-log.entity.js";
import { MealMark } from "../src/database/entities/meal-mark.entity.js";
import { MealMarkItem } from "../src/database/entities/meal-mark-item.entity.js";
import { MealPlanDay } from "../src/database/entities/meal-plan-day.entity.js";
import { MealPlanItem } from "../src/database/entities/meal-plan-item.entity.js";
import { MealPlanMeal } from "../src/database/entities/meal-plan-meal.entity.js";
import { NutritionTarget } from "../src/database/entities/nutrition-target.entity.js";
import { User } from "../src/database/entities/user.entity.js";
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
let broccoli: number;
let archived: number;

beforeAll(async () => {
  w = await bootNutritionWorld();
  chicken = await seedFood(w.ds, FOODS.chicken);
  rice = await seedFood(w.ds, FOODS.rice);
  broccoli = await seedFood(w.ds, FOODS.broccoli);
  archived = await seedFood(w.ds, { ...FOODS.oil, archived: true });
});

afterAll(async () => {
  await w.close();
});

beforeEach(async () => {
  // Plans cascade to meals, items, logs and marks.
  await w.ds.getRepository(MealPlanDay).createQueryBuilder().delete().execute();
  await w.ds.getRepository(NutritionTarget).createQueryBuilder().delete().execute();
  await w.ds.query(`UPDATE users SET preferred_meal_count = NULL, food_note = NULL`);
});

const FRIDAY = "2026-11-13";
const SATURDAY = "2026-11-14";
const NEXT_MONDAY = "2026-11-16";

type Meal = { id: number; position: number; name: string; sharePercent: number | null; items: { id: number; foodId: number; grams: number }[] };
type Day = { id: number; date: string; meals: Meal[] };

const createDay = async (date: string, userId = w.ids.mine, token = w.tokens.ptA) => {
  const response = await w.call("post", `/trainees/${userId}/meal-plan-days`, token, { date });

  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as Day;
};

const addItem = async (mealId: number, foodId: number, grams?: number, token = w.tokens.ptA) => {
  const response = await w.call("post", `/meals/${mealId}/items`, token, grams === undefined ? { foodId } : { foodId, grams });

  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as Day;
};

// Every plan row of a trainee, as plain values.
const dump = async (userId: number) => {
  const days = await w.ds.getRepository(MealPlanDay).find({ where: { userId }, order: { date: "ASC" } });
  const out: [string, [number, string, number | null, number[][]][]][] = [];

  for (const day of days) {
    const meals = await w.ds.getRepository(MealPlanMeal).find({ where: { dayId: day.id }, order: { position: "ASC" } });

    out.push([
      day.date,
      await Promise.all(
        meals.map(async (meal) => [
          meal.position,
          meal.name,
          meal.sharePercent,
          (await w.ds.getRepository(MealPlanItem).find({ where: { mealId: meal.id }, order: { id: "ASC" } })).map((item) => [item.foodId, item.grams]),
        ]),
      ),
    ]);
  }
  return out;
};

const setTarget = (userId: number, macros = { carbs: 235, protein: 160, fat: 55 }) =>
  w.ds.getRepository(NutritionTarget).save({ userId, effectiveFrom: "2026-11-01", note: "", source: "manual", ...macros });

describe("authentication and scope of plan routes", () => {
  it("answers 401 without a session, 403 to a trainee, 404 outside the PT's workspace", async () => {
    const mine = await createDay(FRIDAY);
    const theirs = await createDay(FRIDAY, w.ids.theirs, w.tokens.ptB);
    const mealId = mine.meals[0].id;
    const routes = [
      ["get", `/trainees/${w.ids.mine}/meal-plan-days`],
      ["get", `/trainees/${w.ids.mine}/meal-plan-days/copy-info?from=${TODAY}&to=${FRIDAY}`],
      ["post", `/trainees/${w.ids.mine}/meal-plan-days`, { date: SATURDAY }],
      ["post", `/trainees/${w.ids.mine}/meal-plan-days/copy`, { dayId: mine.id, dates: [SATURDAY] }],
      ["post", `/trainees/${w.ids.mine}/meal-plan-days/apply-last-week`, { weekStart: NEXT_MONDAY }],
      ["delete", `/meal-plan-days/${mine.id}`],
      ["post", `/meal-plan-days/${mine.id}/meals`],
      ["put", `/meal-plan-days/${mine.id}/meals/order`, { mealIds: mine.meals.map((m) => m.id) }],
      ["put", `/meal-plan-days/${mine.id}/meals/shares`, { shares: null }],
      ["patch", `/meals/${mealId}`, { name: "x" }],
      ["delete", `/meals/${mealId}`],
      ["post", `/meals/${mealId}/items`, { foodId: chicken }],
      ["post", `/meals/${mealId}/auto-solve`, { fixedItemIds: [] }],
    ] as const;

    for (const [method, path, body] of routes) {
      const anon = await w.call(method, path, undefined, body);
      const trainee = await w.call(method, path, w.tokens.mine, body);

      expect(anon.status, `anon ${method} ${path}`).toBe(401);
      expect(trainee.status, `trainee ${method} ${path}`).toBe(403);
      expect(trainee.body.code).toBe("FORBIDDEN");
    }

    // PT B on PT A's trainee: the :userId routes say TRAINEE_NOT_FOUND ...
    for (const [method, path, body] of routes.slice(0, 5)) {
      const response = await w.call(method, path, w.tokens.ptB, body);

      expect(response.status, `${method} ${path}`).toBe(404);
      expect(response.body.code).toBe("TRAINEE_NOT_FOUND");
    }
    // ... and the id routes answer exactly like a missing day, meal or item.
    expect((await w.call("delete", `/meal-plan-days/${mine.id}`, w.tokens.ptB)).body).toMatchObject({ code: "DAY_NOT_FOUND", message: "Ngày này không có plan" });
    expect((await w.call("delete", `/meal-plan-days/999999`, w.tokens.ptB)).body).toMatchObject({ code: "DAY_NOT_FOUND" });
    expect((await w.call("patch", `/meals/${mealId}`, w.tokens.ptB, { name: "hack" })).body).toMatchObject({ code: "MEAL_NOT_FOUND", message: "Bữa này không còn tồn tại" });
    expect((await w.call("post", `/meals/${mealId}/items`, w.tokens.ptB, { foodId: chicken })).status).toBe(404);
    expect((await w.call("delete", `/meal-items/999999`, w.tokens.ptB)).body).toMatchObject({ code: "ITEM_NOT_FOUND", message: "Món này không còn trong bữa" });

    // Nothing of PT A's or PT B's plan changed.
    expect(await dump(w.ids.mine)).toEqual([[FRIDAY, [[0, "Bữa sáng", null, []], [1, "Bữa trưa", null, []], [2, "Bữa tối", null, []]]]]);
    expect((await dump(w.ids.theirs))[0][0]).toBe(theirs.date);
  });

  it("works with another PT's ids only for a super admin", async () => {
    const theirs = await createDay(FRIDAY, w.ids.theirs, w.tokens.ptB);

    expect((await w.call("patch", `/meals/${theirs.meals[0].id}`, w.tokens.ptA, { name: "x" })).status).toBe(404);

    const renamed = await w.call("patch", `/meals/${theirs.meals[0].id}`, w.tokens.superAdmin, { name: "Bữa sớm" });

    expect(renamed.status).toBe(200);
    expect(renamed.body.meals[0].name).toBe("Bữa sớm");
  });
});

describe("POST /trainees/:userId/meal-plan-days", () => {
  it("starts with 3 meals named sáng, trưa, tối", async () => {
    const day = await createDay(FRIDAY);

    expect(day.date).toBe(FRIDAY);
    expect(day.meals.map((m) => [m.position, m.name, m.sharePercent, m.items])).toEqual([
      [0, "Bữa sáng", null, []],
      [1, "Bữa trưa", null, []],
      [2, "Bữa tối", null, []],
    ]);
  });

  it("starts with the trainee's 5 meals, snacks after dinner", async () => {
    await w.ds.getRepository(User).update({ id: w.ids.mine }, { preferredMealCount: 5 });

    expect((await createDay(FRIDAY)).meals.map((m) => m.name)).toEqual(["Bữa sáng", "Bữa trưa", "Bữa tối", "Bữa phụ 1", "Bữa phụ 2"]);
  });

  it("ignores a stored count outside 2-6", async () => {
    await w.ds.getRepository(User).update({ id: w.ids.mine }, { preferredMealCount: 9 });

    expect((await createDay(FRIDAY)).meals).toHaveLength(3);
  });

  it("refuses a second plan for the same day with 409 PLAN_EXISTS and keeps the first", async () => {
    const first = await createDay(FRIDAY);

    await addItem(first.meals[0].id, chicken, 150);

    const again = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days`, w.tokens.ptA, { date: FRIDAY });

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: "PLAN_EXISTS", message: "Ngày này đã có plan" });
    expect(await dump(w.ids.mine)).toEqual([[FRIDAY, [[0, "Bữa sáng", null, [[chicken, 150]]], [1, "Bữa trưa", null, []], [2, "Bữa tối", null, []]]]]);
  });

  it("refuses a bad date and writes nothing", async () => {
    for (const date of ["2026-02-30", "13/11/2026", "", "2026-11-1"]) {
      expect((await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days`, w.tokens.ptA, { date })).status).toBe(400);
    }
    expect(await w.ds.getRepository(MealPlanDay).count()).toBe(0);
  });
});

describe("meals", () => {
  it("adds the next default name, resets shares, and removes with positions closing up", async () => {
    const day = await createDay(FRIDAY);
    const shared = await w.call("put", `/meal-plan-days/${day.id}/meals/shares`, w.tokens.ptA, {
      shares: day.meals.map((m, i) => ({ mealId: m.id, percent: [30, 30, 40][i] })),
    });

    expect(shared.body.meals.map((m: Meal) => m.sharePercent)).toEqual([30, 30, 40]);

    const added = await w.call("post", `/meal-plan-days/${day.id}/meals`, w.tokens.ptA);

    expect(added.status).toBe(201);
    expect(added.body.meals.map((m: Meal) => [m.position, m.name, m.sharePercent])).toEqual([
      [0, "Bữa sáng", null], [1, "Bữa trưa", null], [2, "Bữa tối", null], [3, "Bữa phụ 1", null],
    ]);

    const removed = await w.call("delete", `/meals/${added.body.meals[1].id}`, w.tokens.ptA);

    expect(removed.status).toBe(200);
    expect(removed.body.meals.map((m: Meal) => [m.position, m.name])).toEqual([[0, "Bữa sáng"], [1, "Bữa tối"], [2, "Bữa phụ 1"]]);
  });

  it("removing a meal deletes its foods, logs and marks and nothing else", async () => {
    const day = await createDay(FRIDAY);
    const kept = day.meals[0].id;
    const doomed = day.meals[1].id;

    await addItem(kept, chicken, 100);
    await addItem(doomed, rice, 200);
    await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: doomed, foodId: rice, grams: 100 });
    await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: kept, foodId: chicken, grams: 100 });

    const mark = await w.ds.getRepository(MealMark).save({ mealId: doomed, userId: w.ids.mine, achieved: true, note: "" });

    await w.ds.getRepository(MealMarkItem).save({ markId: mark.id, mealId: doomed, foodId: rice, grams: 200, protein: 1, carbs: 2, fat: 3, kcal: 4 });
    await w.call("delete", `/meals/${doomed}`, w.tokens.ptA);

    expect(await w.ds.getRepository(MealPlanItem).find()).toMatchObject([{ mealId: kept, foodId: chicken }]);
    expect(await w.ds.getRepository(MealLog).find()).toMatchObject([{ mealId: kept }]);
    expect(await w.ds.getRepository(MealMark).count()).toBe(0);
    expect(await w.ds.getRepository(MealMarkItem).count()).toBe(0);
  });

  it("keeps the last meal: 409 LAST_MEAL", async () => {
    const day = await createDay(FRIDAY);

    await w.call("delete", `/meals/${day.meals[0].id}`, w.tokens.ptA);
    await w.call("delete", `/meals/${day.meals[1].id}`, w.tokens.ptA);

    const last = await w.call("delete", `/meals/${day.meals[2].id}`, w.tokens.ptA);

    expect(last.status).toBe(409);
    expect(last.body).toMatchObject({ code: "LAST_MEAL", message: "Plan cần ít nhất một bữa. Xóa cả plan nếu không dùng nữa." });
    expect(await w.ds.getRepository(MealPlanMeal).count()).toBe(1);
  });

  it("limits a day to 10 meals", async () => {
    const day = await createDay(FRIDAY);

    for (let i = 0; i < 7; i += 1) {
      expect((await w.call("post", `/meal-plan-days/${day.id}/meals`, w.tokens.ptA)).status).toBe(201);
    }

    const eleventh = await w.call("post", `/meal-plan-days/${day.id}/meals`, w.tokens.ptA);

    expect(eleventh.status).toBe(409);
    expect(eleventh.body).toMatchObject({ code: "TOO_MANY_MEALS", message: "Một ngày tối đa 10 bữa" });
    expect(await w.ds.getRepository(MealPlanMeal).count({ where: { dayId: day.id } })).toBe(10);
  });

  it("renames with collapsed spaces and refuses an empty or long name", async () => {
    const day = await createDay(FRIDAY);
    const id = day.meals[0].id;
    const ok = await w.call("patch", `/meals/${id}`, w.tokens.ptA, { name: "  Bữa   trước  tập " });

    expect(ok.body.meals[0].name).toBe("Bữa trước tập");
    for (const name of ["", "   ", "x".repeat(41)]) {
      expect((await w.call("patch", `/meals/${id}`, w.tokens.ptA, { name })).status).toBe(400);
    }
    expect((await w.ds.getRepository(MealPlanMeal).findOneByOrFail({ id })).name).toBe("Bữa trước tập");
  });

  it("reorders, and refuses a list that is not exactly the day's meals (409)", async () => {
    const day = await createDay(FRIDAY);
    const [a, b, c] = day.meals.map((m) => m.id);
    const reordered = await w.call("put", `/meal-plan-days/${day.id}/meals/order`, w.tokens.ptA, { mealIds: [c, a, b] });

    expect(reordered.body.meals.map((m: Meal) => [m.id, m.position])).toEqual([[c, 0], [a, 1], [b, 2]]);
    for (const mealIds of [[a, b], [a, b, c, 999999], [a, a, b], [a, b, 999999]]) {
      const bad = await w.call("put", `/meal-plan-days/${day.id}/meals/order`, w.tokens.ptA, { mealIds });

      expect(bad.status, JSON.stringify(mealIds)).toBe(409);
      expect(bad.body).toMatchObject({ code: "REORDER_MISMATCH", message: "Danh sách bữa đã thay đổi, tải lại trang" });
    }
    expect((await dump(w.ids.mine))[0][1].map((m) => m[1])).toEqual(["Bữa tối", "Bữa sáng", "Bữa trưa"]);
  });

  it("sets shares that total 100, resets them to equal, and refuses 99, 101 or a missing meal", async () => {
    const day = await createDay(FRIDAY);
    const [a, b, c] = day.meals.map((m) => m.id);
    const set = await w.call("put", `/meal-plan-days/${day.id}/meals/shares`, w.tokens.ptA, {
      shares: [{ mealId: a, percent: 25.5 }, { mealId: b, percent: 34.5 }, { mealId: c, percent: 40 }],
    });

    expect(set.body.meals.map((m: Meal) => m.sharePercent)).toEqual([25.5, 34.5, 40]);

    for (const percents of [[25, 35, 39], [25, 35, 41]]) {
      const bad = await w.call("put", `/meal-plan-days/${day.id}/meals/shares`, w.tokens.ptA, {
        shares: [a, b, c].map((mealId, i) => ({ mealId, percent: percents[i] })),
      });

      expect(bad.status).toBe(400);
      expect(bad.body).toMatchObject({ code: "SHARES_TOTAL", message: "Tổng phần trăm các bữa phải bằng 100" });
    }
    expect((await w.call("put", `/meal-plan-days/${day.id}/meals/shares`, w.tokens.ptA, { shares: [{ mealId: a, percent: 50 }, { mealId: b, percent: 50 }] })).body.code).toBe("REORDER_MISMATCH");
    expect((await dump(w.ids.mine))[0][1].map((m) => m[2])).toEqual([25.5, 34.5, 40]);

    const reset = await w.call("put", `/meal-plan-days/${day.id}/meals/shares`, w.tokens.ptA, { shares: null });

    expect(reset.body.meals.map((m: Meal) => m.sharePercent)).toEqual([null, null, null]);
  });
});

describe("items", () => {
  it("adds 100 g by default, edits grams to one decimal and removes", async () => {
    const day = await createDay(FRIDAY);
    const mealId = day.meals[0].id;
    const added = await addItem(mealId, chicken);

    expect(added.meals[0].items).toMatchObject([
      { foodId: chicken, grams: 100, food: { id: chicken, protein: 31, carbs: 0, fat: 3.6, isArchived: false } },
    ]);

    const itemId = added.meals[0].items[0].id;
    const edited = await w.call("patch", `/meal-items/${itemId}`, w.tokens.ptA, { grams: 123.456 });

    expect(edited.body.meals[0].items[0].grams).toBe(123.5);

    const removed = await w.call("delete", `/meal-items/${itemId}`, w.tokens.ptA);

    expect(removed.status).toBe(200);
    expect(removed.body.meals[0].items).toEqual([]);
    expect(await w.ds.getRepository(MealPlanItem).count()).toBe(0);
  });

  it("refuses bad grams and leaves the old value", async () => {
    const day = await createDay(FRIDAY);
    const added = await addItem(day.meals[0].id, chicken, 150);
    const itemId = added.meals[0].items[0].id;

    for (const grams of [0, -5, 3001, "100", null]) {
      expect((await w.call("patch", `/meal-items/${itemId}`, w.tokens.ptA, { grams })).status, String(grams)).toBe(400);
    }
    expect((await w.call("post", `/meals/${day.meals[0].id}/items`, w.tokens.ptA, { foodId: rice, grams: 0 })).status).toBe(400);
    expect((await w.ds.getRepository(MealPlanItem).findOneByOrFail({ id: itemId })).grams).toBe(150);
  });

  it("refuses the same food twice (409) and a food that does not exist (404)", async () => {
    const day = await createDay(FRIDAY);
    const mealId = day.meals[0].id;

    await addItem(mealId, chicken);

    const twice = await w.call("post", `/meals/${mealId}/items`, w.tokens.ptA, { foodId: chicken });

    expect(twice.status).toBe(409);
    expect(twice.body).toMatchObject({ code: "FOOD_ALREADY_IN_MEAL", message: "Món này đã có trong bữa" });

    const missing = await w.call("post", `/meals/${mealId}/items`, w.tokens.ptA, { foodId: 999999 });

    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "FOOD_NOT_FOUND", message: "Món này không còn trong thư viện" });
    expect(await w.ds.getRepository(MealPlanItem).count()).toBe(1);
  });

  it("refuses an archived food for new items but still shows it in a plan that has it", async () => {
    const day = await createDay(FRIDAY);
    const mealId = day.meals[0].id;
    const refused = await w.call("post", `/meals/${mealId}/items`, w.tokens.ptA, { foodId: archived });

    expect(refused.body.code).toBe("FOOD_NOT_FOUND");

    const soon = await addItem(mealId, rice);

    await w.ds.query(`UPDATE foods SET archived_at = now() WHERE id = $1`, [rice]);

    const week = await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days?week=${FRIDAY}`, w.tokens.ptA);

    expect(soon.meals[0].items).toHaveLength(1);
    expect(week.body.days[0].meals[0].items[0]).toMatchObject({ foodId: rice, food: { isArchived: true } });
    await w.ds.query(`UPDATE foods SET archived_at = NULL WHERE id = $1`, [rice]);
  });

  it("limits a meal to 20 foods", async () => {
    const day = await createDay(FRIDAY);
    const mealId = day.meals[0].id;

    for (let i = 0; i < 20; i += 1) {
      await addItem(mealId, await seedFood(w.ds, { protein: 1, carbs: 1, fat: 1 }), 10);
    }

    const over = await w.call("post", `/meals/${mealId}/items`, w.tokens.ptA, { foodId: chicken });

    expect(over.status).toBe(409);
    expect(over.body).toMatchObject({ code: "TOO_MANY_ITEMS", message: "Một bữa tối đa 20 món" });
    expect(await w.ds.getRepository(MealPlanItem).count()).toBe(20);
  });
});

describe("POST /meals/:mealId/auto-solve", () => {
  // The day has one meal, so the meal target is the whole day: P 160 / C 235 / F 55.
  const oneMealDay = async () => {
    await w.ds.getRepository(User).update({ id: w.ids.mine }, { preferredMealCount: 2 });

    const day = await createDay(FRIDAY);
    const removed = await w.call("delete", `/meals/${day.meals[1].id}`, w.tokens.ptA);

    await setTarget(w.ids.mine);
    return removed.body as Day;
  };

  it("saves 425 g chicken and 755 g rice around 300 g fixed broccoli", async () => {
    const day = await oneMealDay();
    const mealId = day.meals[0].id;

    await addItem(mealId, chicken);
    await addItem(mealId, rice);

    const withBroccoli = await addItem(mealId, broccoli, 300);
    const broccoliItem = withBroccoli.meals[0].items.find((item) => item.foodId === broccoli)!;
    const solved = await w.call("post", `/meals/${mealId}/auto-solve`, w.tokens.ptA, { fixedItemIds: [broccoliItem.id] });

    expect(solved.status).toBe(200);
    expect(Object.fromEntries(solved.body.meals[0].items.map((item: { foodId: number; grams: number }) => [item.foodId, item.grams]))).toEqual({
      [chicken]: 425,
      [rice]: 755,
      [broccoli]: 300,
    });
  });

  it("splits the day target: with 2 equal meals the meal gets half", async () => {
    await w.ds.getRepository(User).update({ id: w.ids.mine }, { preferredMealCount: 2 });

    const day = await createDay(FRIDAY);

    await setTarget(w.ids.mine);
    await addItem(day.meals[0].id, rice);

    const solved = await w.call("post", `/meals/${day.meals[0].id}/auto-solve`, w.tokens.ptA, { fixedItemIds: [] });

    // Meal target P 80 / C 118 / F 28; rice alone: 441.6 g -> 440 g.
    expect(solved.body.meals[0].items[0].grams).toBe(440);
  });

  it("uses a custom split of the day target", async () => {
    await w.ds.getRepository(User).update({ id: w.ids.mine }, { preferredMealCount: 2 });

    const day = await createDay(FRIDAY);

    await setTarget(w.ids.mine, { carbs: 200, protein: 0, fat: 0 });
    await w.call("put", `/meal-plan-days/${day.id}/meals/shares`, w.tokens.ptA, {
      shares: [{ mealId: day.meals[0].id, percent: 25 }, { mealId: day.meals[1].id, percent: 75 }],
    });
    await addItem(day.meals[1].id, rice);

    // 75% of 200 g carbs = 150 g; least squares with rice's 2.7 g protein: 0.282 x 150 / (0.027^2 + 0.282^2) = 527 g -> 525 g.
    const solved = await w.call("post", `/meals/${day.meals[1].id}/auto-solve`, w.tokens.ptA, { fixedItemIds: [] });

    expect(solved.body.meals[1].items[0].grams).toBe(525);
  });

  it("says so when the trainee has no target: 409 NO_TARGET", async () => {
    const day = await oneMealDay();

    await w.ds.getRepository(NutritionTarget).createQueryBuilder().delete().execute();
    await addItem(day.meals[0].id, chicken, 77);

    const response = await w.call("post", `/meals/${day.meals[0].id}/auto-solve`, w.tokens.ptA, { fixedItemIds: [] });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "NO_TARGET", message: "Chưa có mục tiêu dinh dưỡng cho ngày này, đặt mục tiêu trước" });
    expect((await w.ds.getRepository(MealPlanItem).find())[0].grams).toBe(77);
  });

  it("refuses an empty meal, all-fixed foods and fixed ids from another meal", async () => {
    const day = await oneMealDay();
    const mealId = day.meals[0].id;
    const empty = await w.call("post", `/meals/${mealId}/auto-solve`, w.tokens.ptA, { fixedItemIds: [] });

    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({ code: "NOTHING_TO_SOLVE", message: "Thêm ít nhất một món cần tính gram" });

    const withItem = await addItem(mealId, chicken, 90);
    const itemId = withItem.meals[0].items[0].id;

    expect((await w.call("post", `/meals/${mealId}/auto-solve`, w.tokens.ptA, { fixedItemIds: [itemId] })).body.code).toBe("NOTHING_TO_SOLVE");

    const foreign = await w.call("post", `/meals/${mealId}/auto-solve`, w.tokens.ptA, { fixedItemIds: [9999] });

    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "ITEM_NOT_FOUND", message: "Món này không còn trong bữa" });
    expect((await w.ds.getRepository(MealPlanItem).findOneByOrFail({ id: itemId })).grams).toBe(90);
  });

  it("solves with an archived food already in the meal", async () => {
    const day = await oneMealDay();
    const mealId = day.meals[0].id;

    await addItem(mealId, chicken);
    await w.ds.query(`UPDATE foods SET archived_at = now() WHERE id = $1`, [chicken]);

    const solved = await w.call("post", `/meals/${mealId}/auto-solve`, w.tokens.ptA, { fixedItemIds: [] });

    // Protein 160 / 0.31 = 516 g -> 515 g.
    expect(solved.body.meals[0].items[0].grams).toBe(515);
    await w.ds.query(`UPDATE foods SET archived_at = NULL WHERE id = $1`, [chicken]);
  });

  it("never saves more than 3000 g of a lean food", async () => {
    const day = await oneMealDay();
    const lean = await seedFood(w.ds, { protein: 1, carbs: 0, fat: 0 });

    await addItem(day.meals[0].id, lean);

    const solved = await w.call("post", `/meals/${day.meals[0].id}/auto-solve`, w.tokens.ptA, { fixedItemIds: [] });

    // Protein 160 g would need 16000 g of it: a plan accepts 3000 g at most.
    expect(solved.body.meals[0].items[0].grams).toBe(3000);
  });
});

describe("copy-info, copy and apply-last-week", () => {
  const seedPlans = async () => {
    const day = await createDay(FRIDAY);
    const renamed = await w.call("patch", `/meals/${day.meals[0].id}`, w.tokens.ptA, { name: "Pre" });

    await addItem(day.meals[0].id, chicken, 250);
    await addItem(day.meals[1].id, rice, 300);
    await w.call("put", `/meal-plan-days/${day.id}/meals/shares`, w.tokens.ptA, {
      shares: day.meals.map((m, i) => ({ mealId: m.id, percent: [20, 30, 50][i] })),
    });
    expect(renamed.status).toBe(200);
    return day;
  };

  const shape = () => [
    [0, "Pre", 20, [[chicken, 250]]],
    [1, "Bữa trưa", 30, [[rice, 300]]],
    [2, "Bữa tối", 50, []],
  ];

  it("copies meals, foods, grams and shares to two days; the source stays; copies are independent", async () => {
    const day = await seedPlans();
    const result = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/copy`, w.tokens.ptA, { dayId: day.id, dates: [SATURDAY, "2026-11-20"] });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ copied: 2, skipped: 0 });
    expect(await dump(w.ids.mine)).toEqual([
      [FRIDAY, shape()],
      [SATURDAY, shape()],
      ["2026-11-20", shape()],
    ]);

    const saturday = (await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days?week=${SATURDAY}`, w.tokens.ptA)).body.days.find((d: Day) => d.date === SATURDAY);

    await w.call("patch", `/meal-items/${saturday.meals[0].items[0].id}`, w.tokens.ptA, { grams: 10 });
    expect((await dump(w.ids.mine))[0][1][0][3]).toEqual([[chicken, 250]]);
  });

  it("replaces a plan the target day already had, with its logs", async () => {
    const day = await seedPlans();
    const saturday = await createDay(SATURDAY);

    await addItem(saturday.meals[0].id, broccoli, 50);
    await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: saturday.meals[0].id, customName: "x", grams: 0 });

    const result = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/copy`, w.tokens.ptA, { dayId: day.id, dates: [SATURDAY] });

    expect(result.body).toEqual({ copied: 1, skipped: 0 });
    expect(await dump(w.ids.mine)).toEqual([[FRIDAY, shape()], [SATURDAY, shape()]]);
    expect(await w.ds.getRepository(MealLog).count()).toBe(0);
    expect(await w.ds.getRepository(MealPlanDay).count()).toBe(2);
  });

  it("ignores the source date and repeats; refuses an empty or invalid list", async () => {
    const day = await seedPlans();
    const path = `/trainees/${w.ids.mine}/meal-plan-days/copy`;
    const same = await w.call("post", path, w.tokens.ptA, { dayId: day.id, dates: [FRIDAY] });

    expect(same.status).toBe(400);
    expect(same.body).toMatchObject({ code: "NO_TARGET_DAYS", message: "Chọn ít nhất một ngày" });
    expect((await w.call("post", path, w.tokens.ptA, { dayId: day.id, dates: [] })).status).toBe(400);
    expect((await w.call("post", path, w.tokens.ptA, { dayId: day.id, dates: ["2026-02-30"] })).status).toBe(400);
    expect((await w.call("post", path, w.tokens.ptA, { dayId: day.id, dates: Array.from({ length: 15 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`) })).status).toBe(400);

    const repeats = await w.call("post", path, w.tokens.ptA, { dayId: day.id, dates: [SATURDAY, SATURDAY, FRIDAY] });

    expect(repeats.body).toEqual({ copied: 1, skipped: 0 });
  });

  it("allows today and the future but rejects the whole request when one date is past", async () => {
    const day = await seedPlans();
    const path = `/trainees/${w.ids.mine}/meal-plan-days/copy`;
    const past = await createDay("2026-11-10");

    await addItem(past.meals[0].id, broccoli, 70);

    const rejected = await w.call("post", path, w.tokens.ptA, { dayId: day.id, dates: [SATURDAY, "2026-11-10"] });

    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({ code: "PAST_TARGET_DAYS", message: "Không thể sao chép sang ngày đã qua." });
    // Nothing written, and the past day keeps its plan.
    expect((await dump(w.ids.mine)).map((d) => d[0])).toEqual(["2026-11-10", FRIDAY]);
    expect((await dump(w.ids.mine))[0][1][0][3]).toEqual([[broccoli, 70]]);

    const today = await w.call("post", path, w.tokens.ptA, { dayId: day.id, dates: [TODAY] });

    expect(today.body).toEqual({ copied: 1, skipped: 0 });
  });

  it("cannot copy a day of another trainee", async () => {
    const theirs = await createDay(FRIDAY, w.ids.theirs, w.tokens.ptB);
    const response = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/copy`, w.tokens.ptA, { dayId: theirs.id, dates: [SATURDAY] });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("DAY_NOT_FOUND");
    expect(await w.ds.getRepository(MealPlanDay).count({ where: { userId: w.ids.mine } })).toBe(0);
  });

  it("lists plan dates and log dates of a range, and validates the range", async () => {
    const day = await seedPlans();

    await createDay(SATURDAY);
    await w.ds.getRepository(MealLog).save({ userId: w.ids.mine, mealId: day.meals[0].id, customName: "x", grams: 0 });
    await w.ds.getRepository(MealMark).save({ mealId: (await createDayMeals(SATURDAY))[0], userId: w.ids.mine, achieved: false, note: "ghi chú" });
    await createDay("2026-12-30");

    const info = await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days/copy-info?from=2026-11-01&to=2026-12-01`, w.tokens.ptA);

    expect(info.status).toBe(200);
    expect(info.body).toEqual({ planDates: [FRIDAY, SATURDAY], logDates: [FRIDAY, SATURDAY] });
    for (const query of ["from=2026-11-05&to=2026-11-01", "from=2026-01-01&to=2026-12-31", "from=x&to=y", ""]) {
      expect((await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days/copy-info?${query}`, w.tokens.ptA)).status, query).toBe(400);
    }
  });

  const createDayMeals = async (date: string) => {
    const row = await w.ds.getRepository(MealPlanDay).findOneByOrFail({ userId: w.ids.mine, date });

    return (await w.ds.getRepository(MealPlanMeal).find({ where: { dayId: row.id }, order: { position: "ASC" } })).map((m) => m.id);
  };

  describe("apply-last-week", () => {
    const lastWeek = async () => {
      for (const date of ["2026-11-02", "2026-11-04"]) {
        await createDay(date);
      }

      const mondayMeals = await createDayMeals("2026-11-02");
      const wednesdayMeals = await createDayMeals("2026-11-04");

      await addItem(mondayMeals[0], chicken, 250);
      await addItem(wednesdayMeals[2], rice, 300);
    };

    it("copies each day to the same weekday of the week, exactly", async () => {
      await lastWeek();

      const result = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/apply-last-week`, w.tokens.ptA, { weekStart: "2026-11-09" });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ copied: 2, skipped: 0 });

      const rows = await dump(w.ids.mine);

      expect(rows.map((d) => d[0])).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11"]);
      expect(rows[2][1][0][3]).toEqual([[chicken, 250]]);
      expect(rows[3][1][2][3]).toEqual([[rice, 300]]);
      expect(rows[2][1].map((m) => m[1])).toEqual(["Bữa sáng", "Bữa trưa", "Bữa tối"]);
    });

    it("is never applied by itself: reading the next week changes nothing", async () => {
      await lastWeek();

      const week = await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days?week=2026-11-09`, w.tokens.ptA);

      expect(week.body.days).toEqual([]);
      expect(week.body.lastWeekPlanCount).toBe(2);
      expect(await w.ds.getRepository(MealPlanDay).count()).toBe(2);
    });

    it("keeps a day that already has a plan", async () => {
      await lastWeek();

      const existing = await createDay("2026-11-09");

      await addItem(existing.meals[0].id, rice, 40);

      const result = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/apply-last-week`, w.tokens.ptA, { weekStart: "2026-11-09" });

      expect(result.body).toEqual({ copied: 1, skipped: 1 });

      const rows = await dump(w.ids.mine);

      expect(rows.map((d) => d[0])).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11"]);
      expect(rows[2][1][0][3]).toEqual([[rice, 40]]);
    });

    it("snaps any date of the week to its Monday", async () => {
      await lastWeek();

      const result = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/apply-last-week`, w.tokens.ptA, { weekStart: "2026-11-12" });

      expect(result.body).toEqual({ copied: 2, skipped: 0 });
    });

    it("says when last week has no plan: 404 NO_LAST_WEEK", async () => {
      await lastWeek();

      const response = await w.call("post", `/trainees/${w.ids.mine}/meal-plan-days/apply-last-week`, w.tokens.ptA, { weekStart: "2026-11-02" });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "NO_LAST_WEEK", message: "Tuần trước chưa có plan nào" });
    });

    it("does not copy another trainee's plans", async () => {
      await lastWeek();
      await createDay("2026-11-02", w.ids.theirs, w.tokens.ptB);

      const response = await w.call("post", `/trainees/${w.ids.theirs}/meal-plan-days/apply-last-week`, w.tokens.ptB, { weekStart: "2026-11-09" });

      expect(response.body).toEqual({ copied: 1, skipped: 0 });
      expect((await dump(w.ids.mine)).map((d) => d[0])).toEqual(["2026-11-02", "2026-11-04"]);
    });
  });
});

describe("DELETE /meal-plan-days/:dayId", () => {
  it("removes the day, its meals, foods, logs and marks only", async () => {
    const keep = await createDay(FRIDAY);
    const gone = await createDay(SATURDAY);

    await addItem(keep.meals[0].id, chicken, 100);
    await addItem(gone.meals[0].id, rice, 100);
    await w.ds.getRepository(MealLog).save([
      { userId: w.ids.mine, mealId: gone.meals[0].id, customName: "x", grams: 0 },
      { userId: w.ids.mine, mealId: keep.meals[0].id, customName: "y", grams: 0 },
    ]);
    await w.ds.getRepository(MealMark).save({ mealId: gone.meals[0].id, userId: w.ids.mine, achieved: true, note: "" });

    const response = await w.call("delete", `/meal-plan-days/${gone.id}`, w.tokens.ptA);

    expect(response.status).toBe(204);
    expect(await dump(w.ids.mine)).toEqual([[FRIDAY, [[0, "Bữa sáng", null, [[chicken, 100]]], [1, "Bữa trưa", null, []], [2, "Bữa tối", null, []]]]]);
    expect(await w.ds.getRepository(MealLog).find()).toMatchObject([{ customName: "y" }]);
    expect(await w.ds.getRepository(MealMark).count()).toBe(0);

    const again = await w.call("delete", `/meal-plan-days/${gone.id}`, w.tokens.ptA);

    expect(again.status).toBe(404);
    expect(again.body.code).toBe("DAY_NOT_FOUND");
  });
});

describe("GET /trainees/:userId/meal-plan-days", () => {
  it("returns the week's plan, completion, notices and the data of the copy sheet", async () => {
    await setTarget(w.ids.mine, { carbs: 100, protein: 100, fat: 0 });

    const day = await createDay(FRIDAY);

    // Plan: 100 g chicken = P 31 F 3.6 -> 156.4 kcal vs target 800: -644.
    await addItem(day.meals[0].id, chicken, 100);
    await createDay("2026-11-02");
    await createDay("2026-11-17");

    const response = await w.call("get", `/trainees/${w.ids.mine}/meal-plan-days?week=${FRIDAY}`, w.tokens.ptA);

    expect(response.status).toBe(200);
    expect(response.body.weekStart).toBe("2026-11-09");
    expect(response.body.days.map((d: Day) => d.date)).toEqual([FRIDAY]);
    expect(response.body.completion).toEqual({
      "2026-11-09": "none", "2026-11-10": "none", "2026-11-11": "none", "2026-11-12": "none",
      [FRIDAY]: "none", [SATURDAY]: "none", "2026-11-15": "none",
    });
    expect(response.body.lastWeekPlanCount).toBe(1);
    expect(response.body.nextWeekPlanDates).toEqual(["2026-11-17"]);
    expect(response.body.planKcalNotices).toEqual([{ date: FRIDAY, gapKcal: -644 }]);
    expect(response.body.datesWithLogs).toEqual([]);
    expect(response.body.preferences).toEqual({ preferredMealCount: null, foodNote: null });
  });
});
