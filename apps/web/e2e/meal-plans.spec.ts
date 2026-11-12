import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { addDays } from "@pt/contracts";

import { TIME_ZONE } from "@/constants/time";
import {
  formatDayMonth,
  getTodayDate,
  getWeekdayShortLabel,
  getWeekStart,
} from "@/utils/week";

import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_DB_URL, E2E_PLANNER_NAME } from "./config";
import { getCopyDay, pickCopyDay } from "./copy-day";
import { E2E_FOODS } from "./seed";
import { shot } from "./shots";

// Meal plan builder (KAN-69), PT and trainee views. The specs share one
// seeded DB and run in order: the trainee asks for 4 meals first, then the PT
// builds Monday (the spec's worked example), copies it to Tuesday and applies
// it to next week. Target of E2E Planner: P 160 / C 235 / F 55 g.
// Next week, so every copy target is in the future (KAN-121 rejects past days).
const WEEK = getWeekStart(addDays(getTodayDate(TIME_ZONE), 7));
const MONDAY = WEEK;
const TUESDAY = addDays(WEEK, 1);
const WEDNESDAY = addDays(WEEK, 2);
const NEXT_MONDAY = addDays(WEEK, 7);
const NEXT_TUESDAY = addDays(WEEK, 8);
// Two weeks on: a copy there leaves the weeks the later specs count alone.
const FAR_MONDAY = addDays(WEEK, 14);
const NEXT_WEDNESDAY = addDays(WEEK, 9);

const getTodayMonth = (date: string) => date.slice(0, 7);

const query = async <T>(sql: string, args: (string | number)[] = []) => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    const result = await client.execute({ sql, args });

    return result.rows as unknown as T[];
  } finally {
    client.close();
  }
};

const getPlannerId = async () => {
  const [row] = await query<{ id: number }>(
    "SELECT id FROM users WHERE name = ?",
    [E2E_PLANNER_NAME],
  );

  return Number(row.id);
};

const getRiceGrams = async (date: string) => {
  const [row] = await query<{ grams: number }>(
    `SELECT i.grams FROM meal_plan_items i
     JOIN meal_plan_meals m ON m.id = i.meal_id
     JOIN meal_plan_days d ON d.id = m.day_id
     JOIN foods f ON f.id = i.food_id
     WHERE d.user_id = (SELECT id FROM users WHERE name = '${E2E_PLANNER_NAME}') AND d.date = ? AND f.name = ?`,
    [date, E2E_FOODS.RICE],
  );

  return Number(row.grams);
};

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

const openDay = async (page: Page, date: string) => {
  const id = await getPlannerId();

  await page.goto(
    `/admin/users/${id}/nutrition?week=${getWeekStart(date)}&day=${date}`,
  );
  await expect(
    page.getByRole("heading", { name: "Plan bữa ăn" }),
  ).toBeVisible();
};

const grams = (page: Page, food: string) =>
  page.getByLabel(`Gram ${food}`, { exact: true });

const addFood = async (
  page: Page,
  meal: string,
  search: string,
  food: string,
) => {
  await page.getByLabel(`Thêm món vào ${meal}`).fill(search);
  await page
    .getByRole("button", {
      name: new RegExp(`Thêm ${food.replace(/[()]/g, "\\$&")}$`),
    })
    .click();
  await expect(grams(page, food)).toBeVisible();
};

const dayTotals = (page: Page) =>
  page.getByRole("region", { name: "Tổng cả ngày" });

test("Q1: the trainee asks for 4 meals and a food note; both are kept", async ({
  page,
}) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_PLANNER_NAME);
  await expect(page).toHaveURL(/\/workouts/);
  await page.goto("/nutrition");

  const mealCount = page.getByLabel("Số bữa mong muốn");
  const note = page.getByLabel("Món thích hoặc không ăn được");

  // Nothing asked yet: the card starts open.
  await expect(
    page.getByRole("button", { name: "Yêu cầu bữa ăn" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(mealCount).toHaveValue("");
  await expect(note).toHaveValue("");

  await mealCount.selectOption("4");
  await note.fill("Không ăn hải sản");
  await page.getByRole("button", { name: "Lưu yêu cầu" }).click();
  await expect(page.getByText("Đã lưu yêu cầu của bạn")).toBeVisible();

  const [saved] = await query<{
    preferred_meal_count: number;
    food_note: string;
  }>("SELECT preferred_meal_count, food_note FROM users WHERE name = ?", [
    E2E_PLANNER_NAME,
  ]);

  expect(Number(saved.preferred_meal_count)).toBe(4);
  expect(saved.food_note).toBe("Không ăn hải sản");

  await page.reload();
  // A saved request starts collapsed; the header opens it again.
  const toggle = page.getByRole("button", { name: "Yêu cầu bữa ăn" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Số bữa mong muốn")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Số bữa mong muốn")).toHaveValue("4");
  await expect(page.getByLabel("Món thích hoặc không ăn được")).toHaveValue(
    "Không ăn hải sản",
  );

  // Clearing both is saved too.
  await page.getByLabel("Số bữa mong muốn").selectOption("");
  await page.getByLabel("Món thích hoặc không ăn được").fill("");
  await page.getByRole("button", { name: "Lưu yêu cầu" }).click();
  await expect(page.getByText("Đã lưu yêu cầu của bạn")).toBeVisible();
  await expect
    .poll(async () => {
      const [row] = await query<{ preferred_meal_count: number | null }>(
        "SELECT preferred_meal_count FROM users WHERE name = ?",
        [E2E_PLANNER_NAME],
      );

      return row.preferred_meal_count;
    })
    .toBeNull();

  // The DB row is written before the client finishes the action, and React
  // then resets the form to its saved values: reload so the next typing is
  // never wiped by that reset (and the old toast is gone).
  await page.reload();
  await expect(page.getByLabel("Số bữa mong muốn")).toHaveValue("");
  await expect(page.getByLabel("Món thích hoặc không ăn được")).toHaveValue("");

  // Back to 4 meals for the PT specs.
  await page.getByLabel("Số bữa mong muốn").selectOption("4");
  await page
    .getByLabel("Món thích hoặc không ăn được")
    .fill("Không ăn hải sản");
  await page.getByRole("button", { name: "Lưu yêu cầu" }).click();
  await expect
    .poll(async () => {
      const [row] = await query<{ preferred_meal_count: number | null }>(
        "SELECT preferred_meal_count FROM users WHERE name = ?",
        [E2E_PLANNER_NAME],
      );

      return Number(row.preferred_meal_count);
    })
    .toBe(4);

  // What the later specs rely on survives the form's own reset.
  await page.reload();
  await expect(page.getByLabel("Số bữa mong muốn")).toHaveValue("4");
  await expect(page.getByLabel("Món thích hoặc không ăn được")).toHaveValue(
    "Không ăn hải sản",
  );
});

test("S5: the PT builds Monday, auto solves the worked example and the day is on target", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openDay(page, MONDAY);

  // The trainee's request is visible; the new plan starts with 4 meals (Q2).
  await expect(page.getByText("Không ăn hải sản")).toBeVisible();
  await expect(page.getByText("Chưa có plan", { exact: true })).toBeVisible();
  await expect(page.getByText("Plan mới có 4 bữa")).toBeVisible();
  await page.getByRole("button", { name: "Tạo plan" }).click();
  await expect(page.getByLabel("Tên bữa 4")).toBeVisible();
  await expect(page.getByLabel("Tên bữa 1")).toHaveValue("Bữa sáng");
  await expect(page.getByLabel("Tên bữa 2")).toHaveValue("Bữa trưa");
  await expect(page.getByLabel("Tên bữa 3")).toHaveValue("Bữa tối");
  await expect(page.getByLabel("Tên bữa 4")).toHaveValue("Bữa phụ 1");
  // Same as the request: no hint.
  await expect(page.getByText("Học viên muốn 4 bữa")).toHaveCount(0);

  // Q2: with 3 meals the page says what the trainee wants; adding one hides it.
  await page.getByRole("button", { name: "Xóa Bữa phụ 1" }).click();
  await expect(page.getByLabel("Tên bữa 4")).toHaveCount(0);
  await expect(page.getByText("Học viên muốn 4 bữa")).toBeVisible();
  await page.getByRole("button", { name: "Thêm bữa" }).click();
  await expect(page.getByLabel("Tên bữa 4")).toHaveValue("Bữa phụ 1");
  await expect(page.getByText("Học viên muốn 4 bữa")).toHaveCount(0);

  // Q3: rename and reorder.
  await page.getByLabel("Tên bữa 1").fill("Trước tập");
  await page.getByLabel("Tên bữa 1").blur();
  await expect
    .poll(
      async () =>
        (
          await query<{ name: string }>(
            `SELECT m.name FROM meal_plan_meals m
             JOIN meal_plan_days d ON d.id = m.day_id
             WHERE d.user_id = (SELECT id FROM users WHERE name = '${E2E_PLANNER_NAME}') ORDER BY m.id LIMIT 1`,
          )
        )[0].name,
    )
    .toBe("Trước tập");
  await page.getByRole("button", { name: "Đưa Trước tập xuống dưới" }).click();
  await expect(page.getByLabel("Tên bữa 1")).toHaveValue("Bữa trưa");
  await expect(page.getByLabel("Tên bữa 2")).toHaveValue("Trước tập");
  await page.getByLabel("Tên bữa 2").fill("Bữa sáng");
  await page.getByLabel("Tên bữa 2").blur();
  await page.getByRole("button", { name: "Đưa Bữa sáng lên trên" }).click();
  await expect(page.getByLabel("Tên bữa 1")).toHaveValue("Bữa sáng");
  await expect(page.getByLabel("Tên bữa 2")).toHaveValue("Bữa trưa");

  // Keep one meal: its target is the whole day, P 160 / C 235 / F 55.
  for (const name of ["Bữa phụ 1", "Bữa tối", "Bữa trưa"]) {
    await page.getByRole("button", { name: `Xóa ${name}` }).click();
    await expect(page.getByRole("button", { name: `Xóa ${name}` })).toHaveCount(
      0,
    );
  }
  await expect(page.getByLabel("Tên bữa 2")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Xóa Bữa sáng" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Mục tiêu bữa: 2075 kcal · P 160 · C 235 · F 55"),
  ).toBeVisible();

  // Foods from the library, found without accents.
  await addFood(page, "Bữa sáng", "uc ga chin", E2E_FOODS.CHICKEN);
  await addFood(page, "Bữa sáng", "com trang", E2E_FOODS.RICE);
  await addFood(page, "Bữa sáng", "bong cai", E2E_FOODS.BROCCOLI);
  await expect(grams(page, E2E_FOODS.CHICKEN)).toHaveValue("100");

  // The broccoli is fixed at 300 g and kept out of the calculation.
  await grams(page, E2E_FOODS.BROCCOLI).fill("300");
  await grams(page, E2E_FOODS.BROCCOLI).blur();
  await page
    .getByRole("button", {
      name: `Giữ nguyên gram ${E2E_FOODS.BROCCOLI} khi tính tự động`,
    })
    .click();
  await page.getByRole("button", { name: "Tính tự động", exact: true }).click();

  // 427 g chicken / 757 g rice before rounding; 425 / 755 at the 5 g step.
  await expect(grams(page, E2E_FOODS.CHICKEN)).toHaveValue("425");
  await expect(grams(page, E2E_FOODS.RICE)).toHaveValue("755");
  await expect(grams(page, E2E_FOODS.BROCCOLI)).toHaveValue("300");
  // Fat is the gap: 55 - 18.765 = 36.2 g.
  await expect(page.getByText("Thiếu 36 g fat")).toBeVisible();
  await expect(page.getByText("Chưa đạt mục tiêu")).toBeVisible();
  await expect(dayTotals(page)).toContainText("Fat thiếu 36 g");

  // Q6: suggestions come from the fat groups.
  await expect(
    page.getByRole("button", { name: "Thêm 35 g Dầu ô liu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Thêm 70 g Hạnh nhân" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Thêm \d+ g Ức gà/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Thêm 35 g Dầu ô liu" }).click();
  await expect(grams(page, E2E_FOODS.OLIVE_OIL)).toHaveValue("35");
  // 53.765 g of 55 is within 10 g: the fat notice is gone.
  await expect(page.getByText(/Thiếu \d+ g fat/)).toHaveCount(0);

  // With the oil unlocked too, the calculation settles on 425 / 755 / 35.
  await page.getByRole("button", { name: "Tính tự động", exact: true }).click();
  await expect(grams(page, E2E_FOODS.OLIVE_OIL)).toHaveValue("35");
  await expect(grams(page, E2E_FOODS.CHICKEN)).toHaveValue("425");
  await expect(grams(page, E2E_FOODS.RICE)).toHaveValue("755");

  // Day total: P 159.335 / C 234.51 / F 53.765 = 2,059 kcal against 2,075.
  // Protein is 0.7 g under, kcal 16 under, carbs 0.5 g and fat 1.2 g under:
  // all inside the on-target rule.
  await expect(dayTotals(page)).toContainText("Đạt mục tiêu");
  await expect(dayTotals(page)).toContainText("2059 kcal");
  await expect(dayTotals(page)).toContainText("159,3 / 160");
  await expect(dayTotals(page)).toContainText("234,5 / 235");
  await expect(dayTotals(page)).toContainText("53,8 / 55");

  // Editing grams by hand: 300 g chicken is far under on protein.
  await grams(page, E2E_FOODS.CHICKEN).fill("300");
  await grams(page, E2E_FOODS.CHICKEN).blur();
  await expect(dayTotals(page)).toContainText("Chưa đạt mục tiêu");
  await expect(dayTotals(page)).toContainText("Protein thiếu 39 g");
  await grams(page, E2E_FOODS.CHICKEN).fill("425");
  await grams(page, E2E_FOODS.CHICKEN).blur();
  await expect(dayTotals(page)).toContainText("Đạt mục tiêu");

  // Saved in the database, one row per food.
  const rows = await query<{ name: string; grams: number }>(
    `SELECT foods.name AS name, meal_plan_items.grams AS grams
     FROM meal_plan_items JOIN foods ON foods.id = meal_plan_items.food_id
     JOIN meal_plan_meals m ON m.id = meal_plan_items.meal_id
     JOIN meal_plan_days d ON d.id = m.day_id
     WHERE d.user_id = (SELECT id FROM users WHERE name = '${E2E_PLANNER_NAME}')
     ORDER BY meal_plan_items.id`,
  );

  expect(rows.map((row) => [row.name, Number(row.grams)])).toEqual([
    [E2E_FOODS.CHICKEN, 425],
    [E2E_FOODS.RICE, 755],
    [E2E_FOODS.BROCCOLI, 300],
    [E2E_FOODS.OLIVE_OIL, 35],
  ]);
});

test("Copy: Monday is copied to Tuesday and the copy is independent", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openDay(page, MONDAY);
  await page.getByRole("button", { name: "Sao chép sang ngày khác" }).click();
  await expect(
    page.getByRole("heading", { name: "Sao chép sang ngày khác" }),
  ).toBeVisible();
  // Monday itself is not selectable; Tuesday has no plan yet.
  const monday = await getCopyDay(page, MONDAY);

  await expect(monday).toHaveAttribute("aria-disabled", "true");
  await expect(monday).toHaveAccessibleName(/ngày nguồn/);
  await monday.dispatchEvent("click");
  await expect(
    page.getByRole("button", { name: "Sao chép", exact: true }),
  ).toBeDisabled();
  await expect(await getCopyDay(page, TUESDAY)).not.toHaveAccessibleName(
    /đã có plan/,
  );
  await pickCopyDay(page, TUESDAY);
  await page.getByRole("button", { name: "Sao chép (1 ngày)" }).click();
  await expect(page.getByText("Đã sao chép sang 1 ngày")).toBeVisible();

  await openDay(page, TUESDAY);
  await expect(page.getByLabel("Tên bữa 1")).toHaveValue("Bữa sáng");
  await expect(grams(page, E2E_FOODS.CHICKEN)).toHaveValue("425");
  await expect(grams(page, E2E_FOODS.RICE)).toHaveValue("755");
  await expect(grams(page, E2E_FOODS.BROCCOLI)).toHaveValue("300");
  await expect(grams(page, E2E_FOODS.OLIVE_OIL)).toHaveValue("35");
  await expect(dayTotals(page)).toContainText("Đạt mục tiêu");

  // Change Tuesday's rice: Monday keeps 755 g.
  await grams(page, E2E_FOODS.RICE).fill("600");
  await grams(page, E2E_FOODS.RICE).blur();
  await expect(dayTotals(page)).toContainText("Carb thiếu");
  await openDay(page, MONDAY);
  await expect(grams(page, E2E_FOODS.RICE)).toHaveValue("755");

  // Copying again to Tuesday warns that it replaces (KAN-78).
  await page.getByRole("button", { name: "Sao chép sang ngày khác" }).click();
  await expect(await getCopyDay(page, TUESDAY)).toHaveAccessibleName(
    /đã có plan/,
  );
  await pickCopyDay(page, TUESDAY);
  await page.getByRole("button", { name: "Sao chép (1 ngày)" }).click();

  const confirm = page.getByRole("alertdialog", { name: "Xác nhận ghi đè" });

  await expect(confirm).toContainText(
    `Ghi đè plan của ${getWeekdayShortLabel(TUESDAY)} ${formatDayMonth(TUESDAY)}?`,
  );
  await shot(page, "kan-78-overwrite-confirm");

  // "Hủy" leaves Tuesday as it was: rice still 600 g, no copy happened.
  await confirm.getByRole("button", { name: "Hủy" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("Đã sao chép sang 1 ngày")).toHaveCount(0);
  expect(await getRiceGrams(TUESDAY)).toBe(600);

  // "Ghi đè" replaces it and restores 755 g.
  await page.getByRole("button", { name: "Sao chép (1 ngày)" }).click();
  await confirm.getByRole("button", { name: "Ghi đè" }).click();
  await expect(page.getByText("Đã sao chép sang 1 ngày")).toBeVisible();
  expect(await getRiceGrams(TUESDAY)).toBe(755);
  await openDay(page, TUESDAY);
  await expect(grams(page, E2E_FOODS.RICE)).toHaveValue("755");
});

test("R2: next week starts empty and 'Áp dụng tuần trước' copies the planned weekdays only", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openDay(page, NEXT_MONDAY);

  // Nothing is applied by itself.
  await expect(page.getByText("Chưa có plan", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Sao chép 2 ngày có plan của tuần trước"),
  ).toBeVisible();
  expect(
    await query(
      `SELECT id FROM meal_plan_days WHERE date >= ? AND user_id = (SELECT id FROM users WHERE name = '${E2E_PLANNER_NAME}')`,
      [NEXT_MONDAY],
    ),
  ).toHaveLength(0);

  await page.getByRole("button", { name: "Áp dụng tuần trước" }).click();
  await expect(
    page.getByText("Đã áp dụng 2 ngày của tuần trước"),
  ).toBeVisible();
  await expect(grams(page, E2E_FOODS.CHICKEN)).toHaveValue("425");
  await expect(grams(page, E2E_FOODS.OLIVE_OIL)).toHaveValue("35");

  const dates = await query<{ date: string }>(
    `SELECT date FROM meal_plan_days WHERE date >= ? AND user_id = (SELECT id FROM users WHERE name = '${E2E_PLANNER_NAME}') ORDER BY date`,
    [NEXT_MONDAY],
  );

  expect(dates.map((row) => row.date)).toEqual([NEXT_MONDAY, NEXT_TUESDAY]);

  // Wednesday had no plan last week: it stays empty.
  await openDay(page, NEXT_WEDNESDAY);
  await expect(page.getByText("Chưa có plan", { exact: true })).toBeVisible();
  // Last week's Wednesday has none either, so "Áp dụng tuần trước" still
  // offers the 2 planned days of last week, but never overwrites.
  await page.getByRole("button", { name: "Áp dụng tuần trước" }).click();
  await expect(
    page.getByText("Đã áp dụng 0 ngày, giữ 2 ngày đã có plan"),
  ).toBeVisible();
  await expect(page.getByText("Chưa có plan", { exact: true })).toBeVisible();
});

test("Copy grid: Monday-first month, past days locked, today and tomorrow labelled", async ({
  page,
}) => {
  const today = getTodayDate(TIME_ZONE);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  await logInAsAdmin(page);
  // The source is next week's Monday, so every other cell is a copy target.
  await openDay(page, MONDAY);
  await page.getByRole("button", { name: "Sao chép sang ngày khác" }).click();

  const dialog = page.getByRole("dialog");
  const [year, month] = today.split("-").map(Number);

  // Opens on today's month; the previous-month button is locked there.
  await expect(dialog.getByText(`Tháng ${month}, ${year}`)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Tháng trước" }),
  ).toBeDisabled();

  // Header row starts on Monday.
  await expect(dialog.getByText("T2", { exact: true })).toBeVisible();
  await expect(dialog.getByText("CN", { exact: true })).toBeVisible();

  // Today and tomorrow carry their labels and can be picked.
  const todayCell = await getCopyDay(page, today);

  await expect(todayCell).toHaveText(/Hôm nay/);
  await expect(todayCell).not.toHaveAttribute("aria-disabled", "true");
  if (getTodayMonth(tomorrow) === getTodayMonth(today)) {
    const tomorrowCell = await getCopyDay(page, tomorrow);

    await expect(tomorrowCell).toHaveText(/Ngày mai/);
    await expect(tomorrowCell).not.toHaveAttribute("aria-disabled", "true");
  }

  // A past day is disabled and cannot be selected (unless today is the 1st).
  if (getTodayMonth(yesterday) === getTodayMonth(today)) {
    const past = await getCopyDay(page, yesterday);

    await expect(past).toHaveAttribute("aria-disabled", "true");
    await past.dispatchEvent("click");
    await expect(past).not.toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Sao chép", exact: true }),
    ).toBeDisabled();
  }

  // The next month opens and the previous-month button works again.
  await dialog.getByRole("button", { name: "Tháng sau" }).click();
  await expect(
    dialog.getByRole("button", { name: "Tháng trước" }),
  ).toBeEnabled();
  await shot(page, "kan-122-copy-month-grid");

  // 320 px: the grid and the sticky button fit without sideways scroll.
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    await dialog.evaluate((node) => ({
      sheet: node.scrollWidth - node.clientWidth,
      page:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    })),
  ).toEqual({ sheet: 0, page: 0 });
  await expect(
    dialog.getByRole("button", { name: "Sao chép", exact: true }),
  ).toBeInViewport();
});

test("Copy grid: a future day is picked by keyboard, counted and copied", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openDay(page, TUESDAY);
  await page.getByRole("button", { name: "Sao chép sang ngày khác" }).click();

  const dialog = page.getByRole("dialog");
  const target = await getCopyDay(page, FAR_MONDAY);

  await expect(target).toHaveAttribute("aria-pressed", "false");
  await target.focus();
  await page.keyboard.press("Space");
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "Sao chép (1 ngày)" }),
  ).toBeVisible();

  // The same key unpicks it; the button goes back to disabled.
  await page.keyboard.press("Enter");
  await expect(target).toHaveAttribute("aria-pressed", "false");
  await expect(
    dialog.getByRole("button", { name: "Sao chép", exact: true }),
  ).toBeDisabled();

  await page.keyboard.press("Space");
  await dialog.getByRole("button", { name: "Sao chép (1 ngày)" }).click();
  await expect(page.getByText("Đã sao chép sang 1 ngày")).toBeVisible();
  expect(await getRiceGrams(FAR_MONDAY)).toBe(await getRiceGrams(TUESDAY));
});

test("Q4: the PT splits a day by percent and the total must be 100", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openDay(page, WEDNESDAY);
  await page.getByRole("button", { name: "Tạo plan" }).click();
  await expect(page.getByLabel("Tên bữa 4")).toBeVisible();
  // Equal split of P 160 / C 235 / F 55 over 4 meals: 40 / 59 / 14 g first.
  await expect(
    page.getByText("Mục tiêu bữa: 522 kcal · P 40 · C 59 · F 14").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Chia theo %" }).click();

  const fields = page.getByRole("dialog").getByRole("textbox");

  await expect(fields).toHaveCount(4);
  await fields.nth(0).fill("30");
  await fields.nth(1).fill("30");
  await fields.nth(2).fill("20");
  await fields.nth(3).fill("21");
  await expect(page.getByText("Tổng: 101% (cần 100%)")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lưu phần trăm" }),
  ).toBeDisabled();
  await fields.nth(3).fill("20");
  await expect(page.getByText("Tổng: 100% (cần 100%)")).toBeVisible();
  await page.getByRole("button", { name: "Lưu phần trăm" }).click();
  await expect(page.getByText("Đã lưu phần trăm các bữa")).toBeVisible();

  // 30 %: P 48, C 70.5 -> 71, F 16.5 -> 17 (earlier meal wins the tie).
  await expect(
    page.getByText("Mục tiêu bữa (30%): 629 kcal · P 48 · C 71 · F 17"),
  ).toBeVisible();
  await expect(
    page.getByText("Mục tiêu bữa (20%): 415 kcal · P 32 · C 47 · F 11"),
  ).toHaveCount(2);
  const stored = await query<{ share_percent: number }>(
    `SELECT share_percent FROM meal_plan_meals
     WHERE day_id = (SELECT id FROM meal_plan_days WHERE date = ? AND user_id = (SELECT id FROM users WHERE name = '${E2E_PLANNER_NAME}')) ORDER BY position`,
    [WEDNESDAY],
  );

  expect(stored.map((row) => Number(row.share_percent))).toEqual([
    30, 30, 20, 20,
  ]);
});

test("Archived food: a plan keeps showing a food the PT deleted from the library", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await query("UPDATE foods SET archived_at = unixepoch() WHERE name = ?", [
    E2E_FOODS.OLIVE_OIL,
  ]);
  await openDay(page, MONDAY);
  await expect(grams(page, E2E_FOODS.OLIVE_OIL)).toHaveValue("35");
  await expect(
    page.getByText("Món đã xóa khỏi thư viện, số liệu giữ nguyên"),
  ).toBeVisible();
  // Its numbers still count: 35 g of fat in the day.
  await expect(dayTotals(page)).toContainText("53,8 / 55");

  // But it can't be added anew.
  await page.getByLabel("Thêm món vào Bữa sáng").fill("dau o liu");
  await expect(page.getByText("Không tìm thấy món nào")).toBeVisible();
});

test("Layout: the plan fits a 390 px screen without sideways scroll", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openDay(page, MONDAY);
  await expect(grams(page, E2E_FOODS.CHICKEN)).toBeVisible();
  expect(page.viewportSize()?.width).toBe(390);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
