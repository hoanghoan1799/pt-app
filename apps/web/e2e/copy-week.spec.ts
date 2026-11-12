import { expect, test } from "@playwright/test";
import { addDays } from "@pt/contracts";

import { TIME_ZONE } from "@/constants/time";
import {
  formatFullDay,
  getTodayDate,
  getWeekDates,
  getWeekStart,
} from "@/utils/week";

import {
  clearApiWorkoutDays,
  countApiPlannedDays,
  findTraineeId,
  loginAdminApi,
} from "./api-seed-workouts";
import { E2E_ADMIN, E2E_LIFTER_NAME } from "./config";
import { answerConfirm } from "./confirm";

// Copy week asks in the in-app confirm dialog, never in window.confirm
// (KAN-115, docs/specs/mobile-ui-polish.md decision 8). The PT copies E2E
// Lifter's week to a week far ahead, so no other spec sees the copy; the copy
// is removed at the end.
const TODAY = getTodayDate(TIME_ZONE);
const TARGET_DATE = addDays(getWeekStart(TODAY), 63);
const TARGET_DATES = getWeekDates(getWeekStart(TARGET_DATE));

// Counts planned days through the API (a PT's read of the lifter's week).
const countCopiedDays = async (userName: string) => {
  const admin = await loginAdminApi();

  return countApiPlannedDays(
    admin,
    await findTraineeId(admin, userName),
    TARGET_DATES[0],
    TARGET_DATES[TARGET_DATES.length - 1],
  );
};

// The API has no "delete a day" route, so the copy is cleared in its e2e
// database.
const removeCopy = () =>
  clearApiWorkoutDays(
    E2E_LIFTER_NAME,
    TARGET_DATES[0],
    TARGET_DATES[TARGET_DATES.length - 1],
  );

test.afterEach(async () => {
  await removeCopy();
});

test("copy week asks in the app dialog: Hủy copies nothing, Sao chép replaces the target week", async ({
  page,
}) => {
  const nativeDialogs: string[] = [];

  page.on("dialog", (dialog) => {
    nativeDialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
  await page
    .getByRole("link", { name: new RegExp(E2E_LIFTER_NAME) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+/);

  expect(await countCopiedDays(E2E_LIFTER_NAME)).toBe(0);

  await page.getByRole("button", { name: "Sao chép tuần này" }).click();

  const sheet = page.getByRole("dialog", { name: "Sao chép tuần" });
  const submit = sheet.getByRole("button", { name: "Sao chép", exact: true });

  // Pick the target day on the month grid, moving forward to its month.
  const targetDay = sheet.getByRole("button", {
    name: formatFullDay(TARGET_DATE),
    exact: true,
  });

  for (let step = 0; step < 4 && !(await targetDay.isVisible()); step++) {
    await sheet.getByRole("button", { name: "Tháng sau" }).click();
  }
  await targetDay.click();
  await expect(targetDay).toHaveAttribute("aria-pressed", "true");

  // Hủy: the sheet stays open and nothing was copied.
  await submit.click();
  await answerConfirm(
    page,
    "Hủy",
    "Lịch của tuần đích sẽ bị thay thế bằng tuần này. Tiếp tục?",
  );
  await expect(sheet).toBeVisible();
  expect(await countCopiedDays(E2E_LIFTER_NAME)).toBe(0);

  // Sao chép: the sheet closes, a toast confirms and the week is copied.
  await submit.click();
  await answerConfirm(page, "Sao chép");
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toBeVisible();
  await expect.poll(() => countCopiedDays(E2E_LIFTER_NAME)).toBeGreaterThan(0);

  expect(nativeDialogs).toEqual([]);
});
