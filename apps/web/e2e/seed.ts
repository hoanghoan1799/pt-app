import { createClient } from "@libsql/client";
import { toNameKey } from "@pt/contracts";
import { addDays } from "@pt/contracts";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { TIME_ZONE } from "@/constants/time";
import * as schema from "@/db/schema";
import { hashPassword } from "@/services/password";
import { toEmailKey } from "@/utils/email";
import { toUsernameKey } from "@/utils/username";
import { getTodayDate } from "@/utils/week";

import {
  E2E_ADMIN,
  E2E_CHANGER_NAME,
  E2E_CHAT_NAME,
  E2E_CHAT_OFF_NAME,
  E2E_EMPTY_NAME,
  E2E_LIFTER_NAME,
  E2E_LOCKED_NAME,
  E2E_LOGGER_NAME,
  E2E_PLANNER_NAME,
  E2E_RESET_NAME,
  E2E_RINGS_NAME,
  E2E_USER_NAME,
  E2E_USER_PASSWORD,
  e2eEmail,
} from "./config";

// Trainee row with an email and a scrypt hash, as the admin UI creates them.
// One hash is reused: scrypt is slow and the password is shared.
let traineeHash: string | undefined;
const traineeValues = async (name: string) => {
  traineeHash ??= await hashPassword(E2E_USER_PASSWORD);
  const email = e2eEmail(name);

  return {
    name,
    nameKey: toNameKey(name),
    email,
    emailKey: toEmailKey(email),
    passwordHash: traineeHash,
  };
};

// Exercise titles the spec looks up by name.
export const E2E_EXERCISES = {
  BENCH: "E2E Bench press",
  SQUAT: "E2E Squat",
  ROWS: "E2E Row limit",
  PLANK: "E2E Plank",
  // Timed, but sets were logged before the PT made it timed (KAN-44).
  TIMED_LOGGED: "E2E Timed with sets",
  FUTURE: "E2E Future curl",
  // 4 planned sets, nothing logged: the partial-save test (KAN-50).
  PARTIAL: "E2E Partial sets",
} as const;

// Exercises of the PT specs (E2E_LIFTER_NAME). SQUAT beats last week (record),
// PRESS is logged for the first time, CURL has no sets, TEMP is deleted.
export const E2E_PT_EXERCISES = {
  SQUAT: "E2E PT Squat",
  PRESS: "E2E PT Press",
  CURL: "E2E PT Curl",
  // No sets; the delete test removes it.
  TEMP: "E2E PT Temp",
  // Has sets; the link-change test (KAN-39) replaces its video.
  LINK: "E2E PT Link",
  // No sets when seeded; the stale-page delete test (KAN-51) logs one itself.
  STALE: "E2E PT Stale",
} as const;

// Foods of the food library specs (KAN-65). Values are per 100 g.
export const E2E_FOODS = {
  CHICKEN: "Ức gà (chín)",
  CHICKEN_RAW: "Ức gà (sống)",
  RICE: "Cơm trắng (chín)",
  SALMON: "Cá hồi (chín)",
  // Meal plan specs (KAN-69): the spec's worked example and fat suggestions.
  BROCCOLI: "Bông cải xanh (luộc)",
  OLIVE_OIL: "Dầu ô liu",
  ALMOND: "Hạnh nhân",
} as const;

const E2E_FOOD_ROWS = [
  {
    name: E2E_FOODS.CHICKEN,
    group: "meat",
    state: "cooked",
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
  },
  {
    name: E2E_FOODS.CHICKEN_RAW,
    group: "meat",
    state: "raw",
    kcal: 120,
    protein: 22.5,
    carbs: 0,
    fat: 2.6,
  },
  {
    name: E2E_FOODS.RICE,
    group: "starch",
    state: "cooked",
    kcal: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3,
    // 1 chén = 160 g
    servingLabel: "1 chén",
    servingGrams: 160,
  },
  {
    name: E2E_FOODS.SALMON,
    group: "seafood",
    state: "cooked",
    kcal: 206,
    protein: 22.1,
    carbs: 0,
    fat: 12.4,
  },
  {
    name: E2E_FOODS.BROCCOLI,
    group: "vegetable",
    state: "cooked",
    kcal: 35,
    protein: 2.4,
    carbs: 7.2,
    fat: 0.4,
  },
  {
    name: E2E_FOODS.OLIVE_OIL,
    group: "fat_oil",
    state: null,
    kcal: 884,
    protein: 0,
    carbs: 0,
    fat: 100,
  },
  {
    name: E2E_FOODS.ALMOND,
    group: "legume_nut",
    state: null,
    kcal: 579,
    protein: 21.2,
    carbs: 21.6,
    fat: 49.9,
  },
] as const;

// The video the link-change test switches to.
export const E2E_NEW_VIDEO_ID = "dQw4w9WgXcQ";

// Dates are relative to the run date: only today and past days are loggable.
export const getE2eDates = (now = new Date()) => {
  const today = getTodayDate(TIME_ZONE, now);

  return {
    today,
    previous: addDays(today, -7),
    future: addDays(today, 1),
  };
};

// Plan of E2E Logger for `today`: three meals that add up to P 177 / C 253.8 /
// F 40.1 g = 2,084.1 kcal, 9 kcal above the 2,075 kcal target (no notice).
const LOGGER_PLAN = [
  {
    name: "Bữa sáng",
    items: [
      { food: E2E_FOODS.CHICKEN, grams: 200 },
      { food: E2E_FOODS.RICE, grams: 300 },
    ],
  },
  {
    name: "Bữa trưa",
    items: [
      { food: E2E_FOODS.RICE, grams: 400 },
      { food: E2E_FOODS.SALMON, grams: 200 },
    ],
  },
  {
    name: "Bữa tối",
    items: [
      { food: E2E_FOODS.RICE, grams: 200 },
      { food: E2E_FOODS.CHICKEN, grams: 150 },
    ],
  },
];

const getFoodIdResolver = async (db: LibSQLDatabase<typeof schema>) => {
  const library = await db.select().from(schema.foods);

  return (name: string) => {
    const food = library.find((row) => row.name === name);

    if (!food) {
      throw new Error(`e2e seed: missing food ${name}`);
    }

    return food.id;
  };
};

// Inserts LOGGER_PLAN for one day and returns the ids of its meals in order.
const insertLoggerPlan = async (
  db: LibSQLDatabase<typeof schema>,
  userId: number,
  date: string,
  foodId: (name: string) => number,
) => {
  const [day] = await db
    .insert(schema.mealPlanDays)
    .values({ userId, date })
    .returning();
  const mealIds: number[] = [];

  for (const [position, meal] of LOGGER_PLAN.entries()) {
    const [row] = await db
      .insert(schema.mealPlanMeals)
      .values({ dayId: day.id, position, name: meal.name })
      .returning();

    mealIds.push(row.id);
    await db.insert(schema.mealPlanItems).values(
      meal.items.map((item) => ({
        mealId: row.id,
        foodId: foodId(item.food),
        grams: item.grams,
      })),
    );
  }

  return mealIds;
};

// Trainee of the nutrition tab spec (KAN-125): target P 160 / C 235 / F 55 g
// and LOGGER_PLAN for yesterday and today. The marks and the extra food are
// added by e2e/nutrition-tab.spec.ts itself, because meal-log.spec.ts counts
// every row of meal_logs and meal_marks.
const seedRings = async (
  db: LibSQLDatabase<typeof schema>,
  today: string,
  yesterday: string,
) => {
  const [rings] = await db
    .insert(schema.users)
    .values(await traineeValues(E2E_RINGS_NAME))
    .returning();
  const foodId = await getFoodIdResolver(db);

  await db.insert(schema.nutritionTargets).values({
    userId: rings.id,
    effectiveFrom: "2020-01-01",
    protein: 160,
    carbs: 235,
    fat: 55,
    source: "manual",
  });

  await insertLoggerPlan(db, rings.id, yesterday, foodId);
  await insertLoggerPlan(db, rings.id, today, foodId);
};

const seedLogger = async (db: LibSQLDatabase<typeof schema>, today: string) => {
  const [logger] = await db
    .insert(schema.users)
    .values(await traineeValues(E2E_LOGGER_NAME))
    .returning();
  const foodId = await getFoodIdResolver(db);

  await db.insert(schema.nutritionTargets).values({
    userId: logger.id,
    effectiveFrom: "2020-01-01",
    protein: 160,
    carbs: 235,
    fat: 55,
    source: "manual",
  });
  await insertLoggerPlan(db, logger.id, today, foodId);

  // From before meal plans: still shown, read-only (C5).
  await db.insert(schema.foodEntries).values({
    userId: logger.id,
    date: today,
    meal: "lunch",
    description: "Cơm gà ăn trước khi có plan",
    carbs: 60,
    protein: 30,
    fat: 10,
  });
};

export const seedE2eDatabase = async (url: string) => {
  if (!url.startsWith("file:")) {
    throw new Error("e2e seed only runs against a file: SQLite URL");
  }
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  const { today } = getE2eDates();

  // Failed-login counters start clean on every run (KAN-86).
  await db.delete(schema.loginAttempts);

  await db.insert(schema.users).values(await traineeValues(E2E_USER_NAME));

  // PT views: an admin account, a lifter with two sessions and an empty trainee.
  await db.insert(schema.admins).values({
    username: E2E_ADMIN.username,
    usernameKey: toUsernameKey(E2E_ADMIN.username),
    passwordHash: await hashPassword(E2E_ADMIN.password),
  });
  // Workouts of the trainees below are created through the API
  // (api-seed-workouts.ts); only the rows that fix their ids live here.
  await db.insert(schema.users).values(await traineeValues(E2E_LIFTER_NAME));

  await db.insert(schema.users).values(await traineeValues(E2E_EMPTY_NAME));

  // Login specs (KAN-86): one trainee per spec that locks or changes credentials.
  await db
    .insert(schema.users)
    .values([
      await traineeValues(E2E_LOCKED_NAME),
      await traineeValues(E2E_CHANGER_NAME),
      await traineeValues(E2E_RESET_NAME),
    ]);

  // Chat specs (KAN-102): both start with chat locked (chat_enabled null).
  await db
    .insert(schema.users)
    .values([
      await traineeValues(E2E_CHAT_OFF_NAME),
      await traineeValues(E2E_CHAT_NAME),
    ]);

  await db.insert(schema.foods).values(
    E2E_FOOD_ROWS.map((food) => ({
      ...food,
      nameKey: toNameKey(food.name),
      source: "e2e",
    })),
  );

  const [planner] = await db
    .insert(schema.users)
    .values(await traineeValues(E2E_PLANNER_NAME))
    .returning();

  await db.insert(schema.nutritionTargets).values({
    userId: planner.id,
    effectiveFrom: "2020-01-01",
    protein: 160,
    carbs: 235,
    fat: 55,
    source: "manual",
  });

  await seedLogger(db, today);
  await seedRings(db, today, addDays(today, -1));

  client.close();
};
