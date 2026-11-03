import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";

import { TIME_ZONE } from "@/constants/time";
import {
  addDays,
  formatDayMonth,
  formatFullDay,
  getTodayDate,
  getWeekdayShortLabel,
  getWeekStart,
} from "@/utils/week";

import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_DB_URL, E2E_LOGGER_NAME } from "./config";
import { E2E_FOODS } from "./seed";
import { shot } from "./shots";

// Trainee meal log (KAN-71). The specs share one seeded DB and run in order:
// the trainee logs foods and marks a meal, the PT sees them, then the target
// changes and the PT is told the plan is off. E2E Logger: target P 160 /
// C 235 / F 55 g (2,075 kcal); today's plan is 2,084.1 kcal (see seed.ts).
const TODAY = getTodayDate(TIME_ZONE);

const query = async <T>(sql: string, args: (string | number)[] = []) => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    const result = await client.execute({ sql, args });

    return result.rows as unknown as T[];
  } finally {
    client.close();
  }
};

const run = async (sql: string, args: (string | number)[] = []) => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    await client.execute({ sql, args });
  } finally {
    client.close();
  }
};

const getLoggerId = async () => {
  const [row] = await query<{ id: number }>(
    "SELECT id FROM users WHERE name = ?",
    [E2E_LOGGER_NAME],
  );

  return Number(row.id);
};

const getLogs = () =>
  query<{
    name: string | null;
    custom_name: string | null;
    food_id: number | null;
    grams: number;
    kcal: number | null;
    protein: number | null;
  }>(
    `SELECT f.name, l.custom_name, l.food_id, l.grams, l.kcal, l.protein
     FROM meal_logs l LEFT JOIN foods f ON f.id = l.food_id ORDER BY l.id`,
  );

const logInAsTrainee = async (page: Page) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_LOGGER_NAME);
  await expect(page).toHaveURL(/\/workouts/);
  await page.goto("/nutrition");
  await expect(page.getByRole("heading", { name: "Bữa sáng" })).toBeVisible();
};

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

const openAdminDay = async (page: Page) => {
  const id = await getLoggerId();

  await page.goto(
    `/admin/users/${id}/nutrition?week=${getWeekStart(TODAY)}&day=${TODAY}`,
  );
  await expect(
    page.getByRole("heading", { name: "Plan bữa ăn" }),
  ).toBeVisible();
};

// The result button's name ends with the food's name (sr-only "Chọn ...").
const chooseChicken = (page: Page) =>
  page.getByRole("button", { name: /Chọn Ức gà \(chín\)$/ });

const meal = (page: Page, name: string) =>
  page.getByRole("region", { name: new RegExp(`^Bữa \\d: ${name}$`) });

test("R6: the trainee sees today's plan read-only and the old log as history", async ({
  page,
}) => {
  await logInAsTrainee(page);

  const breakfast = meal(page, "Bữa sáng");

  await expect(breakfast).toContainText(E2E_FOODS.CHICKEN);
  await expect(breakfast).toContainText("200 g");
  await expect(breakfast).toContainText(
    "Mục tiêu bữa: 703 kcal · P 54 · C 79 · F 19",
  );
  await expect(breakfast).toContainText("Chưa ghi món nào.");
  // The plan has no edit controls; only the log can change.
  await expect(breakfast.getByLabel(/^Gram /)).toHaveCount(0);

  // C5: the old free-text form is hidden, old entries stay as history.
  await expect(page.getByRole("button", { name: "Ghi bữa ăn" })).toHaveCount(0);
  await expect(page.getByText("Nhật ký cũ")).toBeVisible();
  await expect(page.getByText("Cơm gà ăn trước khi có plan")).toBeVisible();
  await expect(page.getByLabel("Sửa bữa ăn")).toHaveCount(0);
  // C4: no more "≈ 10 lạng cơm chín" lines.
  await expect(page.getByText("≈")).toHaveCount(0);

  await shot(page, "01-trainee-plan-day", { fullPage: true });
});

test("KAN-89: the trainee folds one meal, then folds and opens every meal", async ({
  page,
}) => {
  await logInAsTrainee(page);

  const breakfast = meal(page, "Bữa sáng");
  const logButton = breakfast.getByRole("button", {
    name: "Ghi món đã ăn vào Bữa sáng",
  });
  const toggle = breakfast.getByRole("button", { name: "Thu gọn Bữa sáng" });

  // Default: every card is open.
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(logButton).toBeVisible();

  await toggle.click();
  const opener = breakfast.getByRole("button", { name: "Mở Bữa sáng" });

  await expect(opener).toHaveAttribute("aria-expanded", "false");
  await expect(logButton).toBeHidden();
  await expect(breakfast).toContainText(/Đã ăn \d+ \/ \d+ kcal/);
  // The other meals stay open.
  await expect(
    meal(page, "Bữa trưa").getByRole("button", {
      name: "Ghi món đã ăn vào Bữa trưa",
    }),
  ).toBeVisible();

  await opener.click();
  await expect(
    breakfast.getByRole("button", { name: "Thu gọn Bữa sáng" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(logButton).toBeVisible();

  // Fold all, then open all.
  const logButtons = page.getByRole("button", { name: /^Ghi món đã ăn vào / });
  const count = await logButtons.count();

  expect(count).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Thu gọn tất cả" }).click();
  await expect(page.getByRole("button", { name: "Mở tất cả" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Mở Bữa / })).toHaveCount(
    count,
  );
  for (let index = 0; index < count; index += 1) {
    await expect(logButtons.nth(index)).toBeHidden();
  }

  await page.getByRole("button", { name: "Mở tất cả" }).click();
  await expect(
    page.getByRole("button", { name: "Thu gọn tất cả" }),
  ).toBeVisible();
  for (let index = 0; index < count; index += 1) {
    await expect(logButtons.nth(index)).toBeVisible();
  }
});

test("C5: the trainee logs a library food and a free food, edits and removes one", async ({
  page,
}) => {
  await logInAsTrainee(page);

  const breakfast = meal(page, "Bữa sáng");

  // Library food: accent-free search, then grams.
  await page
    .getByRole("button", { name: "Ghi món đã ăn vào Bữa sáng" })
    .click();
  await page.getByLabel("Tìm món trong thư viện").fill("uc ga");
  await expect(chooseChicken(page)).toBeVisible();
  await shot(page, "02-log-sheet-search");
  await chooseChicken(page).click();
  await page.getByLabel("Số gram").fill("180");
  await page.getByRole("button", { name: "Thêm món" }).click();
  await expect(page.getByText("Đã ghi món ăn")).toBeVisible();
  // 180 g chicken: P 55.8, F 6.48 -> 4/4/9 = 223.2 + 58.32 = 281.5 -> 282 kcal.
  await expect(breakfast).toContainText(
    `${E2E_FOODS.CHICKEN} · 180 g282 kcal · P 55,8 · C 0 · F 6,5`,
  );

  // Free food with some macros.
  await page
    .getByRole("button", { name: "Ghi món đã ăn vào Bữa sáng" })
    .click();
  await page
    .getByRole("button", { name: "Món không có trong thư viện" })
    .click();
  await page.getByLabel("Tên món").fill("Phở bò");
  await page.getByLabel("Calo (kcal)").fill("450");
  await page.getByLabel("Protein (g)").fill("25");
  await shot(page, "03-log-sheet-free-food");
  await page.getByRole("button", { name: "Thêm món" }).click();
  await expect(breakfast).toContainText("Phở bò450 kcal · P 25 · C 0 · F 0");

  // Eaten 282 + 450 = 732 kcal against the day's plan of 2,084 kcal.
  await expect(
    page.getByRole("region", { name: "Đã ăn cả ngày" }),
  ).toContainText("732 kcal / 2084 kcal (plan)");

  // The day's progress card counts the old entry and the meal logs:
  // P 30 + 55.8 + 25 = 110.8 -> 111; C 60; F 10 + 6.48 -> 16.
  await expect(
    page.getByRole("progressbar", { name: "Protein: 111/160 g" }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Carb: 60/235 g" }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Fat: 16/55 g" }),
  ).toBeVisible();

  expect(await getLogs()).toEqual([
    {
      name: E2E_FOODS.CHICKEN,
      custom_name: null,
      food_id: expect.any(Number),
      grams: 180,
      kcal: null,
      protein: null,
    },
    {
      name: null,
      custom_name: "Phở bò",
      food_id: null,
      grams: 0,
      kcal: 450,
      protein: 25,
    },
  ]);

  // Edit the chicken to 200 g: P 62, F 7.2 -> 248 + 64.8 = 312.8 -> 313 kcal.
  await page.getByRole("button", { name: `Sửa ${E2E_FOODS.CHICKEN}` }).click();
  await expect(page.getByLabel("Số gram")).toHaveValue("180");
  await page.getByLabel("Số gram").fill("200");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã sửa món ăn")).toBeVisible();
  await expect(breakfast).toContainText(
    `${E2E_FOODS.CHICKEN} · 200 g313 kcal · P 62 · C 0 · F 7,2`,
  );
  // The plan side of the chips is rounded like the rest: C 84,6 / P 70,1.
  await expect(breakfast).toContainText("/ 84,6");
  await expect(breakfast).not.toContainText("99999");
  expect((await getLogs())[0].grams).toBe(200);

  // Remove the free food.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Xóa Phở bò" }).click();
  await expect(page.getByText("Đã xóa món ăn")).toBeVisible();
  await expect(breakfast).not.toContainText("Phở bò");

  const logs = await getLogs();

  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ name: E2E_FOODS.CHICKEN, grams: 200 });
  // Without Phở: P 30 + 62 = 92.
  await expect(
    page.getByRole("progressbar", { name: "Protein: 92/160 g" }),
  ).toBeVisible();
});

test("S4: the trainee marks a meal Đạt with a note about what was over", async ({
  page,
}) => {
  await logInAsTrainee(page);

  const breakfast = meal(page, "Bữa sáng");
  const done = breakfast.getByRole("button", { name: "Đạt Bữa sáng" });

  await expect(done).toHaveAttribute("aria-pressed", "false");
  await done.click();
  await expect(done).toHaveAttribute("aria-pressed", "true");
  await expect(done).toHaveText("Đã đạt");

  await breakfast.getByLabel("Ghi chú Bữa sáng").fill("Cơm hơi dư 30 g");
  await breakfast.getByRole("button", { name: "Lưu ghi chú" }).click();
  await expect(page.getByText("Đã lưu").first()).toBeVisible();
  await expect(
    breakfast.getByRole("button", { name: "Lưu ghi chú" }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    meal(page, "Bữa sáng").getByRole("button", { name: "Đạt Bữa sáng" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    meal(page, "Bữa sáng").getByLabel("Ghi chú Bữa sáng"),
  ).toHaveValue("Cơm hơi dư 30 g");

  const marks = await query<{ achieved: number; note: string }>(
    "SELECT achieved, note FROM meal_marks",
  );

  expect(marks).toHaveLength(1);
  expect(Number(marks[0].achieved)).toBe(1);
  expect(marks[0].note).toBe("Cơm hơi dư 30 g");

  // Centre the "Đạt" button and its note, clear of the sticky bars.
  await meal(page, "Bữa sáng")
    .getByLabel("Ghi chú Bữa sáng")
    .evaluate((element) => element.scrollIntoView({ block: "center" }));
  await shot(page, "04-meal-marked-dat-with-note");
});

test("S4 + S3: the PT sees the marks and logs, and is told when the plan no longer fits the target", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openAdminDay(page);

  const breakfast = meal(page, "Bữa sáng");
  const reported = breakfast.getByRole("group", { name: "Học viên đã ghi" });

  await expect(reported).toContainText("Đạt");
  await expect(reported).toContainText("Cơm hơi dư 30 g");
  await expect(reported).toContainText(E2E_FOODS.CHICKEN);
  await expect(reported).toContainText("200 g");
  // Marked "Đạt" (KAN-87): the logged chicken (313 kcal) plus the planned rice
  // the trainee did not log, so the whole breakfast plan counts.
  await expect(reported).toContainText(
    "Đã ăn: 692 kcal · P 70,1 · C 84,6 · F 8,1",
  );
  await expect(meal(page, "Bữa trưa")).toContainText(
    "Học viên chưa ghi gì cho bữa này.",
  );

  // The plan (2,084 kcal) is 9 kcal from the target (2,075): nothing to say.
  await expect(page.getByText(/Plan lệch/)).toHaveCount(0);

  // The PT lowers the carbs from today: target 160 x 4 + 200 x 4 + 55 x 9 =
  // 1,935 kcal, so the plan is 2,084.1 - 1,935 = +149 kcal over.
  const id = await getLoggerId();

  await run(
    `INSERT INTO nutrition_targets (user_id, effective_from, carbs, protein, fat, source)
     VALUES (?, ?, 200, 160, 55, 'manual')`,
    [id, TODAY],
  );
  await openAdminDay(page);

  const notice = page.getByRole("region", { name: "Plan lệch mục tiêu" });

  await expect(notice).toContainText("Plan lệch +149 kcal so với mục tiêu mới");
  await expect(notice.getByRole("listitem")).toHaveCount(1);

  await shot(page.getByRole("main"), "05-admin-logs-and-notice");
  await shot(page, "05b-admin-top-notice");
});

test("KAN-89: the PT folds a meal; its header controls still work", async ({
  page,
}) => {
  await logInAsAdmin(page);
  await openAdminDay(page);

  const breakfast = meal(page, "Bữa sáng");
  const picker = breakfast.getByLabel("Thêm món vào Bữa sáng");
  const toggle = breakfast.getByRole("button", { name: "Thu gọn Bữa sáng" });

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(picker).toBeVisible();

  await toggle.click();
  await expect(
    breakfast.getByRole("button", { name: "Mở Bữa sáng" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(picker).toBeHidden();
  await expect(breakfast).toContainText("kcal · 2 món");
  // Name input, reorder and delete stay in the header.
  await expect(breakfast.getByLabel("Tên bữa 1")).toBeVisible();
  await expect(
    breakfast.getByRole("button", { name: "Đưa Bữa sáng xuống dưới" }),
  ).toBeEnabled();
  await expect(
    breakfast.getByRole("button", { name: "Xóa Bữa sáng" }),
  ).toBeEnabled();

  await breakfast.getByRole("button", { name: "Mở Bữa sáng" }).click();
  await expect(picker).toBeVisible();
});

test("KAN-78: overwriting or deleting a day with the trainee's logs warns that they go too", async ({
  page,
}) => {
  const tomorrow = addDays(TODAY, 1);

  await logInAsAdmin(page);
  await openAdminDay(page);

  // Copy today's plan to tomorrow, which has no plan: no confirmation.
  await page.getByRole("button", { name: "Sao chép sang ngày khác" }).click();
  await page.getByRole("dialog").getByLabel(formatFullDay(tomorrow)).check();
  await page.getByRole("button", { name: "Sao chép (1 ngày)" }).click();
  await expect(page.getByText("Đã sao chép sang 1 ngày")).toBeVisible();

  // From tomorrow back over today, which has logs and a mark.
  const id = await getLoggerId();

  await page.goto(
    `/admin/users/${id}/nutrition?week=${getWeekStart(tomorrow)}&day=${tomorrow}`,
  );
  await page.getByRole("button", { name: "Sao chép sang ngày khác" }).click();
  await page.getByRole("dialog").getByLabel(formatFullDay(TODAY)).check();
  await page.getByRole("button", { name: "Sao chép (1 ngày)" }).click();

  const confirm = page.getByRole("alertdialog", { name: "Xác nhận ghi đè" });
  const todayLabel = `${getWeekdayShortLabel(TODAY)} ${formatDayMonth(TODAY)}`;

  await expect(confirm).toContainText(`Ghi đè plan của ${todayLabel}?`);
  await expect(confirm).toContainText(
    `Học viên đã ghi bữa ăn ở ${todayLabel}; ghi đè sẽ xóa nhật ký đó.`,
  );
  await shot(page, "kan-78-overwrite-confirm-with-logs");

  // "Hủy": the logs and the mark are still there.
  await confirm.getByRole("button", { name: "Hủy" }).click();
  expect(await getLogs()).toHaveLength(1);
  expect(await query("SELECT id FROM meal_marks")).toHaveLength(1);

  // Deleting a day with logs says so too (dismissed here).
  await openAdminDay(page);

  let message = "";

  page.once("dialog", (dialog) => {
    message = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Xóa plan của ngày này" }).click();
  await expect.poll(() => message).toContain("xóa plan sẽ xóa nhật ký đó");
  expect(await getLogs()).toHaveLength(1);

  // "Ghi đè": the plan is replaced and the logs and the mark go with it.
  await page.goto(
    `/admin/users/${id}/nutrition?week=${getWeekStart(tomorrow)}&day=${tomorrow}`,
  );
  await page.getByRole("button", { name: "Sao chép sang ngày khác" }).click();
  await page.getByRole("dialog").getByLabel(formatFullDay(TODAY)).check();
  await page.getByRole("button", { name: "Sao chép (1 ngày)" }).click();
  await confirm.getByRole("button", { name: "Ghi đè" }).click();
  await expect(page.getByText("Đã sao chép sang 1 ngày")).toBeVisible();
  expect(await getLogs()).toHaveLength(0);
  expect(await query("SELECT id FROM meal_marks")).toHaveLength(0);
});
