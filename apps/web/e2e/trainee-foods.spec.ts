import { expect, type Page, test } from "@playwright/test";

import { fillTraineeLogin } from "./auth";
import { E2E_USER_NAME } from "./config";
import { E2E_FOODS } from "./seed";

// Trainee view of the food library test matrix (docs/specs/food-library.md):
// F9 (read-only library), the amount calculator of the goal example, and the
// 390 px layout check of F13.
const logIn = async (page: Page) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_USER_NAME);
  await expect(page).toHaveURL(/\/workouts/);
};

const hasNoHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test("F9: the trainee browses the library from the nutrition page without any edit controls", async ({
  page,
}) => {
  await page.goto("/nutrition");
  await page.getByRole("link", { name: /Thư viện thực phẩm/ }).click();
  await expect(page).toHaveURL(/\/foods$/);
  await expect(
    page.getByRole("heading", { name: "Thư viện thực phẩm" }),
  ).toBeVisible();

  const chicken = page.getByRole("link", { name: /Ức gà \(chín\)/ });

  await expect(chicken).toBeVisible();
  await expect(chicken).toContainText("165 kcal");
  await expect(chicken).toContainText("Thịt · Chín");
  await expect(chicken).toContainText("P 31");
  await expect(chicken).toContainText("F 3,6");
  // Macro split bar: 79 % protein, 0 % carb, 21 % fat of the calories.
  await expect(
    chicken.getByRole("img", { name: /Protein 79%, Carb 0%, Fat 21%/ }),
  ).toBeVisible();

  // The admin's Phở bò was archived by the PT specs: gone for the trainee.
  await expect(page.getByRole("link", { name: /Phở bò/ })).toHaveCount(0);

  // No add, edit or delete controls on the list.
  await expect(page.getByRole("link", { name: "Thêm món" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Xóa" })).toHaveCount(0);
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  // Detail: per 100 g numbers and the read-only calculator.
  await chicken.click();
  await expect(page).toHaveURL(/\/foods\/\d+$/);
  await expect(
    page.getByRole("heading", { name: "Ức gà (chín)", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("165 kcal / 100 g")).toBeVisible();
  await expect(page.getByText("Nguồn: e2e")).toBeVisible();
  await expect(page.getByRole("button", { name: "Xóa" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lưu thay đổi" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Tên món")).toHaveCount(0);
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  // 150 g: 248 kcal, P 46.5, C 0, F 5.4.
  await page.getByLabel("Khối lượng (gram)").fill("150");

  const result = page.locator('dl[aria-live="polite"]');

  await expect(result).toContainText("248 kcal");
  await expect(result.getByText("Protein").locator("xpath=..")).toContainText(
    "46,5 g",
  );
  await expect(result.getByText("Carb").locator("xpath=..")).toContainText(
    "0 g",
  );
  await expect(result.getByText("Fat").locator("xpath=..")).toContainText(
    "5,4 g",
  );

  // A bad amount shows a hint and zeros, never wrong numbers.
  await page.getByLabel("Khối lượng (gram)").fill("abc");
  await expect(page.getByText("Nhập số từ 0 đến 10000 g")).toBeVisible();
  await expect(result).toContainText("0 kcal");
});

test("the calculator takes servings when the food has one", async ({
  page,
}) => {
  await page.goto("/foods");
  await page
    .getByRole("link", {
      name: new RegExp(E2E_FOODS.RICE.replace(/[()]/g, "\\$&")),
    })
    .click();
  await page.getByRole("button", { name: /Khẩu phần \(1 chén\)/ }).click();
  await page.getByLabel("Số khẩu phần").fill("1.5");

  // 1.5 × 160 g = 240 g: 312 kcal, P 6.5, C 67.7, F 0.7.
  await expect(page.getByText("= 240 g")).toBeVisible();

  const result = page.locator('dl[aria-live="polite"]');

  await expect(result).toContainText("312 kcal");
  await expect(result.getByText("Protein").locator("xpath=..")).toContainText(
    "6,5 g",
  );
  await expect(result.getByText("Carb").locator("xpath=..")).toContainText(
    "67,7 g",
  );
  await expect(result.getByText("Fat").locator("xpath=..")).toContainText(
    "0,7 g",
  );

  // Bad servings show a servings hint (max 10000 / 160 = 62) and zeros.
  for (const bad of ["abc", "-1", "1e2", "63"]) {
    await page.getByLabel("Số khẩu phần").fill(bad);
    await expect(page.getByText("Nhập số từ 0 đến 62 khẩu phần")).toBeVisible();
    await expect(result).toContainText("0 kcal");
  }
});

test("a food without a serving only offers grams", async ({ page }) => {
  await page.goto("/foods");
  await page.getByRole("link", { name: /Cá hồi/ }).click();
  await expect(page.getByLabel("Khối lượng (gram)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Khẩu phần/ })).toHaveCount(0);
});

test("the admin library is closed to trainees", async ({ page }) => {
  await page.goto("/admin/foods");
  await expect(page).toHaveURL(/\/workouts/);
});

test("a food that does not exist shows not found", async ({ page }) => {
  await page.goto("/foods/999999");

  // The food is read from the API after the page's loading shell is sent, so
  // the HTTP status is already 200 (Next streams a not-found as the 404 page
  // plus a noindex tag): the trainee sees the 404 page and no food.
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Thư viện thực phẩm" }),
  ).toHaveCount(0);
});
