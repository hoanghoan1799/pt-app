import { addDays } from "@pt/contracts";

import { withApiDb } from "./api-db";
import {
  E2E_ADMIN,
  E2E_API_URL,
  E2E_LOGGER_NAME,
  E2E_PLANNER_NAME,
  E2E_RINGS_NAME,
  E2E_USER_PASSWORD,
  e2eEmail,
} from "./config";
import { E2E_FOODS, getE2eDates } from "./seed";

// Nutrition data of the e2e suite, created through the API (the food library,
// targets, meal plans, one old food entry), and helpers for the specs that
// look at or bend the PostgreSQL behind it. The people already exist
// (e2e/api-seed.ts), with the same ids as in the legacy SQLite seed.

type Json = Record<string, unknown>;

const call = async <T = Json>(
  method: string,
  path: string,
  { token, body }: { token?: string; body?: Json } = {},
) => {
  const response = await fetch(`${E2E_API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `e2e nutrition seed: ${method} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return (response.status === 204 ? {} : await response.json()) as T;
};

const loginAdmin = async () =>
  (
    await call<{ token: string }>("POST", "/v1/auth/admin/login", {
      body: {
        username: E2E_ADMIN.username,
        password: E2E_ADMIN.password,
        clientKind: "web",
      },
    })
  ).token;

const loginTrainee = async (name: string) =>
  (
    await call<{ token: string }>("POST", "/v1/auth/login", {
      body: {
        email: e2eEmail(name),
        password: E2E_USER_PASSWORD,
        clientKind: "web",
      },
    })
  ).token;

// Foods of the food library specs (KAN-65), per 100 g. "confirmed" skips the
// kcal gap check: the numbers are the specs' worked examples.
const FOOD_ROWS = [
  {
    name: E2E_FOODS.CHICKEN,
    group: "meat",
    state: "cooked",
    kcal: "165",
    protein: "31",
    carbs: "0",
    fat: "3.6",
  },
  {
    name: E2E_FOODS.CHICKEN_RAW,
    group: "meat",
    state: "raw",
    kcal: "120",
    protein: "22.5",
    carbs: "0",
    fat: "2.6",
  },
  {
    name: E2E_FOODS.RICE,
    group: "starch",
    state: "cooked",
    kcal: "130",
    protein: "2.7",
    carbs: "28.2",
    fat: "0.3",
    // 1 chén = 160 g
    servingLabel: "1 chén",
    servingGrams: "160",
  },
  {
    name: E2E_FOODS.SALMON,
    group: "seafood",
    state: "cooked",
    kcal: "206",
    protein: "22.1",
    carbs: "0",
    fat: "12.4",
  },
  {
    name: E2E_FOODS.BROCCOLI,
    group: "vegetable",
    state: "cooked",
    kcal: "35",
    protein: "2.4",
    carbs: "7.2",
    fat: "0.4",
  },
  {
    name: E2E_FOODS.OLIVE_OIL,
    group: "fat_oil",
    kcal: "884",
    protein: "0",
    carbs: "0",
    fat: "100",
  },
  {
    name: E2E_FOODS.ALMOND,
    group: "legume_nut",
    kcal: "579",
    protein: "21.2",
    carbs: "21.6",
    fat: "49.9",
  },
] as const;

// Plan of E2E Logger for `today`: three meals that add up to P 177 / C 253.8 /
// F 40.1 g = 2,084.1 kcal, 9 kcal above the 2,075 kcal target (no notice).
const LOGGER_PLAN = [
  [
    { food: E2E_FOODS.CHICKEN, grams: 200 },
    { food: E2E_FOODS.RICE, grams: 300 },
  ],
  [
    { food: E2E_FOODS.RICE, grams: 400 },
    { food: E2E_FOODS.SALMON, grams: 200 },
  ],
  [
    { food: E2E_FOODS.RICE, grams: 200 },
    { food: E2E_FOODS.CHICKEN, grams: 150 },
  ],
];

const TARGET = { carbs: "235", protein: "160", fat: "55", note: "" };

const seedFoods = async (adminToken: string) => {
  const ids = new Map<string, number>();

  for (const row of FOOD_ROWS) {
    const food = await call<{ id: number }>("POST", "/v1/foods", {
      token: adminToken,
      body: { ...row, source: "e2e", confirmed: true },
    });

    ids.set(row.name, food.id);
  }
  return ids;
};

const getTraineeId = async (token: string) =>
  (await call<{ actor: { id: number } }>("GET", "/v1/auth/me", { token })).actor
    .id;

// The plan of one day with the default meals (Bữa sáng, trưa, tối) and the
// foods of LOGGER_PLAN.
const seedLoggerPlan = async (
  adminToken: string,
  userId: number,
  date: string,
  foodIds: Map<string, number>,
) => {
  await call("POST", `/v1/trainees/${userId}/meal-plan-days`, {
    token: adminToken,
    body: { date },
  });

  const week = await call<{
    days: { date: string; meals: { id: number }[] }[];
  }>("GET", `/v1/trainees/${userId}/meal-plan-days?week=${date}`, {
    token: adminToken,
  });
  const day = week.days.find((item) => item.date === date);

  if (!day || day.meals.length !== LOGGER_PLAN.length) {
    throw new Error(`e2e nutrition seed: no default meals on ${date}`);
  }

  for (const [index, items] of LOGGER_PLAN.entries()) {
    for (const item of items) {
      await call("POST", `/v1/meals/${day.meals[index].id}/items`, {
        token: adminToken,
        body: { foodId: foodIds.get(item.food), grams: item.grams },
      });
    }
  }
};

export const seedNutritionInApi = async () => {
  const { today } = getE2eDates();
  const adminToken = await loginAdmin();
  const foodIds = await seedFoods(adminToken);
  const [plannerToken, loggerToken, ringsToken] = await Promise.all([
    loginTrainee(E2E_PLANNER_NAME),
    loginTrainee(E2E_LOGGER_NAME),
    loginTrainee(E2E_RINGS_NAME),
  ]);
  const planner = await getTraineeId(plannerToken);
  const logger = await getTraineeId(loggerToken);
  const rings = await getTraineeId(ringsToken);

  // A manual target from today on; days before it use it too (KAN-90).
  for (const userId of [planner, logger, rings]) {
    await call("PUT", `/v1/trainees/${userId}/nutrition-target`, {
      token: adminToken,
      body: TARGET,
    });
  }

  await seedLoggerPlan(adminToken, logger, today, foodIds);
  await seedLoggerPlan(adminToken, rings, addDays(today, -1), foodIds);
  await seedLoggerPlan(adminToken, rings, today, foodIds);

  // From before meal plans: still shown, read-only (C5).
  await call("POST", "/v1/me/food-entries", {
    token: loggerToken,
    body: {
      date: today,
      meal: "lunch",
      description: "Cơm gà ăn trước khi có plan",
      carbs: "60",
      protein: "30",
      fat: "10",
    },
  });
};

// The specs were written against SQLite and use `?` placeholders; PostgreSQL
// wants `$1`, `$2`. A statement that already has `$1` is left alone.
const toPgPlaceholders = (sql: string) => {
  let index = 0;

  return sql.includes("$1") ? sql : sql.replace(/\?/g, () => `$${++index}`);
};

// Reads the e2e PostgreSQL (the API's snake_case tables). Only the e2e
// database is ever opened (api-db.ts).
export const queryApiDb = async <T = Record<string, unknown>>(
  sql: string,
  args: (string | number)[] = [],
) =>
  withApiDb(
    async (client) =>
      (await client.query(toPgPlaceholders(sql), args)).rows as T[],
  );

// A write the API has no endpoint for: states that only older data had (a mark
// without frozen items, a target dated in the past). Same safety as above.
export const execApiDb = async (
  sql: string,
  args: (string | number)[] = [],
) => {
  await withApiDb(async (client) => {
    await client.query(toPgPlaceholders(sql), args);
  });
};

// The PT sets a trainee's manual target from today on.
export const setTargetViaApi = async (
  userId: number,
  target: { carbs: number; protein: number; fat: number },
) => {
  await call("PUT", `/v1/trainees/${userId}/nutrition-target`, {
    token: await loginAdmin(),
    body: {
      carbs: String(target.carbs),
      protein: String(target.protein),
      fat: String(target.fat),
      note: "",
    },
  });
};

// "Xóa" in the library, as the PT does it (DELETE /v1/foods/:id archives).
export const archiveFoodByName = async (name: string) => {
  const [food] = await queryApiDb<{ id: number }>(
    "SELECT id FROM foods WHERE name = ? AND archived_at IS NULL",
    [name],
  );

  await call("DELETE", `/v1/foods/${food.id}`, { token: await loginAdmin() });
};

export const getUserId = async (name: string) =>
  Number(
    (
      await queryApiDb<{ id: number }>("SELECT id FROM users WHERE name = $1", [
        name,
      ])
    )[0].id,
  );
