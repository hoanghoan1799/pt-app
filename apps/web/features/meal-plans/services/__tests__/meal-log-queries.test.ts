import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  mealLogs,
  mealMarks,
  mealPlanDays,
  mealPlanMeals,
  users,
} from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { getWeekCompletion } =
  await import("@/features/meal-plans/services/meal-log-queries");

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";
const WEDNESDAY = "2026-11-04";
const THURSDAY = "2026-11-05";
const FRIDAY = "2026-11-06";

let db: TestDb;

const seed = async () => {
  const [member, other] = await db
    .insert(users)
    .values([
      { name: "Member", nameKey: "member" },
      { name: "Other", nameKey: "other" },
    ])
    .returning();

  const addPlan = async (userId: number, date: string, mealCount: number) => {
    const [day] = await db
      .insert(mealPlanDays)
      .values({ userId, date })
      .returning();
    const meals = mealCount
      ? await db
          .insert(mealPlanMeals)
          .values(
            Array.from({ length: mealCount }, (_, index) => ({
              dayId: day.id,
              position: index,
              name: `Bữa ${index + 1}`,
            })),
          )
          .returning()
      : [];

    return { day, meals };
  };
  const mark = (userId: number, mealId: number, achieved = true, note = "") =>
    db.insert(mealMarks).values({ userId, mealId, achieved, note }).returning();

  return { member, other, addPlan, mark };
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
});

describe("getWeekCompletion", () => {
  it("returns a status for each of the seven days", async () => {
    const { member } = await seed();

    expect(await getWeekCompletion(member.id, MONDAY)).toEqual({
      "2026-11-02": "none",
      "2026-11-03": "none",
      "2026-11-04": "none",
      "2026-11-05": "none",
      "2026-11-06": "none",
      "2026-11-07": "none",
      "2026-11-08": "none",
    });
  });

  it("maps all, some and none marked, an empty plan and no plan", async () => {
    const { member, addPlan, mark } = await seed();
    const all = await addPlan(member.id, MONDAY, 2);
    const some = await addPlan(member.id, TUESDAY, 3);
    await addPlan(member.id, WEDNESDAY, 2);
    await addPlan(member.id, THURSDAY, 0);

    await mark(member.id, all.meals[0].id);
    await mark(member.id, all.meals[1].id);
    await mark(member.id, some.meals[1].id);

    const week = await getWeekCompletion(member.id, MONDAY);

    expect(week[MONDAY]).toBe("complete");
    expect(week[TUESDAY]).toBe("partial");
    expect(week[WEDNESDAY]).toBe("none");
    expect(week[THURSDAY]).toBe("none");
    expect(week[FRIDAY]).toBe("none");
  });

  it("does not count a mark that is not achieved (note only or un-ticked)", async () => {
    const { member, addPlan, mark } = await seed();
    const plan = await addPlan(member.id, MONDAY, 2);

    await mark(member.id, plan.meals[0].id, false, "Ăn thiếu cơm");
    await mark(member.id, plan.meals[1].id, true);

    expect((await getWeekCompletion(member.id, MONDAY))[MONDAY]).toBe(
      "partial",
    );
  });

  it("does not count extra food alone", async () => {
    const { member, addPlan } = await seed();
    const plan = await addPlan(member.id, MONDAY, 2);

    await db.insert(mealLogs).values({
      userId: member.id,
      mealId: plan.meals[0].id,
      customName: "Bánh mì",
      grams: 120,
    });

    expect((await getWeekCompletion(member.id, MONDAY))[MONDAY]).toBe("none");
  });

  it("ignores a mark whose meal was deleted", async () => {
    const { member, addPlan, mark } = await seed();
    const plan = await addPlan(member.id, MONDAY, 2);

    await mark(member.id, plan.meals[0].id);
    await mark(member.id, plan.meals[1].id);
    // Foreign keys are not enforced: the mark outlives its meal.
    await db
      .delete(mealPlanMeals)
      .where(eq(mealPlanMeals.id, plan.meals[1].id));

    // One planned meal left, and it is marked: complete, not over-counted.
    expect((await getWeekCompletion(member.id, MONDAY))[MONDAY]).toBe(
      "complete",
    );

    await db
      .delete(mealPlanMeals)
      .where(eq(mealPlanMeals.id, plan.meals[0].id));

    // No meals left: the orphan marks give nothing.
    expect((await getWeekCompletion(member.id, MONDAY))[MONDAY]).toBe("none");
  });

  it("keeps a new unmarked meal from being hidden by an old mark", async () => {
    const { member, addPlan, mark } = await seed();
    const plan = await addPlan(member.id, MONDAY, 1);

    await mark(member.id, plan.meals[0].id);
    await db
      .insert(mealPlanMeals)
      .values({ dayId: plan.day.id, position: 1, name: "Bữa phụ" });

    expect((await getWeekCompletion(member.id, MONDAY))[MONDAY]).toBe(
      "partial",
    );
  });

  it("reports past days from their marks", async () => {
    const { member, addPlan, mark } = await seed();
    const past = await addPlan(member.id, "2026-10-26", 1);

    await mark(member.id, past.meals[0].id);

    expect(
      (await getWeekCompletion(member.id, "2026-10-26"))["2026-10-26"],
    ).toBe("complete");
  });

  it("reads only the given member and the given week", async () => {
    const { member, other, addPlan, mark } = await seed();
    const theirs = await addPlan(other.id, MONDAY, 1);
    const nextWeek = await addPlan(member.id, "2026-11-09", 1);

    await mark(other.id, theirs.meals[0].id);
    await mark(member.id, nextWeek.meals[0].id);

    const week = await getWeekCompletion(member.id, MONDAY);

    expect(Object.values(week).every((status) => status === "none")).toBe(true);
    expect(Object.keys(week)).not.toContain("2026-11-09");
    expect((await getWeekCompletion(other.id, MONDAY))[MONDAY]).toBe(
      "complete",
    );
  });
});
