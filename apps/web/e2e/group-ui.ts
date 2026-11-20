import { type Browser, expect, type Page, test } from "@playwright/test";

import { fillTraineeLogin } from "./auth";

// Shared steps of the group chat specs (group-chat, group-manage): sessions,
// sign-ins, the bubbles and sheets of a thread and the inbox rows.
export const SYNC = { timeout: 20_000 };
const SEND_TIMEOUT_MS = 60_000;
const LONG_PRESS_MS = 600;
export const PT_PASSWORD = "e2e-only-pt-password";

export const tag = () => Date.now().toString(36);

export const newSession = async (browser: Browser) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });

  // The install banner would cover the composer.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "pt-app:install-dismissed-at",
        String(Date.now()),
      );
    } catch {
      // Storage blocked: nothing to dismiss.
    }
  });
  return { context, page: await context.newPage() };
};

export const signInAdmin = async (
  page: Page,
  username: string,
  password: string,
) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(username);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

export const signInTrainee = async (page: Page, name: string) => {
  await page.goto("/");
  await fillTraineeLogin(page, name);
  await expect(page).toHaveURL(/\/workouts/);
};

export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The bubble whose text is exactly `text`.
export const bubble = (page: Page, text: string) =>
  page
    .getByRole("log")
    .locator("[data-bubble]")
    .filter({
      has: page.locator("p", {
        hasText: new RegExp(`^${escapeRegExp(text)}$`),
      }),
    });

// The bubble plus the chips and the edited label under it.
export const entry = (page: Page, text: string) =>
  bubble(page, text).locator("xpath=../..");

export const sheet = (page: Page) => page.getByRole("dialog");

export const longPress = async (page: Page, text: string) => {
  const box = await bubble(page, text).boundingBox();

  if (!box) {
    throw new Error(`No bubble with the text "${text}"`);
  }
  // Low in the bubble: on a reply the quote (a button) fills the top.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
  await page.mouse.down();
  await page.waitForTimeout(LONG_PRESS_MS);
  await page.mouse.up();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByText("Sao chép")).toBeVisible();
};

export const send = async (page: Page, text: string) => {
  await page.getByLabel("Nội dung tin nhắn").fill(text);
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Đang gửi…")).toHaveCount(0, {
    timeout: SEND_TIMEOUT_MS,
  });
};

export const groupRow = (page: Page, name: string) =>
  page
    .getByRole("region", { name: "Danh sách nhóm chat" })
    .getByRole("link", { name: new RegExp(escapeRegExp(name)) });

export const openGroup = async (page: Page, name: string) => {
  await groupRow(page, name).click();
  await expect(
    page.getByRole("log", { name: `Tin nhắn trong nhóm ${name}` }),
  ).toBeAttached();
};
