import { expect, type Page, test } from "@playwright/test";

import { fillTraineeLogin } from "./auth";
import { E2E_USER_NAME } from "./config";
import { E2E_EXERCISES, getE2eDates } from "./seed";

// Trainee flow of the set-logging test matrix (docs/specs/set-logging.md):
// A1, B1, B2, B3, B5, B6, B9, B12, B15 and B17. The specs share one seeded DB.
const logIn = async (page: Page) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_USER_NAME);
  await expect(page).toHaveURL(/\/workouts/);
};

const getCard = (page: Page, title: string) =>
  page.locator("article").filter({ hasText: title });

test.beforeEach(async ({ page }) => {
  // Thumbnails come from YouTube; the suite must not depend on the network.
  await page.route(/(ytimg|youtube)\.com/, (route) => route.abort());
  await logIn(page);
});

test("B1: each row hints the previous session's set at its position", async ({
  page,
}) => {
  const card = getCard(page, E2E_EXERCISES.BENCH);

  await expect(
    card.getByRole("button", {
      name: /^Lần trước 40 kg × 10, dùng cho hiệp 1/,
    }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: /^Lần trước 40 kg × 8, dùng cho hiệp 2/ }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", {
      name: /^Lần trước 35 kg × 10, dùng cho hiệp 3/,
    }),
  ).toBeVisible();
});

test("A1, B2: tapping hints and saving stores the sets and marks it done", async ({
  page,
}) => {
  const card = getCard(page, E2E_EXERCISES.BENCH);

  for (const setNumber of [1, 2, 3]) {
    await card
      .getByRole("button", { name: new RegExp(`dùng cho hiệp ${setNumber}$`) })
      .click();
  }
  await expect(card.getByLabel("Số kg hiệp 1")).toHaveValue("40");
  await expect(card.getByLabel("Số lần hiệp 2")).toHaveValue("8");

  await card.getByRole("button", { name: "Lưu", exact: true }).click();

  await expect(page.getByText("Đã lưu các hiệp")).toBeVisible();
  await expect(card.getByRole("button", { name: /Đã tập xong/ })).toBeVisible();
  // B2: an exact tie with history is not a personal best.
  await expect(card.getByText("Kỷ lục mới", { exact: true })).toHaveCount(0);

  // Survives a reload: the sets are in the database, not in client state.
  await page.reload();
  await expect(
    getCard(page, E2E_EXERCISES.BENCH).getByRole("button", {
      name: /Đã tập xong/,
    }),
  ).toBeVisible();
  const reloadedBench = getCard(page, E2E_EXERCISES.BENCH);

  for (const [index, kg, reps] of [
    [1, "40", "10"],
    [2, "40", "8"],
    [3, "35", "10"],
  ] as const) {
    await expect(reloadedBench.getByLabel(`Số kg hiệp ${index}`)).toHaveValue(
      kg,
    );
    await expect(reloadedBench.getByLabel(`Số lần hiệp ${index}`)).toHaveValue(
      reps,
    );
  }
});

test("B3: beating the previous best shows the personal-best badge", async ({
  page,
}) => {
  const card = getCard(page, E2E_EXERCISES.SQUAT);

  await card.getByLabel("Số kg hiệp 1").fill("45");
  await card.getByLabel("Số lần hiệp 1").fill("10");
  await card.getByLabel("Số kg hiệp 2").fill("40");
  await card.getByLabel("Số lần hiệp 2").fill("8");
  await card.getByLabel("Số kg hiệp 3").fill("35");
  await card.getByLabel("Số lần hiệp 3").fill("10");
  await card.getByRole("button", { name: "Lưu", exact: true }).click();

  await expect(page.getByText("Kỷ lục mới! 🏆")).toBeVisible();
  await expect(card.getByText("Kỷ lục mới", { exact: true })).toBeVisible();
});

test("B5: a timed exercise has no set rows", async ({ page }) => {
  const card = getCard(page, E2E_EXERCISES.PLANK);

  await expect(card).toBeVisible();
  await expect(card.getByLabel("Số kg hiệp 1")).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Lưu", exact: true }),
  ).toHaveCount(0);
});

test("B15: a timed exercise with logged sets shows them read-only", async ({
  page,
}) => {
  const card = getCard(page, E2E_EXERCISES.TIMED_LOGGED);

  await expect(card.getByText("Đã ghi:")).toBeVisible();
  await expect(card.getByText("20 kg × 30 · Tự trọng × 25")).toBeVisible();
  await expect(card.getByLabel("Số kg hiệp 1")).toHaveCount(0);
  await expect(card.getByLabel("Số lần hiệp 1")).toHaveCount(0);
  await expect(card.locator("input")).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Lưu", exact: true }),
  ).toHaveCount(0);
});

test("B6: a future day has no set rows", async ({ page }) => {
  const { future } = getE2eDates();

  await page.goto(`/workouts?week=${future}&day=${future}`);
  const card = getCard(page, E2E_EXERCISES.FUTURE);

  await expect(card).toBeVisible();
  await expect(card.getByText("Chưa tới ngày tập")).toBeVisible();
  await expect(card.getByLabel("Số kg hiệp 1")).toHaveCount(0);
});

test("B9: at most 10 rows; deleting a row frees a slot", async ({ page }) => {
  const card = getCard(page, E2E_EXERCISES.ROWS);
  const add = card.getByRole("button", { name: "Thêm hiệp" });

  // Seeded with 3 rows.
  for (let row = 3; row < 10; row += 1) {
    await add.click();
  }
  await expect(card.getByLabel("Số kg hiệp 10")).toBeVisible();
  await expect(add).toBeDisabled();

  await card.getByRole("button", { name: "Xóa hiệp 10" }).click();
  await expect(card.getByLabel("Số kg hiệp 10")).toHaveCount(0);
  await expect(card.getByLabel("Số kg hiệp 9")).toBeVisible();
  await expect(add).toBeEnabled();
});

test("B17: saving one of four planned sets keeps the planned rows", async ({
  page,
}) => {
  const card = getCard(page, E2E_EXERCISES.PARTIAL);

  await card.getByLabel("Số lần hiệp 1").fill("10");
  await card.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText("Đã lưu các hiệp")).toBeVisible();

  await page.reload();
  const reloaded = getCard(page, E2E_EXERCISES.PARTIAL);

  await expect(reloaded.getByLabel("Số lần hiệp 1")).toHaveValue("10");
  await expect(reloaded.getByLabel("Số lần hiệp 4")).toBeVisible();
  await expect(reloaded.getByLabel("Số lần hiệp 5")).toHaveCount(0);
});

test("B12: the day does not scroll horizontally at 390 px", async ({
  page,
}) => {
  // ROWS is on the default day; adding a row renders a wider logger.
  await expect(getCard(page, E2E_EXERCISES.BENCH)).toBeVisible();
  const rows = getCard(page, E2E_EXERCISES.ROWS);

  await rows.getByRole("button", { name: "Thêm hiệp" }).click();
  await expect(rows.getByLabel("Số kg hiệp 4")).toBeVisible();

  const { innerWidth, scrollWidth } = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(innerWidth).toBe(390);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
