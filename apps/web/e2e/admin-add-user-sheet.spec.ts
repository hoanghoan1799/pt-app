import { expect, type Page, test } from "@playwright/test";

import { E2E_ADMIN } from "./config";

// KAN-131: the add-user bottom sheet must keep the email field reachable on a
// phone, also at a short (keyboard-open) viewport.
const SHOT_PATH = process.env.KAN131_SHOT;

const openAddUserSheet = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
  await page.getByRole("button", { name: /Thêm user/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Let the slide-in animation settle before measuring.
  await page.waitForTimeout(700);
};

const expectEmailReachable = async (page: Page) => {
  const dialog = page.getByRole("dialog");
  const email = dialog.getByLabel("Email đăng nhập");
  const submit = dialog.getByRole("button", { name: "Thêm", exact: true });
  await expect(email).toBeVisible();
  await expect(submit).toBeVisible();

  // Focusing scrolls the field into view, as tapping it does on a phone.
  await email.focus();
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const input = document.getElementById("member-email");
    const button = document.querySelector<HTMLElement>(
      '[role="dialog"] button[type="submit"]',
    );
    if (!input || !button) {
      return null;
    }
    const rect = input.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const btn = button.getBoundingClientRect();
    // The whole field must be clickable, not only its centre: probe the lower
    // edge too, where a pinned submit button would overlap it.
    const edgeHit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.bottom - 3,
    );
    return {
      edgeHitIsInput: edgeHit === input || input.contains(edgeHit),
      top: rect.top,
      bottom: rect.bottom,
      hitIsInput: hit === input || input.contains(hit),
      buttonBottom: btn.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(result).not.toBeNull();
  expect(result?.top).toBeGreaterThanOrEqual(0);
  expect(result?.bottom).toBeLessThanOrEqual(result?.viewportHeight ?? 0);
  expect(result?.hitIsInput).toBe(true);
  expect(result?.edgeHitIsInput).toBe(true);
  expect(result?.buttonBottom).toBeLessThanOrEqual(result?.viewportHeight ?? 0);

  await email.fill("kan131@example.com");
  await expect(email).toHaveValue("kan131@example.com");
};

test.use({ deviceScaleFactor: 2 });

for (const height of [844, 500, 320]) {
  test(`the email field is reachable in the add-user sheet at 390x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height });
    await openAddUserSheet(page);
    if (SHOT_PATH && height === 844) {
      await page.screenshot({ path: SHOT_PATH });
    }
    await expectEmailReachable(page);
  });
}
