import { expect, type Page, test } from "@playwright/test";

import { fillTraineeLogin, logOutViaMenu } from "./auth";
import { E2E_ADMIN, E2E_BASE_URL, E2E_USER_NAME } from "./config";
import { answerConfirm } from "./confirm";

// Header gear and avatar menus on both sites, and the theme choice
// (KAN-116, docs/specs/mobile-ui-polish.md decision 7).
const header = (page: Page) => page.getByRole("banner");
const gear = (page: Page) =>
  header(page).getByRole("button", { name: "Cài đặt" });
const avatar = (page: Page) =>
  header(page).getByRole("button", { name: "Tài khoản" });

const logInAsTrainee = async (page: Page) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_USER_NAME);
  await expect(page).toHaveURL(/\/workouts/);
};

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

test("the theme menu sets dark and it survives a reload", async ({ page }) => {
  await logInAsTrainee(page);
  const html = page.locator("html");

  await expect(html).toHaveAttribute("data-theme", "system");
  await gear(page).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Hệ thống" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Tối" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("menuitemradio", { name: "Tối" }),
  ).toHaveAttribute("aria-checked", "true");
  // Dark colors are really applied, not just the attribute.
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(12, 12, 14)",
  );

  await expect
    .poll(
      async () =>
        (await page.context().cookies()).find((c) => c.name === "theme")?.value,
    )
    .toBe("dark");
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "theme",
  );

  expect(cookie?.sameSite).toBe("Lax");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(12, 12, 14)",
  );
  await gear(page).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Tối" }),
  ).toHaveAttribute("aria-checked", "true");

  await page.getByRole("menuitemradio", { name: "Sáng" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(244, 244, 245)",
  );
  await page.getByRole("menuitemradio", { name: "Hệ thống" }).click();
  await expect(html).toHaveAttribute("data-theme", "system");
});

test("Hệ thống follows the OS color scheme and a forced theme overrides it", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await logInAsTrainee(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(12, 12, 14)",
  );

  await gear(page).click();
  await page.getByRole("menuitemradio", { name: "Sáng" }).click();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(244, 244, 245)",
  );
  await page.getByRole("menuitemradio", { name: "Hệ thống" }).click();
});

test("a tampered theme cookie falls back to system", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "theme", value: "neon", url: E2E_BASE_URL },
  ]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
});

test("the avatar menu asks before logging out: Hủy stays, Đăng xuất leaves", async ({
  page,
}) => {
  await logInAsTrainee(page);

  await avatar(page).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await answerConfirm(page, "Hủy", "Đăng xuất khỏi thiết bị này?");
  await expect(page).toHaveURL(/\/workouts/);
  await expect(header(page)).toBeVisible();

  await logOutViaMenu(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.goto("/workouts");
  await expect(page).toHaveURL(/\/$/);
});

test("the trainee menus hold no admin items and link to the password page", async ({
  page,
}) => {
  await logInAsTrainee(page);

  await avatar(page).click();
  const avatarMenu = page.getByRole("menu", { name: "Tài khoản" });

  // The menu grew after this spec was written: the social profile (KAN-157)
  // and the profile photo sheet joined the password page and the log-out.
  await expect(avatarMenu.getByRole("menuitem")).toHaveText([
    "Trang cá nhân",
    "Ảnh đại diện",
    "Đổi mật khẩu",
    "Đăng xuất",
  ]);
  await expect(
    avatarMenu.getByRole("menuitem", { name: "Đổi mật khẩu" }),
  ).toHaveAttribute("href", "/account/password");

  await gear(page).click();
  const gearMenu = page.getByRole("menu", { name: "Cài đặt" });

  await expect(gearMenu).toBeVisible();
  await expect(avatarMenu).toHaveCount(0);
  await expect(gearMenu.getByText("Giao diện").first()).toBeVisible();
  await expect(gearMenu.getByRole("menuitemcheckbox")).toHaveCount(1);
  for (const admin of ["Thực phẩm", "Tin nhắn", "Thêm user", "Admin"]) {
    await expect(page.getByRole("menuitem", { name: admin })).toHaveCount(0);
  }

  // The old loose header icons are gone.
  await page.keyboard.press("Escape");
  await expect(
    header(page).getByRole("link", { name: "Đổi mật khẩu" }),
  ).toHaveCount(0);
  await expect(
    header(page).getByRole("button", { name: "Đăng xuất" }),
  ).toHaveCount(0);

  await avatar(page).click();
  await page.getByRole("menuitem", { name: "Đổi mật khẩu" }).click();
  await expect(page).toHaveURL(/\/account\/password$/);
});

test("the admin header has messages, gear and avatar; Đổi mật khẩu only shows a toast", async ({
  page,
}) => {
  await logInAsAdmin(page);

  await expect(
    header(page).getByRole("link", { name: "Tin nhắn" }),
  ).toBeVisible();
  await expect(gear(page)).toBeVisible();
  await expect(avatar(page)).toBeVisible();

  await avatar(page).click();
  const url = page.url();

  await page.getByRole("menuitem", { name: "Đổi mật khẩu" }).click();
  await expect(page.locator("[data-sonner-toast]")).toHaveText(
    "Tính năng đang cập nhật",
  );
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Admin logout asks first and lands on the admin login.
  await logOutViaMenu(page);
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("the menus open and close by tap, outside tap and Esc, with the right aria", async ({
  page,
}) => {
  await logInAsTrainee(page);

  for (const trigger of [gear(page), avatar(page)]) {
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menu")).toHaveCount(1);
    const box = await trigger.boundingBox();

    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    // Tap the trigger again.
    await trigger.click();
    await expect(page.getByRole("menu")).toHaveCount(0);

    // Esc, and focus returns to the trigger.
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    // Tap outside.
    await trigger.click();
    await expect(page.getByRole("menu")).toHaveCount(1);
    await page.locator("main").click({ position: { x: 5, y: 300 } });
    await expect(page.getByRole("menu")).toHaveCount(0);
  }

  // Opening one menu closes the other.
  await gear(page).click();
  await avatar(page).click();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(page.getByRole("menu", { name: "Tài khoản" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("at 320 px the header and both menus fit without sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await logInAsTrainee(page);

  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const trigger of [gear(page), avatar(page)]) {
    await trigger.click();
    const box = await page.getByRole("menu").boundingBox();

    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
  }

  await logOutViaMenu(page);
  await logInAsAdmin(page);
  expect(await overflow()).toBeLessThanOrEqual(0);
  const right = await avatar(page).evaluate(
    (el) => el.getBoundingClientRect().right,
  );

  expect(right).toBeLessThanOrEqual(320);
});
