import { type Browser, expect, type Page, test } from "@playwright/test";

import { setChatState, setLocked } from "./api-seed-chat";
import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_CHAT_NAME } from "./config";
import { shot } from "./shots";

// Conversation settings (KAN-142, docs/specs/chat-ux-v2.md D1, D4): private
// nicknames (docs/specs/private-nicknames.md) and bubble colour, on the
// polling transport (no realtime socket in e2e). The spec owns E2E_CHAT_NAME and
// resets its chat rows first and last.
const SEND_TIMEOUT_MS = 60_000;
const SYNC_TIMEOUT_MS = 20_000;
const SHOT_VIEWPORT = { width: 390, height: 844 };

const newSession = async (browser: Browser) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: SHOT_VIEWPORT,
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

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

const send = async (page: Page, text: string) => {
  await page.getByLabel("Nội dung tin nhắn").fill(text);
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Đang gửi…")).toHaveCount(0, {
    timeout: SEND_TIMEOUT_MS,
  });
};

const LONG_PRESS_MS = 600;
const QUOTE = "Xem tin nhắn được trả lời";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The bubble whose own paragraph is exactly this text (a reply's quote holds
// the original text too, so a plain text match would be ambiguous).
const bubbleOf = (page: Page, text: string) =>
  page
    .getByRole("log")
    .locator("[data-bubble]")
    .filter({
      has: page.locator("p", {
        hasText: new RegExp(`^${escapeRegExp(text)}$`),
      }),
    });

const replyTo = async (page: Page, text: string, reply: string) => {
  const box = await bubbleOf(page, text).boundingBox();

  if (!box) {
    throw new Error(`No bubble with the text "${text}"`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(LONG_PRESS_MS);
  await page.mouse.up();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Trả lời", exact: true })
    .click();
  await send(page, reply);
};

// The settings live on the chat info page since KAN-160: the header's info
// link opens it and "Tuỳ chỉnh" shows the panel (nicknames, colours, photo).
const INFO_LINK = "Thông tin cuộc trò chuyện";

const showCustomize = async (page: Page) => {
  await page.getByRole("button", { name: "Tuỳ chỉnh" }).click();
  await expect(page.locator("[data-chat-settings]")).toBeVisible();
};

const openSettings = async (page: Page) => {
  await page.getByRole("link", { name: INFO_LINK }).click();
  await showCustomize(page);
};

// Back from the info page to the thread.
const closeSettings = async (page: Page) => {
  await page.goBack();
  await expect(page.locator("[data-chat-settings]")).toHaveCount(0);
};

const saveNickname = async (page: Page, id: string, value: string) => {
  const field = page.locator(`#${id}`);
  // The nickname block holds the input, its Lưu button and the counter.
  const block = page.locator("[data-nickname-target]").filter({ has: field });

  await field.fill(value);
  await block.getByRole("button", { name: "Lưu" }).click();
  await expect(block).not.toContainText("Đang lưu");
};

// The admin account colour is in the header settings menu (gear), not in the
// conversation panel: the colour of every chat without its own.
const openAccountColor = async (page: Page) => {
  await page.getByRole("button", { name: "Cài đặt" }).click();
  await page.getByRole("menuitem", { name: "Màu tài khoản" }).click();
  const group = page.getByRole("radiogroup", { name: "Màu tài khoản" });

  await expect(group).toBeVisible();
  return group;
};

const shoot = async (page: Page, name: string) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    // Hide the Next dev badge and let the colour transitions finish.
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.waitForTimeout(400);
    await shot(page, `${name}-${scheme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
};

test.describe("chat settings", () => {
  test.afterAll(async () => {
    await setChatState(E2E_CHAT_NAME, false);
  });

  test("nicknames and colours are set in the sheet and seen on both sides", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const userId = await setChatState(E2E_CHAT_NAME, true);
    const trainee = await newSession(browser);
    const admin = await newSession(browser);
    const t = trainee.page;
    const a = admin.page;

    await t.goto("/");
    await fillTraineeLogin(t, E2E_CHAT_NAME);
    await expect(t).toHaveURL(/\/workouts/);
    await t.goto("/messages/coach");
    await send(t, "Chào PT, hôm nay tập gì ạ?");

    await logInAsAdmin(a);
    await a.goto(`/admin/users/${userId}/messages`);
    await expect(a.getByText("Chào PT, hôm nay tập gì ạ?")).toBeVisible({
      timeout: SYNC_TIMEOUT_MS,
    });
    await send(a, "Chào em, hôm nay tập chân nhé.");
    await expect(t.getByText("Chào em, hôm nay tập chân nhé.")).toBeVisible({
      timeout: SYNC_TIMEOUT_MS,
    });

    // Trainee: private nickname for the PT, own colour. No field to rename
    // yourself.
    await openSettings(t);
    await expect(t.locator("#chat-nickname-other")).toBeVisible();
    await expect(t.locator("#chat-nickname-self")).toHaveCount(0);
    await expect(t.getByText("Chỉ bạn nhìn thấy biệt danh này")).toBeVisible();
    await expect(
      t.getByRole("radiogroup", { name: "Màu tin nhắn" }).getByRole("radio"),
    ).toHaveCount(8);
    // No control for the other person's colour.
    await expect(t.getByRole("radiogroup")).toHaveCount(1);
    await shoot(t, "trainee-settings-sheet");
    await t
      .getByRole("radiogroup", { name: "Màu tin nhắn" })
      .scrollIntoViewIfNeeded();
    await shoot(t, "trainee-settings-sheet-colours");
    await saveNickname(t, "chat-nickname-other", "Coach Hoan");
    await t
      .getByRole("radiogroup", { name: "Màu tin nhắn" })
      .getByRole("radio", { name: "Xanh dương" })
      .click();
    await expect(
      t
        .getByRole("radio", { name: "Xanh dương" })
        .and(t.locator('[aria-checked="true"]')),
    ).toBeVisible();
    await closeSettings(t);

    await expect(t.getByRole("heading", { name: "Coach Hoan" })).toBeVisible();
    await expect(
      t.locator('[data-bubble-color="blue"]').filter({
        hasText: "Chào PT, hôm nay tập gì ạ?",
      }),
    ).toBeVisible();

    // Admin sees the trainee's nickname and colour without reloading.
    await expect(
      a.locator('[data-bubble-color="blue"]').filter({
        hasText: "Chào PT, hôm nay tập gì ạ?",
      }),
    ).toBeVisible({ timeout: SYNC_TIMEOUT_MS });
    // The trainee's nickname for the PT is private: the admin title still
    // carries the trainee's real name and never "Coach Hoan".
    await expect(
      a.getByRole("heading", {
        level: 1,
        name: `Nhắn tin với ${E2E_CHAT_NAME}`,
      }),
    ).toBeVisible();
    await expect(a.getByText("Coach Hoan")).toHaveCount(0);
    // The info link is an icon only: named for screen readers, no visible text.
    await expect(a.getByRole("link", { name: INFO_LINK })).toHaveText("");

    // Admin: private nickname for the trainee and the conversation colour. No
    // field to rename yourself.
    await openSettings(a);
    await expect(
      a.getByRole("radiogroup", { name: "Màu cho cuộc trò chuyện này" }),
    ).toBeVisible();
    // The account colour is not here (it lives in the header gear menu).
    await expect(
      a.getByRole("radiogroup", { name: "Màu tài khoản" }),
    ).toHaveCount(0);
    await shoot(a, "admin-settings-sheet");
    await a
      .getByRole("radiogroup", { name: "Màu cho cuộc trò chuyện này" })
      .scrollIntoViewIfNeeded();
    await shoot(a, "admin-settings-sheet-colours");
    await expect(a.locator("#chat-nickname-self")).toHaveCount(0);
    await saveNickname(a, "chat-nickname-other", "Na nhỏ");
    await a
      .getByRole("radiogroup", { name: "Màu cho cuộc trò chuyện này" })
      .getByRole("radio", { name: "Xanh ngọc" })
      .click();
    await closeSettings(a);
    await expect(
      a.getByRole("heading", { level: 1, name: "Nhắn tin với Na nhỏ" }),
    ).toBeVisible();
    await expect(
      a.locator('[data-bubble-color="teal"]').filter({
        hasText: "Chào em, hôm nay tập chân nhé.",
      }),
    ).toBeVisible();

    // The trainee sees the PT in teal, labelled with the trainee's own
    // nickname for the PT side, never the admin's view of themselves.
    await expect(
      t.locator('[data-bubble-color="teal"]').filter({
        hasText: "Chào em, hôm nay tập chân nhé.",
      }),
    ).toBeVisible({ timeout: SYNC_TIMEOUT_MS });
    await expect(t.getByText("Coach Hoan").first()).toBeVisible();
    await expect(t.getByText("Na nhỏ")).toHaveCount(0);
    // Reactions and replies carry the nicknames and colours too.
    const ptText = "Chào em, hôm nay tập chân nhé.";
    const traineeText = "Chào PT, hôm nay tập gì ạ?";

    await bubbleOf(t, ptText).dblclick();
    await replyTo(t, ptText, "Dạ em tập chân ạ");
    await replyTo(a, traineeText, "Nhớ khởi động kỹ nhé");
    await expect(
      bubbleOf(t, "Dạ em tập chân ạ").getByRole("button", { name: QUOTE }),
    ).toContainText("Coach Hoan");
    await expect(
      bubbleOf(a, "Nhớ khởi động kỹ nhé").getByRole("button", { name: QUOTE }),
    ).toContainText("Na nhỏ");
    const heart = a
      .getByRole("log")
      .getByRole("button", { name: /❤️/ })
      .first();

    await expect(heart).toBeVisible({ timeout: SYNC_TIMEOUT_MS });
    await heart.click();
    await expect(
      a.getByRole("dialog").getByRole("listitem").filter({ hasText: "Na nhỏ" }),
    ).toBeVisible();
    await a.keyboard.press("Escape");
    await expect(
      t.getByRole("log").getByRole("button", { name: QUOTE }),
    ).toHaveCount(2, { timeout: SYNC_TIMEOUT_MS });
    await shoot(t, "trainee-thread-custom");
    await shoot(a, "admin-thread-custom");

    // The admin inbox lists the trainee under the admin's nickname.
    await a.goto("/admin/messages");
    const inboxRow = a
      .getByRole("list")
      .getByRole("link")
      .filter({ hasText: "Na nhỏ" });

    await expect(inboxRow).toHaveCount(1);
    await expect(inboxRow).not.toContainText(E2E_CHAT_NAME);
    await expect(
      a.getByRole("link").filter({ hasText: E2E_CHAT_NAME }),
    ).toHaveCount(0);

    // Clearing a nickname goes back to the real name, for that viewer only.
    await openSettings(t);
    await t
      .locator("[data-nickname-target='pt']")
      .getByRole("button", { name: "Xoá biệt danh" })
      .click();
    await closeSettings(t);
    await expect(t.getByRole("heading", { name: "Coach Hoan" })).toHaveCount(0);

    await trainee.context.close();
    await admin.context.close();
  });

  test("a locked chat is read-only except the admin account colour", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const userId = await setChatState(E2E_CHAT_NAME, true);
    const trainee = await newSession(browser);
    const admin = await newSession(browser);
    const t = trainee.page;
    const a = admin.page;

    await t.goto("/");
    await fillTraineeLogin(t, E2E_CHAT_NAME);
    await expect(t).toHaveURL(/\/workouts/);
    await t.goto("/messages/coach");
    await send(t, "Tin cuối trước khi khoá");
    await setLocked(userId);

    await t.reload();
    await openSettings(t);
    // A private nickname changes nobody else's view, so the lock does not
    // apply to it; the colours stay read-only.
    await expect(t.locator("#chat-nickname-other")).toBeEnabled();
    await expect(
      t
        .getByRole("radiogroup", { name: "Màu tin nhắn" })
        .getByRole("radio")
        .first(),
    ).toBeDisabled();
    await shoot(t, "trainee-settings-sheet-locked");

    await logInAsAdmin(a);
    await a.goto(`/admin/users/${userId}/messages`);
    await openSettings(a);
    await expect(a.locator("#chat-nickname-other")).toBeEnabled();
    await expect(
      a
        .getByRole("radiogroup", { name: "Màu cho cuộc trò chuyện này" })
        .getByRole("radio")
        .first(),
    ).toBeDisabled();
    // The account colour works while the chat is locked. Nothing saved yet:
    // the default palette colour is preselected.
    await a.goto("/admin");
    const account = await openAccountColor(a);

    await expect(account.getByRole("radio", { name: "Cam" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(account.getByRole("radio").first()).toBeEnabled();
    await account.getByRole("radio", { name: "Tím" }).click();
    await expect(account.getByRole("radio", { name: "Tím" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // The saved account colour is preselected after a reload.
    await a.reload();
    const reopened = await openAccountColor(a);

    await expect(reopened.getByRole("radio", { name: "Tím" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(reopened.locator('[aria-checked="true"]')).toHaveCount(1);

    await trainee.context.close();
    await admin.context.close();
  });
});
