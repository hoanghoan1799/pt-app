import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  foods,
  mealLogs,
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
  role: "user",
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

const logActions =
  await import("@/features/meal-plans/services/meal-log-actions");
const planActions =
  await import("@/features/meal-plans/services/meal-plan-actions");
const { getMealLogData } =
  await import("@/features/meal-plans/services/meal-log-queries");
const { getPlanKcalNoticesFrom } =
  await import("@/features/meal-plans/services/meal-plan-queries");
const { getTodayDate, getWeekStart } = await import("@/utils/week");
const { addDays } = await import("@pt/contracts");
const { TIME_ZONE } = await import("@/constants/time");

let db: TestDb;

const TODAY = getTodayDate(TIME_ZONE);
const TOMORROW = addDays(TODAY, 1);

const seed = async () => {
  const [member, other] = await db
    .insert(users)
    .values([
      { name: "Member", nameKey: "member" },
      { name: "Other", nameKey: "other" },
    ])
    .returning();
  const [chicken, rice] = await db
    .insert(foods)
    .values([
      {
        name: "Ức gà (chín)",
        nameKey: "uc ga (chin)",
        group: "meat",
        kcal: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        source: "test",
      },
      {
        name: "Cơm trắng (chín)",
        nameKey: "com trang (chin)",
        group: "starch",
        kcal: 130,
        protein: 2.7,
        carbs: 28.2,
        fat: 0.3,
        source: "test",
      },
    ])
    .returning();

  const addPlan = async (userId: number, date: string) => {
    const [day] = await db
      .insert(mealPlanDays)
      .values({ userId, date })
      .returning();
    const meals = await db
      .insert(mealPlanMeals)
      .values([
        { dayId: day.id, position: 0, name: "Bữa sáng" },
        { dayId: day.id, position: 1, name: "Bữa trưa" },
      ])
      .returning();

    return { day, meals };
  };

  const today = await addPlan(member.id, TODAY);
  const tomorrow = await addPlan(member.id, TOMORROW);
  const foreign = await addPlan(other.id, TODAY);

  return { member, other, chicken, rice, today, tomorrow, foreign };
};

const loginAs = (userId: number) => {
  state.role = "user";
  state.userId = userId;
};

const expectRedirect = async (call: Promise<unknown>) => {
  await expect(call).rejects.toMatchObject({
    digest: expect.stringContaining("NEXT_REDIRECT"),
  });
};

const countLogs = async () => (await db.select().from(mealLogs)).length;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.role = "user";
});

describe("addMealLogAction", () => {
  it("logs a library food with grams and resolves its numbers", async () => {
    const { member, chicken, today } = await seed();

    loginAs(member.id);
    expect(
      await logActions.addMealLogAction({
        kind: "library",
        mealId: today.meals[0].id,
        foodId: chicken.id,
        grams: 200,
      }),
    ).toEqual({ status: "success" });

    const { logs } = await getMealLogData([today.meals[0].id]);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      name: "Ức gà (chín)",
      isFree: false,
      grams: 200,
      nutrition: { kcal: 312.8, protein: 62, carbs: 0, fat: 7.2 },
    });
  });

  it("logs a free food with optional macros and trims the name", async () => {
    const { member, today } = await seed();

    loginAs(member.id);
    await logActions.addMealLogAction({
      kind: "free",
      mealId: today.meals[0].id,
      customName: "  Phở   bò ",
      grams: 0,
      kcal: 450,
      protein: 25,
    });
    await logActions.addMealLogAction({
      kind: "free",
      mealId: today.meals[0].id,
      customName: "Bánh mì",
      grams: 120,
    });

    const { logs } = await getMealLogData([today.meals[0].id]);

    expect(logs.map((log) => log.name)).toEqual(["Phở bò", "Bánh mì"]);
    expect(logs[0]).toMatchObject({
      isFree: true,
      nutrition: { kcal: 450, protein: 25, carbs: 0, fat: 0 },
    });
    // No numbers typed: nothing to add up.
    expect(logs[1].nutrition).toBeNull();
  });

  it("rejects a meal of another trainee and stores nothing", async () => {
    const { member, chicken, foreign } = await seed();

    loginAs(member.id);

    const result = await logActions.addMealLogAction({
      kind: "library",
      mealId: foreign.meals[0].id,
      foodId: chicken.id,
      grams: 100,
    });

    expect(result).toMatchObject({
      status: "error",
      message: "Bữa này không còn trong plan của bạn",
    });
    expect(await countLogs()).toBe(0);
  });

  it("rejects a meal id that does not exist", async () => {
    const { member, chicken } = await seed();

    loginAs(member.id);
    expect(
      await logActions.addMealLogAction({
        kind: "library",
        mealId: 9999,
        foodId: chicken.id,
        grams: 100,
      }),
    ).toMatchObject({ status: "error" });
  });

  it("rejects a meal of a plan day after today", async () => {
    const { member, chicken, tomorrow } = await seed();

    loginAs(member.id);
    expect(
      await logActions.addMealLogAction({
        kind: "library",
        mealId: tomorrow.meals[0].id,
        foodId: chicken.id,
        grams: 100,
      }),
    ).toMatchObject({
      status: "error",
      message: "Chưa tới ngày này, quay lại ghi sau nhé",
    });
    expect(await countLogs()).toBe(0);
  });

  it("rejects a food that is archived or missing", async () => {
    const { member, chicken, today } = await seed();

    loginAs(member.id);
    await db
      .update(foods)
      .set({ archivedAt: new Date() })
      .where(eq(foods.id, chicken.id));

    for (const foodId of [chicken.id, 9999]) {
      expect(
        await logActions.addMealLogAction({
          kind: "library",
          mealId: today.meals[0].id,
          foodId,
          grams: 100,
        }),
      ).toMatchObject({
        status: "error",
        message: "Món này không còn trong thư viện",
      });
    }
    expect(await countLogs()).toBe(0);
  });

  it("rejects bad numbers: zero grams, too many grams, negative or huge macros, empty name", async () => {
    const { member, chicken, today } = await seed();
    const mealId = today.meals[0].id;

    loginAs(member.id);

    const bad = [
      { kind: "library", mealId, foodId: chicken.id, grams: 0 },
      { kind: "library", mealId, foodId: chicken.id, grams: 3001 },
      { kind: "library", mealId, foodId: chicken.id, grams: Number.NaN },
      { kind: "free", mealId, customName: "Cơm", grams: 100, protein: -1 },
      { kind: "free", mealId, customName: "Cơm", grams: 100, kcal: 5001 },
      { kind: "free", mealId, customName: "   ", grams: 100 },
      { kind: "free", mealId, customName: "x".repeat(61), grams: 100 },
      { kind: "free", mealId, customName: "Cơm", grams: -5 },
    ] as const;

    for (const input of bad) {
      expect(await logActions.addMealLogAction(input)).toMatchObject({
        status: "error",
        message: "Vui lòng kiểm tra lại thông tin",
      });
    }
    expect(await countLogs()).toBe(0);
  });

  it("allows at most 30 foods in a meal", async () => {
    const { member, today } = await seed();
    const mealId = today.meals[0].id;

    await db.insert(mealLogs).values(
      Array.from({ length: 30 }, (_, index) => ({
        userId: member.id,
        mealId,
        customName: `Món ${index}`,
        grams: 10,
      })),
    );
    loginAs(member.id);
    expect(
      await logActions.addMealLogAction({
        kind: "free",
        mealId,
        customName: "Thêm",
        grams: 10,
      }),
    ).toMatchObject({ status: "error", message: "Một bữa tối đa 30 món" });
    expect(await countLogs()).toBe(30);
  });

  it("never goes past 30 foods when adds arrive together", async () => {
    const { member, today } = await seed();
    const mealId = today.meals[0].id;

    await db.insert(mealLogs).values(
      Array.from({ length: 29 }, (_, index) => ({
        userId: member.id,
        mealId,
        customName: `Món ${index}`,
        grams: 10,
      })),
    );
    loginAs(member.id);

    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        logActions.addMealLogAction({
          kind: "free",
          mealId,
          customName: `Thêm ${n}`,
          grams: 10,
        }),
      ),
    );

    expect(results.filter((r) => r.status === "success")).toHaveLength(1);
    expect(await countLogs()).toBe(30);
  });

  it("sends a signed-out visitor and an admin to login", async () => {
    const { chicken, today } = await seed();

    state.role = "admin";
    await expectRedirect(
      logActions.addMealLogAction({
        kind: "library",
        mealId: today.meals[0].id,
        foodId: chicken.id,
        grams: 100,
      }),
    );
    expect(await countLogs()).toBe(0);
  });
});

describe("updateMealLogAction", () => {
  const logChicken = async () => {
    const data = await seed();

    loginAs(data.member.id);
    await logActions.addMealLogAction({
      kind: "library",
      mealId: data.today.meals[0].id,
      foodId: data.chicken.id,
      grams: 200,
    });

    const [log] = await db.select().from(mealLogs);

    return { ...data, log };
  };

  it("changes the grams of a library food and keeps its food", async () => {
    const { log, chicken } = await logChicken();

    expect(
      await logActions.updateMealLogAction({
        logId: log.id,
        grams: 150,
        // A name sent for a library food is ignored.
        customName: "Hack",
      }),
    ).toEqual({ status: "success" });

    const [row] = await db.select().from(mealLogs);

    expect(row).toMatchObject({
      grams: 150,
      foodId: chicken.id,
      customName: null,
    });
  });

  it("rejects 0 g for a library food", async () => {
    const { log } = await logChicken();

    expect(
      await logActions.updateMealLogAction({ logId: log.id, grams: 0 }),
    ).toMatchObject({ status: "error" });
    expect((await db.select().from(mealLogs))[0].grams).toBe(200);
  });

  it("edits a free food's name, grams and macros, and can clear the macros", async () => {
    const { member, today } = await seed();

    loginAs(member.id);
    await logActions.addMealLogAction({
      kind: "free",
      mealId: today.meals[0].id,
      customName: "Phở",
      grams: 0,
      kcal: 450,
    });

    const [log] = await db.select().from(mealLogs);

    await logActions.updateMealLogAction({
      logId: log.id,
      customName: "Phở gà",
      grams: 500,
      protein: 30,
    });
    expect((await db.select().from(mealLogs))[0]).toMatchObject({
      customName: "Phở gà",
      grams: 500,
      kcal: null,
      protein: 30,
    });
    // A free food needs a name.
    expect(
      await logActions.updateMealLogAction({ logId: log.id, grams: 500 }),
    ).toMatchObject({ status: "error", message: "Nhập tên món" });
  });

  it("cannot edit another trainee's log or a log that is gone", async () => {
    const { other, foreign, log } = await logChicken();

    await db.insert(mealLogs).values({
      userId: other.id,
      mealId: foreign.meals[0].id,
      customName: "Của người khác",
      grams: 100,
    });

    const [, theirs] = await db.select().from(mealLogs);

    for (const logId of [theirs.id, 9999]) {
      expect(
        await logActions.updateMealLogAction({
          logId,
          customName: "X",
          grams: 1,
        }),
      ).toMatchObject({
        status: "error",
        message: "Món này không còn trong nhật ký",
      });
    }
    expect((await db.select().from(mealLogs))[1].customName).toBe(
      "Của người khác",
    );
    expect(log.grams).toBe(200);
  });

  it("cannot edit a log of a day after today", async () => {
    const { member, tomorrow } = await seed();

    await db.insert(mealLogs).values({
      userId: member.id,
      mealId: tomorrow.meals[0].id,
      customName: "Sớm",
      grams: 10,
    });

    const [log] = await db.select().from(mealLogs);

    loginAs(member.id);
    expect(
      await logActions.updateMealLogAction({
        logId: log.id,
        customName: "Sớm hơn",
        grams: 20,
      }),
    ).toMatchObject({ status: "error" });
    expect((await db.select().from(mealLogs))[0].grams).toBe(10);
  });
});

describe("a library log whose food row is gone", () => {
  const seedMissing = async () => {
    const data = await seed();

    // Production does not enforce foreign keys (D10), so a food id can point
    // at nothing; the in-memory test DB does, so switch that off here.
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    await db.insert(mealLogs).values({
      userId: data.member.id,
      mealId: data.today.meals[0].id,
      foodId: 9999,
      grams: 100,
    });
    loginAs(data.member.id);
    return { ...data, log: (await db.select().from(mealLogs))[0] };
  };

  it("shows a clear name and no numbers instead of an empty row", async () => {
    const { today } = await seedMissing();
    const { logs } = await getMealLogData([today.meals[0].id]);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      name: "Món không còn trong thư viện",
      isMissingFood: true,
      isFree: false,
      grams: 100,
      nutrition: null,
    });
  });

  it("refuses an edit with a clear error but still allows removing it", async () => {
    const { log } = await seedMissing();

    expect(
      await logActions.updateMealLogAction({ logId: log.id, grams: 50 }),
    ).toMatchObject({
      status: "error",
      message: "Món này không còn trong thư viện, hãy xóa rồi ghi lại",
    });
    expect((await db.select().from(mealLogs))[0].grams).toBe(100);
    expect(await logActions.removeMealLogAction({ logId: log.id })).toEqual({
      status: "success",
    });
    expect(await db.select().from(mealLogs)).toHaveLength(0);
  });
});

describe("removeMealLogAction", () => {
  it("removes the trainee's log only", async () => {
    const { member, other, today, foreign } = await seed();

    await db.insert(mealLogs).values([
      {
        userId: member.id,
        mealId: today.meals[0].id,
        customName: "A",
        grams: 1,
      },
      {
        userId: other.id,
        mealId: foreign.meals[0].id,
        customName: "B",
        grams: 1,
      },
    ]);

    const [mine, theirs] = await db.select().from(mealLogs);

    loginAs(member.id);
    expect(await logActions.removeMealLogAction({ logId: mine.id })).toEqual({
      status: "success",
    });
    expect(
      await logActions.removeMealLogAction({ logId: theirs.id }),
    ).toMatchObject({ status: "error" });
    expect(
      await logActions.removeMealLogAction({ logId: mine.id }),
    ).toMatchObject({ status: "error" });
    expect((await db.select().from(mealLogs)).map((row) => row.id)).toEqual([
      theirs.id,
    ]);
  });
});

describe("setMealMarkAction", () => {
  it("marks Đạt, then updates the same row with a note", async () => {
    const { member, today } = await seed();
    const mealId = today.meals[0].id;

    loginAs(member.id);
    await logActions.setMealMarkAction({ mealId, achieved: true, note: "" });
    await logActions.setMealMarkAction({
      mealId,
      achieved: true,
      note: "  Cơm hơi dư 30 g  ",
    });

    const rows = await db.select().from(mealMarks);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      mealId,
      userId: member.id,
      achieved: true,
      note: "Cơm hơi dư 30 g",
    });
  });

  it("keeps a note without Đạt, and removes the mark when both are cleared", async () => {
    const { member, today } = await seed();
    const mealId = today.meals[0].id;

    loginAs(member.id);
    await logActions.setMealMarkAction({
      mealId,
      achieved: false,
      note: "Thiếu gà",
    });
    expect(await getMealLogData([mealId])).toMatchObject({
      marks: [{ mealId, achieved: false, note: "Thiếu gà" }],
    });

    await logActions.setMealMarkAction({ mealId, achieved: false, note: "" });
    expect((await getMealLogData([mealId])).marks).toEqual([]);
  });

  it("rejects a foreign meal, a future day and a too long note", async () => {
    const { member, today, tomorrow, foreign } = await seed();

    loginAs(member.id);
    for (const mealId of [foreign.meals[0].id, tomorrow.meals[0].id, 9999]) {
      expect(
        await logActions.setMealMarkAction({
          mealId,
          achieved: true,
          note: "",
        }),
      ).toMatchObject({ status: "error" });
    }
    expect(
      await logActions.setMealMarkAction({
        mealId: today.meals[0].id,
        achieved: true,
        note: "x".repeat(301),
      }),
    ).toMatchObject({
      status: "error",
      message: "Vui lòng kiểm tra lại thông tin",
    });
    expect(await db.select().from(mealMarks)).toHaveLength(0);
  });
});

describe("when the PT changes the plan", () => {
  const seedWithLogs = async () => {
    const data = await seed();
    const [meal] = data.today.meals;

    await db.insert(mealLogs).values({
      userId: data.member.id,
      mealId: meal.id,
      foodId: data.chicken.id,
      grams: 100,
    });
    await db.insert(mealMarks).values({
      mealId: meal.id,
      userId: data.member.id,
      achieved: true,
    });
    return data;
  };

  it("deleting the plan day deletes its logs and marks, not other days'", async () => {
    const data = await seedWithLogs();

    await db.insert(mealLogs).values({
      userId: data.other.id,
      mealId: data.foreign.meals[0].id,
      customName: "Giữ",
      grams: 1,
    });
    state.role = "admin";
    expect(
      await planActions.deleteDayPlanAction({
        userId: data.member.id,
        dayId: data.today.day.id,
      }),
    ).toEqual({ status: "success" });
    expect(
      (await db.select().from(mealLogs)).map((row) => row.customName),
    ).toEqual(["Giữ"]);
    expect(await db.select().from(mealMarks)).toHaveLength(0);
  });

  it("removing one meal deletes only that meal's logs and marks", async () => {
    const data = await seedWithLogs();

    await db.insert(mealLogs).values({
      userId: data.member.id,
      mealId: data.today.meals[1].id,
      customName: "Bữa trưa",
      grams: 1,
    });
    state.role = "admin";
    await planActions.removeMealAction({
      userId: data.member.id,
      mealId: data.today.meals[0].id,
    });
    expect(
      (await db.select().from(mealLogs)).map((row) => row.customName),
    ).toEqual(["Bữa trưa"]);
    expect(await db.select().from(mealMarks)).toHaveLength(0);
  });

  it("copying a day over a day with logs replaces its logs; the trainee can no longer edit them", async () => {
    const data = await seedWithLogs();
    const tomorrowMeal = data.tomorrow.meals[0];

    await db.insert(mealPlanItems).values({
      mealId: tomorrowMeal.id,
      foodId: data.rice.id,
      grams: 100,
    });
    state.role = "admin";
    // Copy tomorrow's plan over today's.
    await planActions.copyDayAction({
      userId: data.member.id,
      dayId: data.tomorrow.day.id,
      dates: [TODAY],
    });
    expect(await db.select().from(mealLogs)).toHaveLength(0);
    expect(await db.select().from(mealMarks)).toHaveLength(0);

    loginAs(data.member.id);
    expect(
      await logActions.setMealMarkAction({
        mealId: data.today.meals[0].id,
        achieved: true,
        note: "",
      }),
    ).toMatchObject({ status: "error" });
  });
});

describe("getNutritionWeek with meal logs", () => {
  it("adds meal logs to the old entries in the day totals, for this trainee only", async () => {
    const { member, other, chicken, today, foreign } = await seed();
    const { getNutritionWeek } =
      await import("@/features/nutrition/services/nutrition-queries");
    const { foodEntries } = await import("@/db/schema");

    await db.insert(foodEntries).values({
      userId: member.id,
      date: TODAY,
      meal: "lunch",
      description: "Cũ",
      carbs: 60,
      protein: 30,
      fat: 10,
    });
    await db.insert(mealLogs).values([
      // 200 g chicken: P 62, F 7.2.
      {
        userId: member.id,
        mealId: today.meals[0].id,
        foodId: chicken.id,
        grams: 200,
      },
      // Free food: only protein typed, kcal ignored for the macros.
      {
        userId: member.id,
        mealId: today.meals[1].id,
        customName: "Phở",
        grams: 0,
        kcal: 450,
        protein: 25,
      },
      // A free food with no numbers: logged, adds nothing.
      {
        userId: member.id,
        mealId: today.meals[1].id,
        customName: "Nước",
        grams: 0,
      },
      // Someone else's log on the same date.
      {
        userId: other.id,
        mealId: foreign.meals[0].id,
        customName: "Khác",
        grams: 0,
        protein: 99,
      },
    ]);

    const days = await getNutritionWeek(member.id, getWeekStart(TODAY));
    const day = days.find((item) => item.date === TODAY);

    // C 60; P 30 + 62 + 25 = 117; F 10 + 7.2 = 17.2 -> 17.
    expect(day?.totals).toEqual({ carbs: 60, protein: 117, fat: 17 });
    expect(day?.loggedCount).toBe(4);
    expect(day?.entries).toHaveLength(1);
    // Days without logs stay empty.
    expect(
      days.filter((item) => item.loggedCount > 0).map((item) => item.date),
    ).toEqual([TODAY]);
  });
});

describe("listDatesWithLogs", () => {
  it("lists the plan dates where this trainee logged or marked something", async () => {
    const { listDatesWithLogs } =
      await import("@/features/meal-plans/services/meal-log-queries");
    const { member, other, today, tomorrow, foreign } = await seed();

    await db.insert(mealLogs).values([
      {
        userId: member.id,
        mealId: today.meals[0].id,
        customName: "A",
        grams: 1,
      },
      {
        userId: member.id,
        mealId: today.meals[1].id,
        customName: "B",
        grams: 1,
      },
    ]);
    await db.insert(mealMarks).values([
      { mealId: tomorrow.meals[0].id, userId: member.id, achieved: true },
      { mealId: foreign.meals[0].id, userId: other.id, achieved: true },
    ]);

    // Today (logs, listed once) and tomorrow (a mark); the other trainee's
    // plan day has the same date as today but is not theirs.
    expect(await listDatesWithLogs(member.id, TODAY, TOMORROW)).toEqual([
      TODAY,
      TOMORROW,
    ]);
    // Out of range or nothing logged.
    expect(await listDatesWithLogs(member.id, TOMORROW, TOMORROW)).toEqual([
      TOMORROW,
    ]);
    expect(await listDatesWithLogs(9999, TODAY, TOMORROW)).toEqual([]);
  });
});

describe("getPlanKcalNoticesFrom", () => {
  it("compares each planned day with the target that applies on its date", async () => {
    const { member, chicken, rice, today, tomorrow } = await seed();

    // Target P 160 / C 235 / F 55 = 640 + 940 + 495 = 2,075 kcal.
    await db.insert(nutritionTargets).values({
      userId: member.id,
      effectiveFrom: "2020-01-01",
      protein: 160,
      carbs: 235,
      fat: 55,
      source: "manual",
    });
    // Today: 1,000 g rice = P 27 / C 282 / F 3 = 1,263 kcal and 500 g chicken
    // = P 155 / C 0 / F 18 = 782 kcal: 2,045 kcal, gap -30, within 80.
    await db.insert(mealPlanItems).values([
      { mealId: today.meals[0].id, foodId: rice.id, grams: 1000 },
      { mealId: today.meals[1].id, foodId: chicken.id, grams: 500 },
      // Tomorrow: 500 g rice = 631.5 kcal -> gap -1,443.5 -> -1317.
      { mealId: tomorrow.meals[0].id, foodId: rice.id, grams: 600 },
    ]);

    expect(await getPlanKcalNoticesFrom(member.id, TODAY)).toEqual([
      { date: TOMORROW, gapKcal: -1317 },
    ]);

    // The PT raises the target from tomorrow on: +100 g carbs = +400 kcal.
    await db.insert(nutritionTargets).values({
      userId: member.id,
      effectiveFrom: TOMORROW,
      protein: 160,
      carbs: 335,
      fat: 55,
      source: "manual",
    });

    expect(await getPlanKcalNoticesFrom(member.id, TODAY)).toEqual([
      { date: TOMORROW, gapKcal: -1717 },
    ]);
    // Days before `from` are not checked.
    expect(await getPlanKcalNoticesFrom(member.id, TOMORROW)).toEqual([
      { date: TOMORROW, gapKcal: -1717 },
    ]);
  });

  it("is empty without plans or without a target", async () => {
    const { member, rice, today } = await seed();

    await db
      .insert(mealPlanItems)
      .values({ mealId: today.meals[0].id, foodId: rice.id, grams: 500 });
    expect(await getPlanKcalNoticesFrom(member.id, TODAY)).toEqual([]);
    expect(await getPlanKcalNoticesFrom(9999, TODAY)).toEqual([]);
  });
});

// KAN-93: what counts as eaten is frozen when the trainee marks "Đạt".
describe("freezing the eaten numbers (KAN-93)", () => {
  // Today's first meal: 200 g chicken (P 62 / F 7.2) + 300 g rice
  // (P 8.1 / C 84.6 / F 0.9).
  const seedMarked = async () => {
    const data = await seed();
    const mealId = data.today.meals[0].id;

    await db.insert(mealPlanItems).values([
      { mealId, foodId: data.chicken.id, grams: 200 },
      { mealId, foodId: data.rice.id, grams: 300 },
    ]);
    loginAs(data.member.id);
    await logActions.setMealMarkAction({ mealId, achieved: true, note: "" });
    return { ...data, mealId };
  };

  // The totals the trainee sees: the meal card and the day summary use
  // countMealNutrition with the loaded mark, the week strip the week query.
  const eatenOf = async (mealId: number) => {
    const { countMealNutrition } =
      await import("@/features/meal-plans/utils/meal-log");
    const { getMealPlanWeek: loadWeek } =
      await import("@/features/meal-plans/services/meal-plan-queries");
    const [plan] = (await loadWeek(1, getWeekStart(TODAY))).filter(
      (day) => day.date === TODAY,
    );
    const meal = plan.meals.find((item) => item.id === mealId);
    const { logs, marks } = await getMealLogData([mealId]);
    const mark = marks[0];

    return countMealNutrition(
      meal?.items ?? [],
      logs,
      mark?.achieved ?? false,
      mark?.frozen,
    );
  };

  const weekProtein = async (userId: number) => {
    const { getNutritionWeek } =
      await import("@/features/nutrition/services/nutrition-queries");
    const days = await getNutritionWeek(userId, getWeekStart(TODAY));

    return days.find((day) => day.date === TODAY)?.totals.protein;
  };

  it("snapshots every planned item with its numbers when marked", async () => {
    const { mealId, chicken, rice } = await seedMarked();
    const rows = await db.select().from(mealMarkItems);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      mealId,
      foodId: chicken.id,
      grams: 200,
      protein: 62,
      carbs: 0,
      fat: 7.2,
      kcal: 312.8,
    });
    expect(rows[1]).toMatchObject({ foodId: rice.id, grams: 300 });
    expect(rows[1].protein).toBeCloseTo(8.1, 5);
    expect(rows[1].carbs).toBeCloseTo(84.6, 5);
  });

  it("keeps the eaten total when the PT changes grams, adds or removes a food", async () => {
    const { member, mealId, chicken, rice } = await seedMarked();
    const before = await eatenOf(mealId);

    expect(before.protein).toBeCloseTo(70.1, 5);

    state.role = "admin";
    const [chickenItem] = await db
      .select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.foodId, chicken.id));

    // 200 g -> 400 g.
    await planActions.updateItemGramsAction({
      userId: member.id,
      itemId: chickenItem.id,
      grams: 400,
    });
    // Remove the rice, add 100 g of a new planned food.
    const [riceItem] = await db
      .select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.foodId, rice.id));

    await planActions.removeItemAction({
      userId: member.id,
      itemId: riceItem.id,
    });
    await planActions.addItemAction({
      userId: member.id,
      mealId,
      foodId: rice.id,
      grams: 999,
    });

    expect(await eatenOf(mealId)).toEqual(before);
    expect(await weekProtein(member.id)).toBe(70);
  });

  it("keeps the eaten total when the admin edits the food's macros", async () => {
    const { member, mealId, chicken } = await seedMarked();

    await db.update(foods).set({ protein: 5 }).where(eq(foods.id, chicken.id));

    expect((await eatenOf(mealId)).protein).toBeCloseTo(70.1, 5);
    expect(await weekProtein(member.id)).toBe(70);
  });

  it("keeps the snapshot when only the note changes", async () => {
    const { mealId } = await seedMarked();
    const [first] = await db.select().from(mealMarkItems);

    await logActions.setMealMarkAction({
      mealId,
      achieved: true,
      note: "Cơm hơi dư",
    });

    const rows = await db.select().from(mealMarkItems);

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(first.id);
  });

  it("does not snapshot a note-only mark, and drops the snapshot on un-mark", async () => {
    const { mealId } = await seedMarked();

    await logActions.setMealMarkAction({
      mealId,
      achieved: false,
      note: "Thiếu",
    });
    expect(await db.select().from(mealMarkItems)).toHaveLength(0);
    expect(await db.select().from(mealMarks)).toHaveLength(1);

    await logActions.setMealMarkAction({ mealId, achieved: true, note: "" });
    expect(await db.select().from(mealMarkItems)).toHaveLength(2);
    await logActions.setMealMarkAction({
      mealId,
      achieved: false,
      note: "",
    });
    expect(await db.select().from(mealMarks)).toHaveLength(0);
    expect(await db.select().from(mealMarkItems)).toHaveLength(0);
  });

  it("takes a fresh snapshot when marked again after the PT edited grams", async () => {
    const { member, mealId, chicken } = await seedMarked();
    const [chickenItem] = await db
      .select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.foodId, chicken.id));

    await logActions.setMealMarkAction({
      mealId,
      achieved: false,
      note: "",
    });
    state.role = "admin";
    await planActions.updateItemGramsAction({
      userId: member.id,
      itemId: chickenItem.id,
      grams: 400,
    });
    loginAs(member.id);
    await logActions.setMealMarkAction({ mealId, achieved: true, note: "" });

    // 400 g chicken P 124 + 300 g rice P 8.1.
    expect((await eatenOf(mealId)).protein).toBeCloseTo(132.1, 5);
    expect(await weekProtein(member.id)).toBe(132);
  });

  it("replaces the frozen item with a same-food log added after the mark", async () => {
    const { member, mealId, chicken } = await seedMarked();

    await logActions.addMealLogAction({
      kind: "library",
      mealId,
      foodId: chicken.id,
      grams: 50,
    });

    // 50 g chicken P 15.5 + 300 g rice P 8.1.
    expect((await eatenOf(mealId)).protein).toBeCloseTo(23.6, 5);
    expect(await weekProtein(member.id)).toBe(24);
  });

  it("reads a mark made before KAN-93 (no snapshot rows) live", async () => {
    const data = await seed();
    const mealId = data.today.meals[0].id;

    await db
      .insert(mealPlanItems)
      .values({ mealId, foodId: data.chicken.id, grams: 200 });
    await db.insert(mealMarks).values({
      mealId,
      userId: data.member.id,
      achieved: true,
    });
    expect((await eatenOf(mealId)).protein).toBe(62);

    await db
      .update(mealPlanItems)
      .set({ grams: 400 })
      .where(eq(mealPlanItems.mealId, mealId));
    expect((await eatenOf(mealId)).protein).toBe(124);
    expect(await weekProtein(data.member.id)).toBe(124);
  });

  it("agrees across the meal card, the day summary and the week strip", async () => {
    const { member, mealId } = await seedMarked();
    const { logs, marks } = await getMealLogData([mealId]);

    expect(marks[0].frozen).toHaveLength(2);
    expect(logs).toHaveLength(0);
    expect(Math.round((await eatenOf(mealId)).protein)).toBe(
      await weekProtein(member.id),
    );
  });

  it("deleting the plan day removes the snapshot rows", async () => {
    const { member, today } = await seedMarked();

    state.role = "admin";
    await planActions.deleteDayPlanAction({
      userId: member.id,
      dayId: today.day.id,
    });
    expect(await db.select().from(mealMarks)).toHaveLength(0);
    expect(await db.select().from(mealMarkItems)).toHaveLength(0);
  });
});

describe("library log numbers are stored (KAN-93)", () => {
  it("stores the computed numbers on add and keeps them when the food is edited", async () => {
    const { member, chicken, today } = await seed();
    const mealId = today.meals[0].id;

    loginAs(member.id);
    await logActions.addMealLogAction({
      kind: "library",
      mealId,
      foodId: chicken.id,
      grams: 200,
    });

    const [row] = await db.select().from(mealLogs);

    expect(row).toMatchObject({
      protein: 62,
      carbs: 0,
      fat: 7.2,
      kcal: 312.8,
    });

    await db.update(foods).set({ protein: 5 }).where(eq(foods.id, chicken.id));

    const { logs } = await getMealLogData([mealId]);

    expect(logs[0].nutrition).toEqual({
      kcal: 312.8,
      protein: 62,
      carbs: 0,
      fat: 7.2,
    });
    // The edit sheet must not see them as typed numbers.
    expect(logs[0].typed).toEqual({
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
    });
  });

  it("recomputes from the library at edit time when the grams change", async () => {
    const { member, chicken, today } = await seed();
    const mealId = today.meals[0].id;

    loginAs(member.id);
    await logActions.addMealLogAction({
      kind: "library",
      mealId,
      foodId: chicken.id,
      grams: 200,
    });
    await db.update(foods).set({ protein: 20 }).where(eq(foods.id, chicken.id));

    const [row] = await db.select().from(mealLogs);

    await logActions.updateMealLogAction({
      logId: row.id,
      grams: 100,
    });

    const { logs } = await getMealLogData([mealId]);

    // 100 g at P 20 / F 3.6: 80 + 32.4 = 112.4 kcal.
    expect(logs[0].nutrition).toEqual({
      kcal: 112.4,
      protein: 20,
      carbs: 0,
      fat: 3.6,
    });
  });

  it("reads a library log with no stored numbers (before KAN-93) live", async () => {
    const { member, chicken, today } = await seed();
    const mealId = today.meals[0].id;

    await db.insert(mealLogs).values({
      userId: member.id,
      mealId,
      foodId: chicken.id,
      grams: 200,
    });
    await db.update(foods).set({ protein: 20 }).where(eq(foods.id, chicken.id));

    const { logs } = await getMealLogData([mealId]);

    expect(logs[0].nutrition?.protein).toBe(40);
  });
});
