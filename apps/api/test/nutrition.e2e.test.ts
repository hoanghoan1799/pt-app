import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BodyProfile } from "../src/database/entities/body-profile.entity.js";
import { FoodEntry } from "../src/database/entities/food-entry.entity.js";
import { NutritionTarget } from "../src/database/entities/nutrition-target.entity.js";
import { User } from "../src/database/entities/user.entity.js";
import { WeightLog } from "../src/database/entities/weight-log.entity.js";
import {
  bootNutritionWorld,
  type NutritionWorld,
  TODAY,
} from "./support/nutrition.js";

let w: NutritionWorld;

beforeAll(async () => {
  w = await bootNutritionWorld();
});

afterAll(async () => {
  await w.close();
});

const TARGET_BODY = {
  carbs: "250",
  protein: "160",
  fat: "60",
  note: "Giữ nguyên",
};
const ADMIN_PROFILE = {
  sex: "male",
  age: "30",
  heightCm: "175",
  weightKg: "75",
  activityLevel: "moderate",
  kcalAdjustment: "-300",
  proteinPerKg: "2",
  applyToTarget: true,
};
const USER_PROFILE = {
  sex: "male",
  age: "30",
  heightCm: "175",
  weightKg: "75",
  activityLevel: "moderate",
  goal: "maintain",
};

const targetsOf = (userId: number) =>
  w.ds.getRepository(NutritionTarget).find({
    where: { userId },
    order: { effectiveFrom: "ASC" },
  });

const reset = async (userId: number) => {
  await w.ds.getRepository(NutritionTarget).delete({ userId });
  await w.ds.getRepository(BodyProfile).delete({ userId });
  await w.ds.getRepository(WeightLog).delete({ userId });
  await w.ds.getRepository(FoodEntry).delete({ userId });
};

describe("authentication, roles and PT scope", () => {
  const trainee = () => w.ids.mine;
  const ptRoutes = () => {
    const id = trainee();

    return [
      { method: "get", path: `/trainees/${id}/nutrition` },
      {
        method: "put",
        path: `/trainees/${id}/nutrition-target`,
        body: TARGET_BODY,
      },
      {
        method: "put",
        path: `/trainees/${id}/body-profile`,
        body: ADMIN_PROFILE,
      },
    ] as const;
  };
  const userRoutes = [
    { method: "get", path: "/me/nutrition" },
    { method: "put", path: "/me/body-profile", body: USER_PROFILE },
    {
      method: "put",
      path: "/me/weight-logs/2026-11-12",
      body: { weightKg: "70" },
    },
    {
      method: "post",
      path: "/me/food-entries",
      body: { date: "2026-11-12", meal: "lunch", carbs: "10" },
    },
    { method: "delete", path: "/me/food-entries/1" },
    { method: "put", path: "/me/meal-preferences", body: { mealCount: "4" } },
  ] as const;

  it("answers 401 SESSION_INVALID without a session, on every route", async () => {
    for (const route of [...ptRoutes(), ...userRoutes]) {
      const response = await w.call(
        route.method,
        route.path,
        undefined,
        "body" in route ? route.body : undefined,
      );

      expect(response.status, `${route.method} ${route.path}`).toBe(401);
      expect(response.body.code).toBe("SESSION_INVALID");
    }
  });

  it("keeps PT routes to admins and trainee routes to trainees (403 FORBIDDEN)", async () => {
    for (const route of ptRoutes()) {
      const response = await w.call(
        route.method,
        route.path,
        w.tokens.mine,
        "body" in route ? route.body : undefined,
      );

      expect(response.status, `${route.method} ${route.path}`).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    }
    for (const route of userRoutes) {
      const response = await w.call(
        route.method,
        route.path,
        w.tokens.ptA,
        "body" in route ? route.body : undefined,
      );

      expect(response.status, `${route.method} ${route.path}`).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    }
  });

  it("hides a trainee of another PT, an unassigned one and a missing one alike (404)", async () => {
    for (const userId of [w.ids.theirs, w.ids.unassigned, 999999]) {
      for (const route of [
        { method: "get", path: `/trainees/${userId}/nutrition` },
        {
          method: "put",
          path: `/trainees/${userId}/nutrition-target`,
          body: TARGET_BODY,
        },
        {
          method: "put",
          path: `/trainees/${userId}/body-profile`,
          body: ADMIN_PROFILE,
        },
      ] as const) {
        const response = await w.call(
          route.method,
          route.path,
          w.tokens.ptA,
          "body" in route ? route.body : undefined,
        );

        expect(response.status, `${route.method} ${route.path}`).toBe(404);
        expect(response.body.code).toBe("TRAINEE_NOT_FOUND");
      }
    }
    expect(await targetsOf(w.ids.theirs)).toEqual([]);
    expect(
      await w.ds
        .getRepository(BodyProfile)
        .count({ where: { userId: w.ids.theirs } }),
    ).toBe(0);
  });

  it("lets a super admin work with any trainee", async () => {
    for (const userId of [w.ids.mine, w.ids.theirs, w.ids.unassigned]) {
      expect(
        (
          await w.call(
            "get",
            `/trainees/${userId}/nutrition`,
            w.tokens.superAdmin,
          )
        ).status,
      ).toBe(200);
    }
  });
});

describe("PUT /trainees/:userId/nutrition-target", () => {
  it("stores the manual target from today and lets the PT edit it the same day", async () => {
    await reset(w.ids.mine);

    const created = await w.call(
      "put",
      `/trainees/${w.ids.mine}/nutrition-target`,
      w.tokens.ptA,
      TARGET_BODY,
    );

    expect(created.status).toBe(200);
    expect(created.body).toEqual({
      effectiveFrom: TODAY,
      carbs: 250,
      protein: 160,
      fat: 60,
      note: "Giữ nguyên",
      source: "manual",
    });

    const edited = await w.call(
      "put",
      `/trainees/${w.ids.mine}/nutrition-target`,
      w.tokens.ptA,
      { carbs: "200", protein: "170", fat: "55" },
    );

    expect(edited.status).toBe(200);

    const rows = await targetsOf(w.ids.mine);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      effectiveFrom: TODAY,
      carbs: 200,
      protein: 170,
      fat: 55,
      note: "",
      source: "manual",
    });
  });

  it("keeps an earlier day's target when a new day gets one", async () => {
    await reset(w.ids.mine);
    await w.ds.getRepository(NutritionTarget).save({
      userId: w.ids.mine,
      effectiveFrom: "2026-11-01",
      carbs: 300,
      protein: 150,
      fat: 70,
      note: "old",
      source: "manual",
    });
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/nutrition-target`,
      w.tokens.ptA,
      TARGET_BODY,
    );

    const rows = await targetsOf(w.ids.mine);

    expect(rows.map((row) => [row.effectiveFrom, row.carbs])).toEqual([
      ["2026-11-01", 300],
      [TODAY, 250],
    ]);
  });

  it("rejects bad grams with 400 VALIDATION_FAILED and writes nothing", async () => {
    await reset(w.ids.mine);

    for (const body of [
      { carbs: "", protein: "160", fat: "60" },
      { carbs: "250", protein: "-5", fat: "60" },
      { carbs: "250", protein: "160", fat: "2001" },
      { carbs: "250.5", protein: "160", fat: "60" },
      { carbs: "250", protein: "160", fat: "60", note: "x".repeat(1001) },
    ]) {
      const response = await w.call(
        "put",
        `/trainees/${w.ids.mine}/nutrition-target`,
        w.tokens.ptA,
        body,
      );

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
    expect(await targetsOf(w.ids.mine)).toEqual([]);
  });
});

describe("body profile and TDEE targets", () => {
  it("PT save stores the energy model and fills today's target from the TDEE", async () => {
    await reset(w.ids.mine);

    const response = await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      ADMIN_PROFILE,
    );

    expect(response.status).toBe(200);
    expect(response.body.targetApplied).toBe(true);
    // BMR 1698.75, TDEE 2633.06, target 2333.06; protein 75 x 2; fat 25%.
    expect(response.body.bodyProfile.energyPlan).toEqual({
      age: 30,
      bmr: 1700,
      tdee: 2630,
      targetCalories: 2330,
      isFlooredToBmr: false,
      macros: { carbs: 285, protein: 150, fat: 65 },
    });
    expect(response.body.target).toEqual({
      effectiveFrom: TODAY,
      carbs: 285,
      protein: 150,
      fat: 65,
      note: "",
      source: "tdee",
    });

    const profile = await w.ds
      .getRepository(BodyProfile)
      .findOneByOrFail({ userId: w.ids.mine });

    expect(profile).toMatchObject({
      sex: "male",
      birthYear: 1996,
      heightCm: 175,
      weightKg: 75,
      activityLevel: "moderate",
      goal: "cut",
      kcalAdjustment: -300,
      proteinPerKg: 2,
    });
    expect(
      (await targetsOf(w.ids.mine)).map((row) => [
        row.source,
        row.carbs,
        row.protein,
        row.fat,
      ]),
    ).toEqual([["tdee", 285, 150, 65]]);
    // The weigh-in of the day follows the profile.
    expect(
      await w.ds
        .getRepository(WeightLog)
        .findOneByOrFail({ userId: w.ids.mine, date: TODAY }),
    ).toMatchObject({ weightKg: 75 });
  });

  it("accepts the form checkbox value 'on' and a decimal comma", async () => {
    await reset(w.ids.mine);

    const response = await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      {
        ...ADMIN_PROFILE,
        weightKg: "75,5",
        applyToTarget: "on",
        kcalAdjustment: "+200",
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.targetApplied).toBe(true);
    expect(response.body.bodyProfile.profile).toMatchObject({
      weightKg: 75.5,
      kcalAdjustment: 200,
      goal: "bulk",
    });
  });

  it("does not touch the target when applyToTarget is off, and keeps the coach note when on", async () => {
    await reset(w.ids.mine);
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/nutrition-target`,
      w.tokens.ptA,
      TARGET_BODY,
    );

    const off = await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      { ...ADMIN_PROFILE, applyToTarget: false },
    );

    expect(off.body.targetApplied).toBe(false);
    expect(off.body.target).toMatchObject({ carbs: 250, source: "manual" });

    const on = await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      ADMIN_PROFILE,
    );
    const rows = await targetsOf(w.ids.mine);

    expect(on.body.targetApplied).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      carbs: 285,
      protein: 150,
      fat: 65,
      note: "Giữ nguyên",
      source: "tdee",
    });
  });

  it("floors the target at the BMR", async () => {
    await reset(w.ids.mine);

    const response = await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      {
        ...ADMIN_PROFILE,
        kcalAdjustment: "-1500",
        proteinPerKg: "1",
      },
    );

    expect(response.body.bodyProfile.energyPlan).toMatchObject({
      bmr: 1700,
      targetCalories: 1700,
      isFlooredToBmr: true,
    });
  });

  it("rejects out-of-range measurements and a protein with two decimals", async () => {
    for (const patch of [
      { age: "11" },
      { age: "30.5" },
      { heightCm: "119" },
      { weightKg: "251" },
      { kcalAdjustment: "1501" },
      { proteinPerKg: "1.65" },
      { proteinPerKg: "3.1" },
      { sex: "other" },
      { activityLevel: "none" },
    ]) {
      const response = await w.call(
        "put",
        `/trainees/${w.ids.mine}/body-profile`,
        w.tokens.ptA,
        { ...ADMIN_PROFILE, ...patch },
      );

      expect(response.status, JSON.stringify(patch)).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
  });

  it("trainee save follows the TDEE with the legacy goal and leaves the energy model null", async () => {
    await reset(w.ids.mine);

    const response = await w.call(
      "put",
      `/me/body-profile`,
      w.tokens.mine,
      USER_PROFILE,
    );

    expect(response.status).toBe(200);
    expect(response.body.targetApplied).toBe(true);
    // Legacy: maintain = TDEE 2633, protein 75 x 1.8 = 135, fat 75, carbs 355.
    expect(response.body.target).toMatchObject({
      carbs: 355,
      protein: 135,
      fat: 75,
      source: "tdee",
    });

    const profile = await w.ds
      .getRepository(BodyProfile)
      .findOneByOrFail({ userId: w.ids.mine });

    expect(profile.kcalAdjustment).toBeNull();
    expect(profile.proteinPerKg).toBeNull();
    expect(profile.goal).toBe("maintain");
  });

  it("trainee save never writes the energy model or the goal once the PT set it, and keeps a manual target", async () => {
    await reset(w.ids.mine);
    await w.call("put", `/trainees/${w.ids.mine}/body-profile`, w.tokens.ptA, {
      ...ADMIN_PROFILE,
      applyToTarget: false,
    });
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/nutrition-target`,
      w.tokens.ptA,
      TARGET_BODY,
    );

    const response = await w.call("put", `/me/body-profile`, w.tokens.mine, {
      ...USER_PROFILE,
      goal: "bulk",
      weightKg: "80",
    });

    expect(response.status).toBe(200);
    expect(response.body.targetApplied).toBe(false);
    expect(response.body.target).toMatchObject({
      carbs: 250,
      source: "manual",
    });

    const profile = await w.ds
      .getRepository(BodyProfile)
      .findOneByOrFail({ userId: w.ids.mine });

    expect(profile).toMatchObject({
      weightKg: 80,
      goal: "cut",
      kcalAdjustment: -300,
      proteinPerKg: 2,
    });
  });

  it("trainee save replaces a TDEE target but a manual one stays", async () => {
    await reset(w.ids.mine);
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      ADMIN_PROFILE,
    );

    const response = await w.call("put", `/me/body-profile`, w.tokens.mine, {
      ...USER_PROFILE,
      weightKg: "80",
    });

    expect(response.body.targetApplied).toBe(true);
    // Energy model stays: -300 kcal, 2 g/kg of 80 kg.
    expect(response.body.target).toMatchObject({
      carbs: 295,
      protein: 160,
      fat: 65,
      source: "tdee",
    });
    expect(await targetsOf(w.ids.mine)).toHaveLength(1);
  });
});

describe("PUT /me/weight-logs/:date", () => {
  it("records today's weight and replaces it when saved again", async () => {
    await reset(w.ids.mine);

    const first = await w.call(
      "put",
      `/me/weight-logs/${TODAY}`,
      w.tokens.mine,
      { weightKg: "72,5" },
    );

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      weightLog: { date: TODAY, weightKg: 72.5 },
      targetApplied: false,
    });
    await w.call("put", `/me/weight-logs/${TODAY}`, w.tokens.mine, {
      weightKg: "72",
    });

    const rows = await w.ds
      .getRepository(WeightLog)
      .find({ where: { userId: w.ids.mine } });

    expect(rows.map((row) => [row.date, row.weightKg])).toEqual([[TODAY, 72]]);
  });

  it("moves the profile weight and the TDEE target with the newest weigh-in", async () => {
    await reset(w.ids.mine);
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      ADMIN_PROFILE,
    );

    const response = await w.call(
      "put",
      `/me/weight-logs/${TODAY}`,
      w.tokens.mine,
      { weightKg: "80" },
    );

    expect(response.body.targetApplied).toBe(true);
    expect(
      await w.ds
        .getRepository(BodyProfile)
        .findOneByOrFail({ userId: w.ids.mine }),
    ).toMatchObject({ weightKg: 80 });
    expect(await targetsOf(w.ids.mine)).toMatchObject([
      { carbs: 295, protein: 160, fat: 65, source: "tdee" },
    ]);
  });

  it("leaves a manual target alone", async () => {
    await reset(w.ids.mine);
    await w.call("put", `/trainees/${w.ids.mine}/body-profile`, w.tokens.ptA, {
      ...ADMIN_PROFILE,
      applyToTarget: false,
    });
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/nutrition-target`,
      w.tokens.ptA,
      TARGET_BODY,
    );

    const response = await w.call(
      "put",
      `/me/weight-logs/${TODAY}`,
      w.tokens.mine,
      { weightKg: "80" },
    );

    expect(response.body.targetApplied).toBe(false);
    expect(
      await w.ds
        .getRepository(BodyProfile)
        .findOneByOrFail({ userId: w.ids.mine }),
    ).toMatchObject({ weightKg: 80 });
    expect(await targetsOf(w.ids.mine)).toMatchObject([
      { carbs: 250, source: "manual" },
    ]);
  });

  it("an older weigh-in does not move the profile", async () => {
    await reset(w.ids.mine);
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      ADMIN_PROFILE,
    );

    const response = await w.call(
      "put",
      `/me/weight-logs/2026-11-10`,
      w.tokens.mine,
      { weightKg: "90" },
    );

    expect(response.status).toBe(200);
    expect(response.body.targetApplied).toBe(false);
    expect(
      await w.ds
        .getRepository(BodyProfile)
        .findOneByOrFail({ userId: w.ids.mine }),
    ).toMatchObject({ weightKg: 75 });
    expect(
      await w.ds
        .getRepository(WeightLog)
        .count({ where: { userId: w.ids.mine } }),
    ).toBe(2);
  });

  it("rejects a future day, a bad date and a bad weight", async () => {
    await reset(w.ids.mine);

    const future = await w.call(
      "put",
      `/me/weight-logs/2026-11-13`,
      w.tokens.mine,
      { weightKg: "70" },
    );

    expect(future.status).toBe(400);
    expect(future.body.code).toBe("FUTURE_DATE");
    expect(future.body.message).toBe("Chưa tới ngày này");
    expect(
      (
        await w.call("put", `/me/weight-logs/2026-02-30`, w.tokens.mine, {
          weightKg: "70",
        })
      ).status,
    ).toBe(400);
    for (const weightKg of ["29", "251", "abc", ""]) {
      expect(
        (
          await w.call("put", `/me/weight-logs/${TODAY}`, w.tokens.mine, {
            weightKg,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      await w.ds
        .getRepository(WeightLog)
        .count({ where: { userId: w.ids.mine } }),
    ).toBe(0);
  });
});

describe("food entries", () => {
  it("creates, edits (date stays) and deletes the trainee's own entries", async () => {
    await reset(w.ids.mine);

    const created = await w.call("post", "/me/food-entries", w.tokens.mine, {
      date: "2026-11-10",
      meal: "lunch",
      description: "  Cơm gà ",
      carbs: "60",
      protein: "30",
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      date: "2026-11-10",
      meal: "lunch",
      description: "Cơm gà",
      carbs: 60,
      protein: 30,
      fat: null,
    });

    const id = created.body.id as number;
    const edited = await w.call(
      "put",
      `/me/food-entries/${id}`,
      w.tokens.mine,
      {
        date: "2026-11-11",
        meal: "dinner",
        description: "Phở",
        fat: "12",
      },
    );

    expect(edited.status).toBe(200);
    expect(edited.body).toEqual({
      id,
      date: "2026-11-10",
      meal: "dinner",
      description: "Phở",
      carbs: null,
      protein: null,
      fat: 12,
    });

    const deleted = await w.call(
      "delete",
      `/me/food-entries/${id}`,
      w.tokens.mine,
    );

    expect(deleted.status).toBe(204);
    expect(
      await w.ds
        .getRepository(FoodEntry)
        .count({ where: { userId: w.ids.mine } }),
    ).toBe(0);
  });

  it("refuses an empty entry and a future day", async () => {
    const empty = await w.call("post", "/me/food-entries", w.tokens.mine, {
      date: TODAY,
      meal: "snack",
    });

    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({
      code: "ENTRY_EMPTY",
      message: "Nhập món đã ăn hoặc số gram",
    });

    const future = await w.call("post", "/me/food-entries", w.tokens.mine, {
      date: "2026-11-13",
      meal: "snack",
      description: "x",
    });

    expect(future.body).toMatchObject({
      code: "FUTURE_DATE",
      message: "Chưa tới ngày này",
    });
    expect(
      (
        await w.call("post", "/me/food-entries", w.tokens.mine, {
          date: TODAY,
          meal: "brunch",
          description: "x",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await w.call("post", "/me/food-entries", w.tokens.mine, {
          date: TODAY,
          meal: "lunch",
          carbs: "2001",
        })
      ).status,
    ).toBe(400);
  });

  it("cannot edit or delete another trainee's entry", async () => {
    await reset(w.ids.theirs);

    const theirs = await w.ds.getRepository(FoodEntry).save({
      userId: w.ids.theirs,
      date: TODAY,
      meal: "lunch",
      description: "của họ",
      carbs: 10,
    });
    const edit = await w.call(
      "put",
      `/me/food-entries/${theirs.id}`,
      w.tokens.mine,
      { date: TODAY, meal: "lunch", description: "hack" },
    );

    expect(edit.status).toBe(404);
    expect(edit.body).toMatchObject({
      code: "ENTRY_NOT_FOUND",
      message: "Bữa ăn không còn tồn tại",
    });
    expect(
      (await w.call("delete", `/me/food-entries/${theirs.id}`, w.tokens.mine))
        .status,
    ).toBe(204);
    expect(
      await w.ds.getRepository(FoodEntry).findOneByOrFail({ id: theirs.id }),
    ).toMatchObject({ description: "của họ" });
  });
});

describe("GET /me/nutrition and /trainees/:userId/nutrition", () => {
  it("builds the week from Monday to Sunday and does not leak entries across the week boundary", async () => {
    await reset(w.ids.mine);
    await w.ds.getRepository(NutritionTarget).save({
      userId: w.ids.mine,
      effectiveFrom: "2026-11-01",
      carbs: 250,
      protein: 160,
      fat: 60,
      note: "",
      source: "manual",
    });

    const entries = w.ds.getRepository(FoodEntry);

    await entries.save([
      {
        userId: w.ids.mine,
        date: "2026-11-08",
        meal: "lunch",
        description: "Chủ nhật trước",
        carbs: 100,
      },
      {
        userId: w.ids.mine,
        date: "2026-11-09",
        meal: "lunch",
        description: "Thứ hai",
        carbs: 20,
        protein: 30,
      },
      {
        userId: w.ids.mine,
        date: "2026-11-15",
        meal: "dinner",
        description: "Chủ nhật",
        fat: 10,
      },
      {
        userId: w.ids.mine,
        date: "2026-11-16",
        meal: "dinner",
        description: "Thứ hai sau",
        carbs: 999,
      },
      {
        userId: w.ids.theirs,
        date: "2026-11-10",
        meal: "lunch",
        description: "người khác",
        carbs: 500,
      },
    ]);

    // Any day of the week snaps to its Monday.
    const response = await w.call(
      "get",
      "/me/nutrition?week=2026-11-13",
      w.tokens.mine,
    );

    expect(response.status).toBe(200);
    expect(response.body.today).toBe(TODAY);
    expect(response.body.weekStart).toBe("2026-11-09");
    expect(response.body.days.map((day: { date: string }) => day.date)).toEqual(
      [
        "2026-11-09",
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
        "2026-11-15",
      ],
    );

    const [monday, tuesday, , , , , sunday] = response.body.days;

    expect(
      monday.entries.map((entry: { description: string }) => entry.description),
    ).toEqual(["Thứ hai"]);
    expect(monday).toMatchObject({
      loggedCount: 1,
      totals: { carbs: 20, protein: 30, fat: 0 },
      totalKcal: 200,
    });
    expect(tuesday).toMatchObject({
      loggedCount: 0,
      entries: [],
      totalKcal: 0,
    });
    expect(sunday).toMatchObject({
      loggedCount: 1,
      totals: { carbs: 0, protein: 0, fat: 10 },
      totalKcal: 90,
    });
    // The 2026-11-01 target applies to the whole week.
    expect(monday.target).toMatchObject({
      effectiveFrom: "2026-11-01",
      carbs: 250,
    });
    expect(response.body.summary).toEqual({
      loggedDays: 2,
      averages: { carbs: 10, protein: 15, fat: 5 },
      averageKcal: 145,
      onTargetDays: 0,
    });
    expect(response.body.latestTarget).toMatchObject({
      effectiveFrom: "2026-11-01",
    });

    // The next week sees only its own Monday.
    const next = await w.call(
      "get",
      "/me/nutrition?week=2026-11-16",
      w.tokens.mine,
    );

    expect(next.body.weekStart).toBe("2026-11-16");
    expect(next.body.summary).toMatchObject({
      loggedDays: 1,
      averages: { carbs: 999 },
    });
    // And the previous week only its Sunday.
    const previous = await w.call(
      "get",
      "/me/nutrition?week=2026-11-08",
      w.tokens.mine,
    );

    expect(previous.body.weekStart).toBe("2026-11-02");
    expect(previous.body.days[6]).toMatchObject({
      date: "2026-11-08",
      loggedCount: 1,
      totals: { carbs: 100 },
    });
    expect(previous.body.summary.loggedDays).toBe(1);
  });

  it("counts a day on target when kcal and every macro are within the rule", async () => {
    await reset(w.ids.mine);
    await w.ds.getRepository(NutritionTarget).save({
      userId: w.ids.mine,
      effectiveFrom: "2026-11-01",
      carbs: 250,
      protein: 160,
      fat: 60,
      note: "",
      source: "manual",
    });
    await w.ds.getRepository(FoodEntry).save([
      // Exactly the target: 250 C, 160 P, 60 F.
      {
        userId: w.ids.mine,
        date: "2026-11-09",
        meal: "lunch",
        description: "đúng",
        carbs: 250,
        protein: 160,
        fat: 60,
      },
      // Protein above the target is fine, carbs 20 g over is not.
      {
        userId: w.ids.mine,
        date: "2026-11-10",
        meal: "lunch",
        description: "dư",
        carbs: 270,
        protein: 200,
        fat: 60,
      },
    ]);

    const response = await w.call(
      "get",
      `/trainees/${w.ids.mine}/nutrition?week=${TODAY}`,
      w.tokens.ptA,
    );

    expect(response.status).toBe(200);
    expect(response.body.summary.onTargetDays).toBe(1);
  });

  it("returns the body profile with its energy plan and the 12-week weight chart", async () => {
    await reset(w.ids.mine);
    await w.call(
      "put",
      `/trainees/${w.ids.mine}/body-profile`,
      w.tokens.ptA,
      ADMIN_PROFILE,
    );
    await w.ds.getRepository(WeightLog).clear();
    await w.ds.getRepository(WeightLog).save([
      { userId: w.ids.mine, date: "2026-11-02", weightKg: 71 },
      { userId: w.ids.mine, date: "2026-11-08", weightKg: 70 },
      { userId: w.ids.mine, date: "2026-11-09", weightKg: 69 },
      { userId: w.ids.mine, date: TODAY, weightKg: 69.4 },
      { userId: w.ids.mine, date: "2026-09-01", weightKg: 80 },
    ]);

    const response = await w.call("get", "/me/nutrition", w.tokens.mine);

    expect(response.body.bodyProfile.energyPlan.macros).toEqual({
      carbs: 285,
      protein: 150,
      fat: 65,
    });
    expect(response.body.latestTarget).toMatchObject({ source: "tdee" });
    expect(response.body.todayWeight).toBe(69.4);
    expect(response.body.weightWeeks).toHaveLength(12);
    expect(response.body.weightWeeks.slice(-2)).toEqual([
      { weekStart: "2026-11-02", averageKg: 70.5, count: 2 },
      { weekStart: "2026-11-09", averageKg: 69.2, count: 2 },
    ]);
    // 2026-09-01 is before the 12 weeks (first week starts 2026-08-24 + ... ) of the chart? It is inside: Monday 2026-08-31.
    expect(response.body.weightWeeks[0].weekStart).toBe("2026-08-24");
    expect(response.body.weightWeeks[1]).toEqual({
      weekStart: "2026-08-31",
      averageKg: 80,
      count: 1,
    });
    expect(response.body.weightChange).toEqual({
      latest: 69.2,
      weekChange: -1.3,
      totalChange: -10.8,
    });
  });

  it("has no body profile, target or weight for a new trainee", async () => {
    await reset(w.ids.theirs);

    const response = await w.call("get", "/me/nutrition", w.tokens.theirs);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      latestTarget: null,
      bodyProfile: null,
      todayWeight: null,
      summary: {
        loggedDays: 0,
        averages: { carbs: 0, protein: 0, fat: 0 },
        averageKcal: 0,
        onTargetDays: 0,
      },
    });
    expect(
      response.body.days.every(
        (day: { target: unknown }) => day.target === null,
      ),
    ).toBe(true);
  });

  it("rejects a malformed week", async () => {
    for (const week of ["2026-13-01", "abc", "2026-11-1"]) {
      expect(
        (await w.call("get", `/me/nutrition?week=${week}`, w.tokens.mine))
          .status,
      ).toBe(400);
    }
  });
});

describe("PUT /me/meal-preferences", () => {
  it("saves the count and the note for the signed-in trainee only, and clears them", async () => {
    const saved = await w.call("put", "/me/meal-preferences", w.tokens.mine, {
      mealCount: "5",
      foodNote: "  không   hành ",
    });

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      preferredMealCount: 5,
      foodNote: "không hành",
    });
    expect(
      await w.ds.getRepository(User).findOneByOrFail({ id: w.ids.mine }),
    ).toMatchObject({ preferredMealCount: 5, foodNote: "không hành" });
    expect(
      (await w.ds.getRepository(User).findOneByOrFail({ id: w.ids.theirs }))
        .preferredMealCount,
    ).toBeNull();

    const cleared = await w.call("put", "/me/meal-preferences", w.tokens.mine, {
      mealCount: "",
      foodNote: "",
    });

    expect(cleared.body).toEqual({ preferredMealCount: null, foodNote: null });
  });

  it("refuses 1, 7, 3.5, text and a long note, keeping what was saved", async () => {
    await w.call("put", "/me/meal-preferences", w.tokens.mine, {
      mealCount: "4",
      foodNote: "giữ",
    });

    for (const body of [
      { mealCount: "1" },
      { mealCount: "7" },
      { mealCount: "3.5" },
      { mealCount: "abc" },
      { foodNote: "x".repeat(501) },
    ]) {
      expect(
        (await w.call("put", "/me/meal-preferences", w.tokens.mine, body))
          .status,
      ).toBe(400);
    }
    expect(
      await w.ds.getRepository(User).findOneByOrFail({ id: w.ids.mine }),
    ).toMatchObject({ preferredMealCount: 4, foodNote: "giữ" });
  });
});
