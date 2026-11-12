import { expect, type Page, test } from "@playwright/test";

import { E2E_ADMIN } from "./config";

// Admin dashboard "Thao tác" tiles and the add-user sheet (KAN-124).
const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

const actions = (page: Page) => page.getByRole("region", { name: "Thao tác" });

test.beforeEach(async ({ page }) => {
  await logInAsAdmin(page);
});

test("the Thư viện món and Tin nhắn tiles open their pages", async ({
  page,
}) => {
  await expect(actions(page).getByRole("link")).toHaveCount(2);

  await actions(page).getByRole("link", { name: "Thư viện món" }).click();
  await expect(page).toHaveURL(/\/admin\/foods$/);

  await page.goto("/admin");
  await actions(page)
    .getByRole("link", { name: /^Tin nhắn/ })
    .click();
  await expect(page).toHaveURL(/\/admin\/messages$/);
});

test("the dashboard does not scroll sideways at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/admin");
  await expect(actions(page)).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(0);
});

test("the Thêm user tile opens the sheet; the one-time password and Sao chép show at the top", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const email = `tile.${suffix}@e2e.test`;

  await actions(page).getByRole("button", { name: "Thêm user" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm user" });

  // Visible labels, not placeholders.
  await expect(sheet.getByText("Tên user mới", { exact: true })).toBeVisible();
  await expect(
    sheet.getByText("Email đăng nhập", { exact: true }),
  ).toBeVisible();
  await sheet.getByLabel("Tên user mới").fill(`E2E Tile ${suffix}`);
  await sheet.getByLabel("Email đăng nhập").fill(email);
  await sheet.getByRole("button", { name: "Thêm", exact: true }).click();

  const password = sheet.getByTestId("one-time-password");
  const copy = sheet.getByRole("button", { name: "Sao chép" });

  await expect(password).toHaveText(/\S{8,}/);
  await expect(copy).toBeVisible();
  await expect(sheet.getByRole("status")).toContainText(email);

  // The password sits above the copy button, inside the sheet's viewport.
  const passwordBox = await password.boundingBox();
  const copyBox = await copy.boundingBox();
  const sheetBox = await sheet.boundingBox();

  expect(passwordBox && copyBox && sheetBox).toBeTruthy();
  expect(passwordBox!.y).toBeLessThan(copyBox!.y);
  expect(copyBox!.y + copyBox!.height).toBeLessThanOrEqual(
    sheetBox!.y + sheetBox!.height,
  );

  await sheet.getByRole("button", { name: "Xong" }).click();
  await expect(sheet).toHaveCount(0);
});
