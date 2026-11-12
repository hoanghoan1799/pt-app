import { type Browser, expect, type Page, test } from "@playwright/test";

import { getStoredBodies, getUserId, resetChat } from "./api-seed-chat";
import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_CHAT_NAME } from "./config";

// Chat slash commands (KAN-167): `/imlang` turns into a chip in the composer
// and sends the message without a push. Owns the seeded chat trainee and wipes
// its chat rows first, like e2e/chat.spec.ts.
const SEND_TIMEOUT_MS = 60_000;
const SHOTS_DIR = process.env.E2E_COMMAND_SHOTS_DIR;

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

// A phone-sized context at 2x so the screenshots are sharp.
const newPhoneSession = async (browser: Browser) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

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

const getComposer = (page: Page) => page.getByLabel("Nội dung tin nhắn");
const getListbox = (page: Page) => page.getByRole("listbox", { name: "Lệnh" });
const getChipRemove = (page: Page) =>
  page.getByRole("button", { name: "Bỏ lệnh /imlang" });
// The chip is the pill that holds the remove button.
const getChip = (page: Page) =>
  page.locator("form span").filter({ has: getChipRemove(page) });

const shot = async (page: Page, name: string) => {
  if (SHOTS_DIR) {
    await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
  }
};

test("/imlang becomes a chip, sends silently without the command text, and still counts as unread", async ({
  page: admin,
  browser,
}) => {
  test.setTimeout(120_000);
  await resetChat(E2E_CHAT_NAME);
  const userId = await getUserId(E2E_CHAT_NAME);
  const body = "hẹn mai nhé";
  const trainee = await newPhoneSession(browser);

  try {
    // Enable the chat for the trainee as the PT.
    await logInAsAdmin(admin);
    await admin.goto(`/admin/users/${userId}/messages`);
    const lock = admin.getByRole("switch", { name: "Cho phép nhắn tin" });

    await expect(lock).toHaveAttribute("aria-checked", "false");
    await lock.click();
    await expect(lock).toHaveAttribute("aria-checked", "true");
    // Leave the thread: an open thread keeps polling and would mark the
    // trainee's message read, racing the unread check below.
    await admin.goto("/admin");

    const page = trainee.page;

    await page.goto("/");
    await fillTraineeLogin(page, E2E_CHAT_NAME);
    await expect(page).toHaveURL(/\/workouts/);
    await page.goto("/messages/coach");
    const composer = getComposer(page);

    // 1. Typing "/" lists the command; clicking it makes the chip.
    await expect(getListbox(page)).toHaveCount(0);
    await composer.click();
    await composer.pressSequentially("/");
    const option = getListbox(page).getByRole("option");

    await expect(option).toHaveCount(1);
    await expect(option).toContainText("/imlang");
    await expect(option).toContainText("Gửi không thông báo");
    await shot(page, "chat-commands-01-listbox");
    await option.getByRole("button").click();
    await expect(getListbox(page)).toHaveCount(0);
    await expect(getChip(page)).toHaveText("/imlang");
    await expect(composer).toHaveValue("");
    await expect(composer).toHaveAttribute(
      "placeholder",
      "Gửi không thông báo…",
    );

    // 4. Backspace in the empty box removes the chip.
    await composer.press("Backspace");
    await expect(getChip(page)).toHaveCount(0);
    await expect(composer).toHaveValue("");
    await expect(composer).toHaveAttribute("placeholder", "Nhắn tin cho PT…");

    // 2. Typing the whole command turns it into the chip at the space.
    await composer.pressSequentially(`/imlang ${body}`);
    await expect(getChip(page)).toHaveText("/imlang");
    await expect(composer).toHaveValue(body);
    await shot(page, "chat-commands-02-chip-with-text");
    await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
    await expect(page.getByText("Đang gửi…")).toHaveCount(0, {
      timeout: SEND_TIMEOUT_MS,
    });
    const traineeLog = page.getByRole("log");

    await expect(traineeLog.getByText(body, { exact: true })).toBeVisible();
    await expect(traineeLog.getByText("/imlang")).toHaveCount(0);
    // The chip is gone after sending.
    await expect(getChip(page)).toHaveCount(0);
    await expect.poll(() => getStoredBodies(E2E_CHAT_NAME)).toEqual([body]);

    await page.reload();
    await expect(
      page.getByRole("log").getByText(body, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("log").getByText("/imlang")).toHaveCount(0);
    await expect(getStoredBodies(E2E_CHAT_NAME)).resolves.toEqual([body]);

    // 3. The PT sees the message and the unread count still goes up.
    await page.goto("/workouts");
    await admin.goto("/admin/messages");
    const row = admin.getByRole("link").filter({ hasText: E2E_CHAT_NAME });

    await expect(row).toHaveCount(1);
    await expect(row).toContainText(body);
    await expect(row).not.toContainText("/imlang");
    await expect(row.getByRole("status")).toHaveAccessibleName(
      "1 tin nhắn chưa đọc",
    );
    await expect(row.getByRole("status")).toHaveText("1");

    await admin.goto(`/admin/users/${userId}/messages`);
    await expect(
      admin.getByRole("log").getByText(body, { exact: true }),
    ).toBeVisible();
  } finally {
    await trainee.context.close();
  }
});
