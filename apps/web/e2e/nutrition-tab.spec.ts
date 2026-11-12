import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { addDays } from "@pt/contracts";

import { TIME_ZONE } from "@/constants/time";
import { formatFullDay, getTodayDate, getWeekStart } from "@/utils/week";

import { fillTraineeLogin } from "./auth";
import {
  E2E_ADMIN,
  E2E_DB_URL,
  E2E_RINGS_EXTRA_FOOD,
  E2E_RINGS_NAME,
} from "./config";
import { E2E_FOODS } from "./seed";
import { shot } from "./shots";

// The trainee nutrition tab and the admin week tabs (KAN-120, KAN-125,
// docs/specs/mobile-ui-polish.md decisions 3, 4 and 6). E2E Rings is seeded
// (seedRings in seed.ts) with a plan yesterday and today. beforeAll marks every
// meal of yesterday, marks only Bữa sáng today and adds one extra food to it;
// tomorrow has no plan. Eaten today is P 70 / C 110 / F 72 g against P 160 /
// C 235 / F 55 g. afterAll removes the rows again (meal-log.spec.ts counts all
// marks and logs), so the specs themselves only read.
const TODAY = getTodayDate(TIME_ZONE);
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);

const withDb = async (
  statements: { sql: string; args?: (string | number)[] }[],
) => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    for (const statement of statements) {
      await client.execute({ sql: statement.sql, args: statement.args ?? [] });
    }
  } finally {
    client.close();
  }
};

const RINGS_USER = "(SELECT id FROM users WHERE name = ?)";
const MEALS_OF = (name: string) => `SELECT m.id FROM meal_plan_meals m
  JOIN meal_plan_days d ON d.id = m.day_id
  WHERE d.user_id = ${RINGS_USER} AND d.date = ?${name}`;

const cleanUp = () =>
  withDb([
    {
      sql: `DELETE FROM meal_mark_items WHERE mark_id IN (SELECT id FROM meal_marks WHERE user_id = ${RINGS_USER})`,
      args: [E2E_RINGS_NAME],
    },
    {
      sql: `DELETE FROM meal_marks WHERE user_id = ${RINGS_USER}`,
      args: [E2E_RINGS_NAME],
    },
    {
      sql: `DELETE FROM meal_logs WHERE user_id = ${RINGS_USER}`,
      args: [E2E_RINGS_NAME],
    },
  ]);

test.beforeAll(async () => {
  await cleanUp();
  await withDb([
    {
      sql: `INSERT INTO meal_marks (meal_id, user_id, achieved)
            SELECT id, ${RINGS_USER}, 1 FROM (${MEALS_OF("")})`,
      args: [E2E_RINGS_NAME, E2E_RINGS_NAME, YESTERDAY],
    },
    {
      sql: `INSERT INTO meal_marks (meal_id, user_id, achieved)
            SELECT id, ${RINGS_USER}, 1 FROM (${MEALS_OF(" AND m.position = 0")})`,
      args: [E2E_RINGS_NAME, E2E_RINGS_NAME, TODAY],
    },
    // Snapshot of Bữa sáng when it was marked: P 60 / C 90 / F 12 g.
    {
      sql: `INSERT INTO meal_mark_items (mark_id, meal_id, food_id, grams, protein, carbs, fat, kcal)
            SELECT k.id, k.meal_id, (SELECT id FROM foods WHERE name = ?), 500, 60, 90, 12, 708 FROM meal_marks k
            WHERE k.meal_id IN (${MEALS_OF(" AND m.position = 0")})`,
      args: [E2E_FOODS.CHICKEN, E2E_RINGS_NAME, TODAY],
    },
    // The extra food: P 10 / C 20 / F 60 g.
    {
      sql: `INSERT INTO meal_logs (user_id, meal_id, custom_name, grams, kcal, protein, carbs, fat)
            SELECT ${RINGS_USER}, id, ?, 0, 660, 10, 20, 60 FROM (${MEALS_OF(" AND m.position = 0")})`,
      args: [E2E_RINGS_NAME, E2E_RINGS_EXTRA_FOOD, E2E_RINGS_NAME, TODAY],
    },
  ]);
});

test.afterAll(cleanUp);

const openDay = async (page: Page, date: string, path = "/nutrition") => {
  await page.goto(`${path}?week=${getWeekStart(date)}&day=${date}`);
  await expect(
    page.getByRole("list", { name: "Chú thích màu ngày" }),
  ).toBeVisible();
};

const dayMarker = (page: Page, date: string) =>
  page
    .getByRole("link", { name: new RegExp(`^${formatFullDay(date)}`) })
    .getByTestId("day-status");

const ring = (page: Page, name: string) =>
  page.getByRole("progressbar", { name: new RegExp(`^${name}:`) });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_RINGS_NAME);
  await expect(page).toHaveURL(/\/workouts/);
});

test("calendar colours follow the marked meals: green, yellow, grey", async ({
  page,
}) => {
  await openDay(page, YESTERDAY);
  await expect(dayMarker(page, YESTERDAY)).toHaveAttribute(
    "data-status",
    "complete",
  );
  await openDay(page, TODAY);
  await expect(dayMarker(page, TODAY)).toHaveAttribute(
    "data-status",
    "partial",
  );
  await openDay(page, TOMORROW);
  await expect(dayMarker(page, TOMORROW)).toHaveAttribute(
    "data-status",
    "none",
  );
  // Only days after today are flagged as future cells.
  const dayCell = (date: string) =>
    page.getByRole("link", { name: new RegExp(`^${formatFullDay(date)}`) });

  await expect(dayCell(TOMORROW)).toHaveAttribute("data-future", "true");
  await expect(dayCell(TODAY)).not.toHaveAttribute("data-future", "true");
  await expect(dayCell(YESTERDAY)).not.toHaveAttribute("data-future", "true");

  // The legend names the two dot colours; "none" shows no dot.
  const legend = page.getByRole("list", { name: "Chú thích màu ngày" });

  await expect(legend.getByRole("listitem")).toHaveText([
    "Đã hoàn thành",
    "Đang thực hiện",
  ]);
});

test("the tab order is calendar, daily goals, meal plan", async ({ page }) => {
  await openDay(page, TODAY);

  const boxY = async (locator: ReturnType<Page["getByRole"]>) =>
    (await locator.boundingBox())!.y;
  const calendar = await boxY(
    page.getByRole("list", { name: "Chú thích màu ngày" }),
  );
  const goals = await boxY(
    page.getByRole("heading", { name: "Mục tiêu trong ngày" }),
  );
  const plan = await boxY(page.getByRole("heading", { name: "Plan bữa ăn" }));

  expect(calendar).toBeLessThan(goals);
  expect(goals).toBeLessThan(plan);
});

test("daily goals rings show percent, eaten / target g and còn or vượt", async ({
  page,
}) => {
  await openDay(page, TODAY);

  await expect(page.getByRole("progressbar")).toHaveCount(3);

  const cases = [
    {
      name: "Protein",
      percent: "44",
      eaten: "70",
      target: "160",
      text: "còn 90 g",
    },
    {
      name: "Carb",
      percent: "47",
      eaten: "110",
      target: "235",
      text: "còn 125 g",
    },
    // Over the target: the ring caps at 100 %, the text says by how much.
    {
      name: "Fat",
      percent: "100",
      eaten: "72",
      target: "55",
      text: "vượt 17 g",
    },
  ];

  for (const { name, percent, eaten, target, text } of cases) {
    const bar = ring(page, name);
    const item = page.getByRole("listitem").filter({ has: bar });

    await expect(bar).toHaveAttribute(
      "aria-label",
      `${name}: ${eaten}/${target} g`,
    );
    await expect(bar).toHaveAttribute("aria-valuenow", percent);
    await expect(bar).toHaveText(`${percent}%`);
    await expect(item).toContainText(`${eaten} / ${target} g`);
    await expect(item).toContainText(text);
  }
  await shot(page, "nutrition-tab-rings");
});

test("a marked meal is green; the extra-food block only shows where food was added", async ({
  page,
}) => {
  await openDay(page, TODAY);

  const breakfast = page.getByRole("region", { name: /^Bữa \d: Bữa sáng$/ });
  const lunch = page.getByRole("region", { name: /^Bữa \d: Bữa trưa$/ });

  await expect(breakfast).toHaveAttribute("data-achieved", "true");
  await expect(breakfast).toHaveClass(/bg-success\/10/);
  await expect(breakfast.getByText("Đã ăn thêm ngoài plan")).toBeVisible();
  await expect(breakfast).toContainText(E2E_RINGS_EXTRA_FOOD);

  await expect(lunch).toHaveAttribute("data-achieved", "false");
  await expect(lunch).not.toHaveClass(/bg-success\/10/);
  await expect(lunch.getByText("Đã ăn thêm ngoài plan")).toHaveCount(0);
  await expect(lunch).not.toContainText("Chưa ghi món nào.");

  // The old all-day card is gone.
  await expect(page.getByText("Đã ăn cả ngày")).toHaveCount(0);
});

test("the nutrition tab fits 320 px without sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openDay(page, TODAY);
  await expect(page.getByRole("progressbar")).toHaveCount(3);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(0);
});

test("the admin week tabs use the same colours for the trainee", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
  await page
    .getByRole("link", { name: new RegExp(E2E_RINGS_NAME) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/users\/(\d+)/);

  const id = page.url().match(/\/admin\/users\/(\d+)/)![1];
  const path = `/admin/users/${id}/nutrition`;

  await openDay(page, YESTERDAY, path);
  await expect(dayMarker(page, YESTERDAY)).toHaveAttribute(
    "data-status",
    "complete",
  );
  await openDay(page, TODAY, path);
  await expect(dayMarker(page, TODAY)).toHaveAttribute(
    "data-status",
    "partial",
  );
  await openDay(page, TOMORROW, path);
  await expect(dayMarker(page, TOMORROW)).toHaveAttribute(
    "data-status",
    "none",
  );
});
