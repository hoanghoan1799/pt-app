import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  foods,
  mealMarkItems,
  mealMarks,
  mealPlanDays,
  mealPlanItems,
  mealPlanMeals,
  nutritionTargets,
  users,
} from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "admin",
  userId: 1,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/session", () => ({
  readSession: vi.fn(async () =>
    state.role === "admin"
      ? { role: "admin", adminId: 1 }
      : { role: "user", userId: state.userId },
  ),
}));
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({ id, username: "pt" })),
}));
vi.mock("@/services/users", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const schema = await import("@/db/schema");

  return {
    findUserById: async (id: number) => {
      const db = state.db as TestDb;
      const [row] = await db
        .select()
        .from(schema.users)
        .where(equals(schema.users.id, id));

      return row ?? null;
    },
  };
});
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const actions =
  await import("@/features/meal-plans/services/meal-plan-actions");
const { saveMealPreferencesAction } =
  await import("@/features/meal-plans/services/meal-preferences-actions");
const { getMealPlanWeek } =
  await import("@/features/meal-plans/services/meal-plan-queries");

let db: TestDb;

const FOODS = {
  chicken: {
    name: "Ức gà (chín)",
    group: "meat",
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
  },
  rice: {
    name: "Cơm trắng (chín)",
    group: "starch",
    kcal: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3,
  },
  broccoli: {
    name: "Bông cải xanh (luộc)",
    group: "vegetable",
    kcal: 35,
    protein: 2.4,
    carbs: 7.2,
    fat: 0.4,
  },
  oil: {
    name: "Dầu ô liu",
    group: "fat_oil",
    kcal: 884,
    protein: 0,
    carbs: 0,
    fat: 100,
  },
} as const;

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";
const NEXT_MONDAY = "2026-11-09";

const seed = async () => {
  const [member, other] = await db
    .insert(users)
    .values([
      { name: "Member", nameKey: "member" },
      { name: "Other", nameKey: "other" },
    ])
    .returning();
  const rows = await db
    .insert(foods)
    .values(
      Object.values(FOODS).map((food) => ({
        ...food,
        nameKey: food.name.toLowerCase(),
        source: "test",
      })),
    )
    .returning();
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));

  return {
    member,
    other,
    chicken: byName[FOODS.chicken.name],
    rice: byName[FOODS.rice.name],
    broccoli: byName[FOODS.broccoli.name],
    oil: byName[FOODS.oil.name],
  };
};

const setTarget = (userId: number) =>
  db.insert(nutritionTargets).values({
    userId,
    effectiveFrom: "2026-01-01",
    protein: 160,
    carbs: 235,
    fat: 55,
    source: "manual",
  });

const expectRedirect = async (call: Promise<unknown>) => {
  await expect(call).rejects.toMatchObject({
    digest: expect.stringContaining("NEXT_REDIRECT"),
  });
};

const countAll = async () => ({
  days: (await db.select().from(mealPlanDays)).length,
  meals: (await db.select().from(mealPlanMeals)).length,
  items: (await db.select().from(mealPlanItems)).length,
});

beforeEach(async () => {
  // "Today" is Tuesday 2026-11-03 (Ho Chi Minh), so the copy tests below do
  // not depend on the real date. Only Date is faked; timers stay real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T05:00:00Z"));
  db = await createTestDb();
  state.db = db;
  state.role = "admin";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDayPlanAction", () => {
  it("starts with 3 meals named sáng, trưa, tối", async () => {
    const { member } = await seed();
    const result = await actions.createDayPlanAction({
      userId: member.id,
      date: MONDAY,
    });

    expect(result).toEqual({ status: "success" });

    const [week] = await getMealPlanWeek(member.id, MONDAY);

    expect(week.date).toBe(MONDAY);
    expect(week.meals.map((meal) => [meal.position, meal.name])).toEqual([
      [0, "Bữa sáng"],
      [1, "Bữa trưa"],
      [2, "Bữa tối"],
    ]);
  });

  it("starts with the trainee's 5 meals, snacks after dinner", async () => {
    const { member } = await seed();

    await db.update(users).set({ preferredMealCount: 5 });
    await actions.createDayPlanAction({ userId: member.id, date: MONDAY });

    const [day] = await getMealPlanWeek(member.id, MONDAY);

    expect(day.meals.map((meal) => meal.name)).toEqual([
      "Bữa sáng",
      "Bữa trưa",
      "Bữa tối",
      "Bữa phụ 1",
      "Bữa phụ 2",
    ]);
  });

  it("ignores a stored count outside 2-6", async () => {
    const { member } = await seed();

    await db.update(users).set({ preferredMealCount: 9 });
    await actions.createDayPlanAction({ userId: member.id, date: MONDAY });

    expect((await countAll()).meals).toBe(3);
  });

  it("refuses a second plan for the same day and keeps the first", async () => {
    const { member } = await seed();

    await actions.createDayPlanAction({ userId: member.id, date: MONDAY });

    const again = await actions.createDayPlanAction({
      userId: member.id,
      date: MONDAY,
    });

    expect(again).toEqual({ status: "error", message: "Ngày này đã có plan" });
    expect(await countAll()).toMatchObject({ days: 1, meals: 3 });
  });

  it("refuses a bad date, an unknown member and writes nothing", async () => {
    const { member } = await seed();

    expect(
      await actions.createDayPlanAction({
        userId: member.id,
        date: "2026-02-30",
      }),
    ).toMatchObject({
      status: "error",
      message: "Vui lòng kiểm tra lại thông tin",
    });
    expect(
      await actions.createDayPlanAction({ userId: 999, date: MONDAY }),
    ).toEqual({ status: "error", message: "Không tìm thấy học viên" });
    expect((await countAll()).days).toBe(0);
  });

  it("is admin only", async () => {
    const { member } = await seed();

    state.role = "user";
    await expectRedirect(
      actions.createDayPlanAction({ userId: member.id, date: MONDAY }),
    );
    expect((await countAll()).days).toBe(0);
  });
});

describe("meals", () => {
  const setup = async () => {
    const data = await seed();

    await actions.createDayPlanAction({ userId: data.member.id, date: MONDAY });

    const [day] = await getMealPlanWeek(data.member.id, MONDAY);

    return { ...data, day };
  };

  it("adds the next default name and removes with positions closing up", async () => {
    const { member, day } = await setup();

    await actions.addMealAction({ userId: member.id, dayId: day.id });

    let [current] = await getMealPlanWeek(member.id, MONDAY);

    expect(current.meals.map((meal) => meal.name)).toEqual([
      "Bữa sáng",
      "Bữa trưa",
      "Bữa tối",
      "Bữa phụ 1",
    ]);

    await actions.removeMealAction({
      userId: member.id,
      mealId: current.meals[1].id,
    });
    [current] = await getMealPlanWeek(member.id, MONDAY);
    expect(current.meals.map((meal) => [meal.position, meal.name])).toEqual([
      [0, "Bữa sáng"],
      [1, "Bữa tối"],
      [2, "Bữa phụ 1"],
    ]);
  });

  it("removing a meal deletes its foods", async () => {
    const { member, day, chicken } = await setup();

    await actions.addItemAction({
      userId: member.id,
      mealId: day.meals[0].id,
      foodId: chicken.id,
    });
    expect((await countAll()).items).toBe(1);
    await actions.removeMealAction({
      userId: member.id,
      mealId: day.meals[0].id,
    });
    expect(await countAll()).toMatchObject({ meals: 2, items: 0 });
  });

  it("keeps the last meal", async () => {
    const { member, day } = await setup();

    await actions.removeMealAction({
      userId: member.id,
      mealId: day.meals[0].id,
    });
    await actions.removeMealAction({
      userId: member.id,
      mealId: day.meals[1].id,
    });
    expect(
      await actions.removeMealAction({
        userId: member.id,
        mealId: day.meals[2].id,
      }),
    ).toEqual({
      status: "error",
      message: "Plan cần ít nhất một bữa. Xóa cả plan nếu không dùng nữa.",
    });
    expect((await countAll()).meals).toBe(1);
  });

  it("limits a day to 10 meals", async () => {
    const { member, day } = await setup();

    for (let i = 0; i < 7; i += 1) {
      await actions.addMealAction({ userId: member.id, dayId: day.id });
    }
    expect((await countAll()).meals).toBe(10);
    expect(
      await actions.addMealAction({ userId: member.id, dayId: day.id }),
    ).toEqual({ status: "error", message: "Một ngày tối đa 10 bữa" });
  });

  it("renames with collapsed spaces and refuses an empty or long name", async () => {
    const { member, day } = await setup();
    const mealId = day.meals[0].id;

    expect(
      await actions.renameMealAction({
        userId: member.id,
        mealId,
        name: "  Trước   tập ",
      }),
    ).toEqual({ status: "success" });
    expect((await getMealPlanWeek(member.id, MONDAY))[0].meals[0].name).toBe(
      "Trước tập",
    );
    expect(
      await actions.renameMealAction({
        userId: member.id,
        mealId,
        name: "   ",
      }),
    ).toMatchObject({ status: "error" });
    expect(
      await actions.renameMealAction({
        userId: member.id,
        mealId,
        name: "x".repeat(41),
      }),
    ).toMatchObject({ status: "error" });
    expect((await getMealPlanWeek(member.id, MONDAY))[0].meals[0].name).toBe(
      "Trước tập",
    );
  });

  it("reorders and refuses a list that is not exactly the day's meals", async () => {
    const { member, day } = await setup();
    const [a, b, c] = day.meals.map((meal) => meal.id);

    expect(
      await actions.reorderMealsAction({
        userId: member.id,
        dayId: day.id,
        mealIds: [c, a, b],
      }),
    ).toEqual({ status: "success" });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals.map(
        (meal) => meal.id,
      ),
    ).toEqual([c, a, b]);

    for (const mealIds of [
      [a, b],
      [a, a, b],
      [a, b, c, 9999],
      [a, b, 9999],
    ]) {
      expect(
        await actions.reorderMealsAction({
          userId: member.id,
          dayId: day.id,
          mealIds,
        }),
      ).toEqual({
        status: "error",
        message: "Danh sách bữa đã thay đổi, tải lại trang",
      });
    }
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals.map(
        (meal) => meal.id,
      ),
    ).toEqual([c, a, b]);
  });

  it("sets shares that total 100 and resets them to equal", async () => {
    const { member, day } = await setup();
    const ids = day.meals.map((meal) => meal.id);

    expect(
      await actions.setMealSharesAction({
        userId: member.id,
        dayId: day.id,
        shares: [
          { mealId: ids[0], percent: 30 },
          { mealId: ids[1], percent: 50 },
          { mealId: ids[2], percent: 20 },
        ],
      }),
    ).toEqual({ status: "success" });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals.map(
        (m) => m.sharePercent,
      ),
    ).toEqual([30, 50, 20]);

    // Adding a meal drops the split: the total would no longer be 100.
    await actions.addMealAction({ userId: member.id, dayId: day.id });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals.map(
        (m) => m.sharePercent,
      ),
    ).toEqual([null, null, null, null]);
  });

  it("refuses shares totalling 99 or 101, or missing a meal, and keeps the old ones", async () => {
    const { member, day } = await setup();
    const ids = day.meals.map((meal) => meal.id);
    const shares = (percents: number[]) =>
      percents.map((percent, index) => ({ mealId: ids[index], percent }));

    expect(
      await actions.setMealSharesAction({
        userId: member.id,
        dayId: day.id,
        shares: shares([30, 50, 19]),
      }),
    ).toEqual({
      status: "error",
      message: "Tổng phần trăm các bữa phải bằng 100",
    });
    expect(
      await actions.setMealSharesAction({
        userId: member.id,
        dayId: day.id,
        shares: shares([30, 50, 21]),
      }),
    ).toEqual({
      status: "error",
      message: "Tổng phần trăm các bữa phải bằng 100",
    });
    expect(
      await actions.setMealSharesAction({
        userId: member.id,
        dayId: day.id,
        shares: shares([50, 50]),
      }),
    ).toMatchObject({ status: "error" });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals.map(
        (m) => m.sharePercent,
      ),
    ).toEqual([null, null, null]);
  });
});

describe("items", () => {
  const setup = async () => {
    const data = await seed();

    await actions.createDayPlanAction({ userId: data.member.id, date: MONDAY });

    const [day] = await getMealPlanWeek(data.member.id, MONDAY);

    return { ...data, day, meal: day.meals[0] };
  };

  it("adds 100 g by default, edits grams to one decimal and removes", async () => {
    const { member, meal, chicken } = await setup();

    await actions.addItemAction({
      userId: member.id,
      mealId: meal.id,
      foodId: chicken.id,
    });

    let [item] = (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items;

    expect(item).toMatchObject({ foodId: chicken.id, grams: 100 });

    await actions.updateItemGramsAction({
      userId: member.id,
      itemId: item.id,
      grams: 212.46,
    });
    [item] = (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items;
    expect(item.grams).toBe(212.5);

    await actions.removeItemAction({ userId: member.id, itemId: item.id });
    expect((await countAll()).items).toBe(0);
  });

  it("refuses bad grams and leaves the old value", async () => {
    const { member, meal, chicken } = await setup();

    await actions.addItemAction({
      userId: member.id,
      mealId: meal.id,
      foodId: chicken.id,
      grams: 150,
    });

    const [item] = (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items;

    // 0 g (or 0.04 g, stored as 0) is not an amount: remove the food instead.
    for (const grams of [
      0,
      0.04,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      3001,
    ]) {
      expect(
        await actions.updateItemGramsAction({
          userId: member.id,
          itemId: item.id,
          grams,
        }),
      ).toMatchObject({ status: "error" });
    }
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items[0].grams,
    ).toBe(150);
  });

  it("refuses the same food twice in a meal, and a food that does not exist", async () => {
    const { member, meal, chicken } = await setup();

    await actions.addItemAction({
      userId: member.id,
      mealId: meal.id,
      foodId: chicken.id,
    });
    expect(
      await actions.addItemAction({
        userId: member.id,
        mealId: meal.id,
        foodId: chicken.id,
      }),
    ).toEqual({ status: "error", message: "Món này đã có trong bữa" });
    expect(
      await actions.addItemAction({
        userId: member.id,
        mealId: meal.id,
        foodId: 9999,
      }),
    ).toEqual({ status: "error", message: "Món này không còn trong thư viện" });
    expect((await countAll()).items).toBe(1);
  });

  it("refuses an archived food for new items but still shows it in the plan", async () => {
    const { member, meal, chicken, rice } = await setup();

    await actions.addItemAction({
      userId: member.id,
      mealId: meal.id,
      foodId: chicken.id,
      grams: 200,
    });
    await db
      .update(foods)
      .set({ archivedAt: new Date() })
      .where(eq(foods.id, chicken.id));
    await db
      .update(foods)
      .set({ archivedAt: new Date() })
      .where(eq(foods.id, rice.id));

    expect(
      await actions.addItemAction({
        userId: member.id,
        mealId: meal.id,
        foodId: rice.id,
      }),
    ).toEqual({ status: "error", message: "Món này không còn trong thư viện" });

    const [item] = (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items;

    expect(item).toMatchObject({ grams: 200 });
    expect(item.food).toMatchObject({
      name: "Ức gà (chín)",
      protein: 31,
      fat: 3.6,
      isArchived: true,
    });
  });

  it("limits a meal to 20 foods", async () => {
    const { member, meal } = await setup();
    const extra = await db
      .insert(foods)
      .values(
        Array.from({ length: 21 }, (_, i) => ({
          name: `Món ${i}`,
          nameKey: `mon ${i}`,
          group: "other" as const,
          kcal: 10,
          protein: 1,
          carbs: 1,
          fat: 0,
        })),
      )
      .returning();

    for (const food of extra.slice(0, 20)) {
      await actions.addItemAction({
        userId: member.id,
        mealId: meal.id,
        foodId: food.id,
      });
    }
    expect(
      await actions.addItemAction({
        userId: member.id,
        mealId: meal.id,
        foodId: extra[20].id,
      }),
    ).toEqual({ status: "error", message: "Một bữa tối đa 20 món" });
    expect((await countAll()).items).toBe(20);
  });
});

describe("another member's ids", () => {
  it("cannot be used to read or change a plan that is not the member's", async () => {
    const { member, other, chicken } = await seed();

    await actions.createDayPlanAction({ userId: other.id, date: MONDAY });

    const [theirDay] = await getMealPlanWeek(other.id, MONDAY);
    const theirMeal = theirDay.meals[0];

    await actions.addItemAction({
      userId: other.id,
      mealId: theirMeal.id,
      foodId: chicken.id,
      grams: 120,
    });

    const [theirItem] = (await getMealPlanWeek(other.id, MONDAY))[0].meals[0]
      .items;
    const before = await countAll();
    const notYours = (message: string) => ({ status: "error", message });

    expect(
      await actions.addMealAction({ userId: member.id, dayId: theirDay.id }),
    ).toEqual(notYours("Ngày này không có plan"));
    expect(
      await actions.deleteDayPlanAction({
        userId: member.id,
        dayId: theirDay.id,
      }),
    ).toEqual(notYours("Ngày này không có plan"));
    expect(
      await actions.removeMealAction({
        userId: member.id,
        mealId: theirMeal.id,
      }),
    ).toEqual(notYours("Bữa này không còn tồn tại"));
    expect(
      await actions.renameMealAction({
        userId: member.id,
        mealId: theirMeal.id,
        name: "Hack",
      }),
    ).toEqual(notYours("Bữa này không còn tồn tại"));
    expect(
      await actions.addItemAction({
        userId: member.id,
        mealId: theirMeal.id,
        foodId: chicken.id,
      }),
    ).toEqual(notYours("Bữa này không còn tồn tại"));
    expect(
      await actions.updateItemGramsAction({
        userId: member.id,
        itemId: theirItem.id,
        grams: 1,
      }),
    ).toEqual(notYours("Món này không còn trong bữa"));
    expect(
      await actions.removeItemAction({
        userId: member.id,
        itemId: theirItem.id,
      }),
    ).toEqual(notYours("Món này không còn trong bữa"));
    expect(
      await actions.copyDayAction({
        userId: member.id,
        dayId: theirDay.id,
        dates: [TUESDAY],
      }),
    ).toEqual(notYours("Ngày này không có plan"));
    expect(
      await actions.reorderMealsAction({
        userId: member.id,
        dayId: theirDay.id,
        mealIds: [theirMeal.id],
      }),
    ).toEqual(notYours("Ngày này không có plan"));
    expect(
      await actions.autoSolveMealAction({
        userId: member.id,
        mealId: theirMeal.id,
        fixedItemIds: [],
      }),
    ).toEqual(notYours("Bữa này không còn tồn tại"));

    expect(await countAll()).toEqual(before);
    expect(
      (await getMealPlanWeek(other.id, MONDAY))[0].meals[0].items[0],
    ).toMatchObject({ grams: 120 });
    expect((await getMealPlanWeek(other.id, MONDAY))[0].meals[0].name).toBe(
      "Bữa sáng",
    );
  });
});

describe("autoSolveMealAction", () => {
  // The spec's worked example in one meal: the day has one meal, so the meal
  // target is the whole day, P 160 / C 235 / F 55.
  const setup = async () => {
    const data = await seed();

    await db.update(users).set({ preferredMealCount: 2 });
    await actions.createDayPlanAction({ userId: data.member.id, date: MONDAY });

    const [day] = await getMealPlanWeek(data.member.id, MONDAY);

    await actions.removeMealAction({
      userId: data.member.id,
      mealId: day.meals[1].id,
    });
    await setTarget(data.member.id);

    return { ...data, mealId: day.meals[0].id };
  };

  it("saves 425 g chicken and 755 g rice around 300 g fixed broccoli", async () => {
    const { member, mealId, chicken, rice, broccoli } = await setup();

    for (const food of [chicken, rice, broccoli]) {
      await actions.addItemAction({
        userId: member.id,
        mealId,
        foodId: food.id,
      });
    }

    const items = (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items;
    const broccoliItem = items.find((item) => item.foodId === broccoli.id)!;

    await actions.updateItemGramsAction({
      userId: member.id,
      itemId: broccoliItem.id,
      grams: 300,
    });

    const result = await actions.autoSolveMealAction({
      userId: member.id,
      mealId,
      fixedItemIds: [broccoliItem.id],
    });

    expect(result).toEqual({ status: "success" });

    const solved = (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items;

    expect(
      Object.fromEntries(solved.map((item) => [item.food.name, item.grams])),
    ).toEqual({
      "Ức gà (chín)": 425,
      "Cơm trắng (chín)": 755,
      "Bông cải xanh (luộc)": 300,
    });
  });

  it("splits the day target: with 2 equal meals the meal gets half", async () => {
    const data = await seed();

    await db.update(users).set({ preferredMealCount: 2 });
    await actions.createDayPlanAction({ userId: data.member.id, date: MONDAY });
    await setTarget(data.member.id);

    const [day] = await getMealPlanWeek(data.member.id, MONDAY);
    const mealId = day.meals[0].id;

    await actions.addItemAction({
      userId: data.member.id,
      mealId,
      foodId: data.rice.id,
    });
    await actions.autoSolveMealAction({
      userId: data.member.id,
      mealId,
      fixedItemIds: [],
    });

    // Meal target: P 80 / C 118 / F 28 (117.5 and 27.5 round up for the
    // earlier meal). Rice alone: r = (0.027 * 80 + 0.282 * 118 + tiny fat
    // term) / (0.027^2 + 0.282^2) = 35.437 / 0.080253 = 441.6 g -> 440 g.
    const [item] = (await getMealPlanWeek(data.member.id, MONDAY))[0].meals[0]
      .items;

    expect(item.grams).toBe(440);
  });

  it("says so when the member has no target", async () => {
    const { member, mealId, chicken } = await setup();

    await db.delete(nutritionTargets);
    await actions.addItemAction({
      userId: member.id,
      mealId,
      foodId: chicken.id,
      grams: 77,
    });

    expect(
      await actions.autoSolveMealAction({
        userId: member.id,
        mealId,
        fixedItemIds: [],
      }),
    ).toEqual({
      status: "error",
      message: "Chưa có mục tiêu dinh dưỡng cho ngày này, đặt mục tiêu trước",
    });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items[0].grams,
    ).toBe(77);
  });

  it("refuses an empty meal, all-fixed foods and fixed ids from another meal", async () => {
    const { member, mealId, chicken } = await setup();

    expect(
      await actions.autoSolveMealAction({
        userId: member.id,
        mealId,
        fixedItemIds: [],
      }),
    ).toEqual({
      status: "error",
      message: "Thêm ít nhất một món cần tính gram",
    });

    await actions.addItemAction({
      userId: member.id,
      mealId,
      foodId: chicken.id,
      grams: 90,
    });

    const [item] = (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items;

    expect(
      await actions.autoSolveMealAction({
        userId: member.id,
        mealId,
        fixedItemIds: [item.id],
      }),
    ).toEqual({
      status: "error",
      message: "Thêm ít nhất một món cần tính gram",
    });
    expect(
      await actions.autoSolveMealAction({
        userId: member.id,
        mealId,
        fixedItemIds: [9999],
      }),
    ).toEqual({ status: "error", message: "Món này không còn trong bữa" });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items[0].grams,
    ).toBe(90);
  });

  it("solves with an archived food already in the meal", async () => {
    const { member, mealId, chicken } = await setup();

    await actions.addItemAction({
      userId: member.id,
      mealId,
      foodId: chicken.id,
    });
    await db
      .update(foods)
      .set({ archivedAt: new Date() })
      .where(eq(foods.id, chicken.id));

    expect(
      await actions.autoSolveMealAction({
        userId: member.id,
        mealId,
        fixedItemIds: [],
      }),
    ).toEqual({ status: "success" });
    // Protein 160 / 0.31 = 516 g.
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items[0].grams,
    ).toBe(515);
  });
});

describe("copyDayAction", () => {
  const setup = async () => {
    const data = await seed();

    await actions.createDayPlanAction({ userId: data.member.id, date: MONDAY });

    const [day] = await getMealPlanWeek(data.member.id, MONDAY);

    await actions.renameMealAction({
      userId: data.member.id,
      mealId: day.meals[0].id,
      name: "Pre",
    });
    await actions.addItemAction({
      userId: data.member.id,
      mealId: day.meals[0].id,
      foodId: data.chicken.id,
      grams: 250,
    });
    await actions.addItemAction({
      userId: data.member.id,
      mealId: day.meals[1].id,
      foodId: data.rice.id,
      grams: 300,
    });

    return { ...data, day };
  };

  const shape = (day: {
    meals: { name: string; items: { foodId: number; grams: number }[] }[];
  }) =>
    day.meals.map((meal) => [
      meal.name,
      meal.items.map((item) => [item.foodId, item.grams]),
    ]);

  it("copies meals, foods and grams to two days; the source stays", async () => {
    const { member, day } = await setup();
    const result = await actions.copyDayAction({
      userId: member.id,
      dayId: day.id,
      dates: [TUESDAY, "2026-11-04"],
    });

    expect(result).toEqual({ status: "success", copied: 2, skipped: 0 });

    const week = await getMealPlanWeek(member.id, MONDAY);

    expect(week.map((d) => d.date)).toEqual([MONDAY, TUESDAY, "2026-11-04"]);
    expect(shape(week[1])).toEqual(shape(week[0]));
    expect(shape(week[2])).toEqual(shape(week[0]));
    expect(shape(week[0])[0]).toEqual(["Pre", [[expect.any(Number), 250]]]);
    // Independent copies: editing Tuesday leaves Monday alone.
    await actions.updateItemGramsAction({
      userId: member.id,
      itemId: week[1].meals[0].items[0].id,
      grams: 10,
    });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items[0].grams,
    ).toBe(250);
  });

  it("replaces a plan the target day already had", async () => {
    const { member, day } = await setup();

    await actions.createDayPlanAction({ userId: member.id, date: TUESDAY });
    await actions.copyDayAction({
      userId: member.id,
      dayId: day.id,
      dates: [TUESDAY],
    });

    const week = await getMealPlanWeek(member.id, MONDAY);

    expect(week).toHaveLength(2);
    expect(shape(week[1])).toEqual(shape(week[0]));
    expect(await countAll()).toMatchObject({ days: 2, meals: 6, items: 4 });
  });

  it("ignores the source date, repeats, and refuses an empty or invalid list", async () => {
    const { member, day } = await setup();

    expect(
      await actions.copyDayAction({
        userId: member.id,
        dayId: day.id,
        dates: [MONDAY],
      }),
    ).toEqual({ status: "error", message: "Chọn ít nhất một ngày" });
    expect(
      await actions.copyDayAction({
        userId: member.id,
        dayId: day.id,
        dates: [],
      }),
    ).toMatchObject({ status: "error" });
    expect(
      await actions.copyDayAction({
        userId: member.id,
        dayId: day.id,
        dates: ["nope"],
      }),
    ).toMatchObject({ status: "error" });
    expect(
      await actions.copyDayAction({
        userId: member.id,
        dayId: day.id,
        dates: [TUESDAY, TUESDAY, MONDAY],
      }),
    ).toEqual({ status: "success", copied: 1, skipped: 0 });
    expect((await countAll()).days).toBe(2);
  });

  describe("target dates (KAN-121, today is Tuesday)", () => {
    const PAST_MESSAGE = "Không thể sao chép sang ngày đã qua.";
    const SUNDAY = "2026-11-01";
    const WEDNESDAY = "2026-11-04";

    it("rejects a past date and writes nothing", async () => {
      const { member, day } = await setup();
      const before = await countAll();

      expect(
        await actions.copyDayAction({
          userId: member.id,
          dayId: day.id,
          dates: [SUNDAY],
        }),
      ).toEqual({ status: "error", message: PAST_MESSAGE });
      expect(await countAll()).toEqual(before);
      expect(
        (await getMealPlanWeek(member.id, SUNDAY)).map((d) => d.date),
      ).toEqual([MONDAY]);
    });

    it("rejects the whole request when one date is past and the rest are valid", async () => {
      const { member, day } = await setup();
      const before = await countAll();

      expect(
        await actions.copyDayAction({
          userId: member.id,
          dayId: day.id,
          dates: [WEDNESDAY, SUNDAY, TUESDAY],
        }),
      ).toEqual({ status: "error", message: PAST_MESSAGE });
      expect(await countAll()).toEqual(before);
    });

    it("keeps the existing plan of a past date it refused to overwrite", async () => {
      const { member, day } = await setup();

      await actions.createDayPlanAction({ userId: member.id, date: SUNDAY });

      const before = await countAll();

      await actions.copyDayAction({
        userId: member.id,
        dayId: day.id,
        dates: [SUNDAY],
      });
      expect(await countAll()).toEqual(before);
    });

    it("allows today", async () => {
      const { member, day } = await setup();

      expect(
        await actions.copyDayAction({
          userId: member.id,
          dayId: day.id,
          dates: [TUESDAY],
        }),
      ).toEqual({ status: "success", copied: 1, skipped: 0 });
      expect(
        (await getMealPlanWeek(member.id, MONDAY)).map((d) => d.date),
      ).toEqual([MONDAY, TUESDAY]);
    });

    it("allows a future date", async () => {
      const { member, day } = await setup();

      expect(
        await actions.copyDayAction({
          userId: member.id,
          dayId: day.id,
          dates: [WEDNESDAY, NEXT_MONDAY],
        }),
      ).toEqual({ status: "success", copied: 2, skipped: 0 });
      expect((await countAll()).days).toBe(3);
    });
  });

  it("copies archived foods too", async () => {
    const { member, day, chicken } = await setup();

    await db
      .update(foods)
      .set({ archivedAt: new Date() })
      .where(eq(foods.id, chicken.id));
    await actions.copyDayAction({
      userId: member.id,
      dayId: day.id,
      dates: [TUESDAY],
    });

    expect(
      (await getMealPlanWeek(member.id, MONDAY))[1].meals[0].items[0].food
        .isArchived,
    ).toBe(true);
  });
});

describe("applyLastWeekAction", () => {
  const setup = async () => {
    const data = await seed();

    // Last week: Monday and Wednesday have plans.
    for (const date of ["2026-11-02", "2026-11-04"]) {
      await actions.createDayPlanAction({ userId: data.member.id, date });
    }

    const week = await getMealPlanWeek(data.member.id, "2026-11-02");

    await actions.addItemAction({
      userId: data.member.id,
      mealId: week[0].meals[0].id,
      foodId: data.chicken.id,
      grams: 250,
    });
    await actions.addItemAction({
      userId: data.member.id,
      mealId: week[1].meals[2].id,
      foodId: data.rice.id,
      grams: 300,
    });

    return data;
  };

  it("copies each day to the same weekday of the week", async () => {
    const { member, chicken } = await setup();
    const result = await actions.applyLastWeekAction({
      userId: member.id,
      weekStart: NEXT_MONDAY,
    });

    expect(result).toEqual({ status: "success", copied: 2, skipped: 0 });

    const week = await getMealPlanWeek(member.id, NEXT_MONDAY);

    expect(week.map((day) => day.date)).toEqual(["2026-11-09", "2026-11-11"]);
    expect(week[0].meals[0].items[0]).toMatchObject({
      foodId: chicken.id,
      grams: 250,
    });
    expect(week[1].meals[2].items[0]).toMatchObject({ grams: 300 });
  });

  it("is never applied by itself: nothing changes until the action runs", async () => {
    const { member } = await setup();

    expect(await getMealPlanWeek(member.id, NEXT_MONDAY)).toEqual([]);
  });

  it("keeps a day that already has a plan", async () => {
    const { member, rice } = await setup();

    await actions.createDayPlanAction({
      userId: member.id,
      date: "2026-11-09",
    });

    const [existing] = await getMealPlanWeek(member.id, NEXT_MONDAY);

    await actions.addItemAction({
      userId: member.id,
      mealId: existing.meals[0].id,
      foodId: rice.id,
      grams: 40,
    });

    const result = await actions.applyLastWeekAction({
      userId: member.id,
      weekStart: NEXT_MONDAY,
    });

    expect(result).toEqual({ status: "success", copied: 1, skipped: 1 });

    const week = await getMealPlanWeek(member.id, NEXT_MONDAY);

    expect(week[0].meals[0].items).toHaveLength(1);
    expect(week[0].meals[0].items[0].grams).toBe(40);
    expect(week).toHaveLength(2);
  });

  it("snaps any date of the week to its Monday", async () => {
    const { member } = await setup();

    expect(
      await actions.applyLastWeekAction({
        userId: member.id,
        weekStart: "2026-11-12",
      }),
    ).toEqual({ status: "success", copied: 2, skipped: 0 });
  });

  it("says when last week has no plan, and when the member does not exist", async () => {
    const { member } = await setup();

    expect(
      await actions.applyLastWeekAction({
        userId: member.id,
        weekStart: "2026-11-02",
      }),
    ).toEqual({ status: "error", message: "Tuần trước chưa có plan nào" });
    expect(
      await actions.applyLastWeekAction({
        userId: 999,
        weekStart: NEXT_MONDAY,
      }),
    ).toEqual({ status: "error", message: "Không tìm thấy học viên" });
  });

  it("does not copy another member's plans", async () => {
    const { member, other } = await setup();

    expect(
      await actions.applyLastWeekAction({
        userId: other.id,
        weekStart: NEXT_MONDAY,
      }),
    ).toEqual({ status: "error", message: "Tuần trước chưa có plan nào" });
    expect(await getMealPlanWeek(other.id, NEXT_MONDAY)).toEqual([]);
    expect(await getMealPlanWeek(member.id, NEXT_MONDAY)).toEqual([]);
  });
});

describe("deleteDayPlanAction", () => {
  it("removes the day, its meals and its foods only", async () => {
    const { member, chicken } = await seed();

    await actions.createDayPlanAction({ userId: member.id, date: MONDAY });
    await actions.createDayPlanAction({ userId: member.id, date: TUESDAY });

    const [monday] = await getMealPlanWeek(member.id, MONDAY);

    await actions.addItemAction({
      userId: member.id,
      mealId: monday.meals[0].id,
      foodId: chicken.id,
    });
    await actions.deleteDayPlanAction({ userId: member.id, dayId: monday.id });

    expect(await countAll()).toEqual({ days: 1, meals: 3, items: 0 });
    expect(
      (
        await db
          .select()
          .from(mealPlanDays)
          .where(and(eq(mealPlanDays.date, TUESDAY)))
      ).length,
    ).toBe(1);
  });
});

describe("deleting a meal with a frozen mark (KAN-93)", () => {
  it("removes the snapshot rows with the meal, not another meal's", async () => {
    const { member, chicken } = await seed();

    await actions.createDayPlanAction({ userId: member.id, date: MONDAY });

    const [monday] = await getMealPlanWeek(member.id, MONDAY);
    const [first, second] = monday.meals;

    for (const meal of [first, second]) {
      const [mark] = await db
        .insert(mealMarks)
        .values({ mealId: meal.id, userId: member.id, achieved: true })
        .returning();

      await db.insert(mealMarkItems).values({
        markId: mark.id,
        mealId: meal.id,
        foodId: chicken.id,
        grams: 200,
        protein: 62,
        carbs: 0,
        fat: 7.2,
        kcal: 312.8,
      });
    }
    await actions.removeMealAction({ userId: member.id, mealId: first.id });

    const rows = await db.select().from(mealMarkItems);

    expect(rows).toHaveLength(1);
    expect(rows[0].mealId).toBe(second.id);

    await actions.deleteDayPlanAction({ userId: member.id, dayId: monday.id });
    expect(await db.select().from(mealMarkItems)).toHaveLength(0);
  });
});

describe("saveMealPreferencesAction", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData();

    for (const [key, value] of Object.entries(values)) {
      data.set(key, value);
    }
    return data;
  };

  it("saves the count and the note for the signed-in trainee only", async () => {
    const { member, other } = await seed();

    state.role = "user";
    state.userId = member.id;

    const result = await saveMealPreferencesAction(
      INITIAL_FORM_STATE,
      form({ mealCount: "4", foodNote: "  Không ăn   hải sản  " }),
    );

    expect(result.status).toBe("success");

    const rows = await db.select().from(users);

    expect(rows.find((row) => row.id === member.id)).toMatchObject({
      preferredMealCount: 4,
      foodNote: "Không ăn hải sản",
    });
    expect(rows.find((row) => row.id === other.id)).toMatchObject({
      preferredMealCount: null,
      foodNote: null,
    });
  });

  it("clears both when the fields are empty", async () => {
    const { member } = await seed();

    state.role = "user";
    state.userId = member.id;
    await saveMealPreferencesAction(
      INITIAL_FORM_STATE,
      form({ mealCount: "5", foodNote: "x" }),
    );
    await saveMealPreferencesAction(
      INITIAL_FORM_STATE,
      form({ mealCount: "", foodNote: "" }),
    );

    expect(
      (await db.select().from(users).where(eq(users.id, member.id)))[0],
    ).toMatchObject({
      preferredMealCount: null,
      foodNote: null,
    });
  });

  it("refuses 1, 7, 3.5, text and a long note, and keeps what was saved", async () => {
    const { member } = await seed();

    state.role = "user";
    state.userId = member.id;
    await saveMealPreferencesAction(
      INITIAL_FORM_STATE,
      form({ mealCount: "4", foodNote: "ok" }),
    );

    for (const mealCount of ["1", "7", "3.5", "abc", "-3"]) {
      const result = await saveMealPreferencesAction(
        INITIAL_FORM_STATE,
        form({ mealCount, foodNote: "ok" }),
      );

      expect(result.status).toBe("error");
      expect(result.fieldErrors?.mealCount).toBe("Chọn từ 2 đến 6 bữa");
    }

    const tooLong = await saveMealPreferencesAction(
      INITIAL_FORM_STATE,
      form({ mealCount: "4", foodNote: "x".repeat(501) }),
    );

    expect(tooLong.fieldErrors?.foodNote).toBe("Tối đa 500 ký tự");
    expect(
      (await db.select().from(users).where(eq(users.id, member.id)))[0],
    ).toMatchObject({
      preferredMealCount: 4,
      foodNote: "ok",
    });
  });

  it("is for trainees: an admin session is sent away", async () => {
    await seed();
    state.role = "admin";
    await expectRedirect(
      saveMealPreferencesAction(INITIAL_FORM_STATE, form({ mealCount: "4" })),
    );
  });
});

describe("clonePlan (a plan that appears while copying)", () => {
  it("skips a day that already has a plan instead of failing or overwriting", async () => {
    const { member, chicken } = await seed();

    await actions.createDayPlanAction({ userId: member.id, date: MONDAY });
    await actions.createDayPlanAction({ userId: member.id, date: TUESDAY });

    const [monday] = await getMealPlanWeek(member.id, MONDAY);

    await actions.addItemAction({
      userId: member.id,
      mealId: monday.meals[0].id,
      foodId: chicken.id,
      grams: 250,
    });

    const { clonePlan, loadPlans } =
      await import("@/features/meal-plans/services/meal-plan-store");
    const plan = (await loadPlans([monday.id], db)).get(monday.id)!;
    const before = await countAll();

    expect(await clonePlan(plan, member.id, TUESDAY, db)).toBeNull();
    expect(await countAll()).toEqual(before);
    expect(await clonePlan(plan, member.id, "2026-11-04", db)).not.toBeNull();
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[2].meals[0].items[0].grams,
    ).toBe(250);
  });
});

describe("autoSolveMealAction upper bound", () => {
  it("never saves more than 3000 g of a lean food", async () => {
    const { member, other } = await seed();

    void other;
    await db.insert(nutritionTargets).values({
      userId: member.id,
      effectiveFrom: "2026-01-01",
      protein: 0,
      carbs: 235,
      fat: 0,
      source: "manual",
    });
    const [lettuce] = await db
      .insert(foods)
      .values({
        name: "Xà lách",
        nameKey: "xa lach",
        group: "vegetable",
        kcal: 4,
        protein: 0,
        carbs: 1,
        fat: 0,
      })
      .returning();

    await db.update(users).set({ preferredMealCount: 2 });
    await actions.createDayPlanAction({ userId: member.id, date: MONDAY });

    const [day] = await getMealPlanWeek(member.id, MONDAY);

    await actions.removeMealAction({
      userId: member.id,
      mealId: day.meals[1].id,
    });
    await actions.addItemAction({
      userId: member.id,
      mealId: day.meals[0].id,
      foodId: lettuce.id,
    });

    expect(
      await actions.autoSolveMealAction({
        userId: member.id,
        mealId: day.meals[0].id,
        fixedItemIds: [],
      }),
    ).toEqual({ status: "success" });
    expect(
      (await getMealPlanWeek(member.id, MONDAY))[0].meals[0].items[0].grams,
    ).toBe(3000);
  });
});
