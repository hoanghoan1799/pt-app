import { type Browser, expect, type Page, test } from "@playwright/test";
import { RESTRICTION_MESSAGES } from "@pt/contracts";

import { countMessages, prepareChatTrainee } from "./api-seed-chat";
import {
  blockTraineeViaApi,
  createPtViaApi,
  createTraineeViaApi,
} from "./api-seed-users";
import { fillTraineeLogin, logInAsAdmin } from "./auth";

// Super admin blocks a trainee (company/main docs/specs/admin-block-user.md,
// ported to the API): restrict from the trainee page, the trainee sees the
// banner and cannot send a chat message, lift, the trainee sends again; a
// suspended trainee cannot sign in; a PT has no block control. Every test
// creates its own trainee, so a rerun starts clean.
const SEND_TIMEOUT_MS = 60_000;

const REASON = "Gửi nội dung không phù hợp";

const uniqueName = (prefix: string) =>
  `E2E ${prefix} ${Date.now().toString(36)}`;

const newSession = async (browser: Browser) => {
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

const getComposer = (page: Page) => page.getByLabel("Nội dung tin nhắn");

const sendFromComposer = async (page: Page, text: string) => {
  await getComposer(page).fill(text);
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Đang gửi…")).toHaveCount(0, {
    timeout: SEND_TIMEOUT_MS,
  });
};

const openTraineePage = async (admin: Page, userId: number, name: string) => {
  await admin.goto(`/admin/users/${userId}`);
  await expect(admin.getByRole("heading", { name })).toBeVisible();
};

const getBanner = (page: Page) =>
  page
    .getByRole("status")
    .filter({ hasText: "Tài khoản của bạn đang bị hạn chế" });

// A trainee with chat on, signed in on their own browser context.
const signInTrainee = async (browser: Browser, name: string) => {
  const trainee = await newSession(browser);

  await trainee.page.goto("/");
  await fillTraineeLogin(trainee.page, name);
  await expect(trainee.page).toHaveURL(/\/workouts/);
  return trainee;
};

test("a super admin restricts a trainee: badge, banner and a refused chat send", async ({
  page: admin,
  browser,
}) => {
  const name = uniqueName("Restricted");
  const userId = await createTraineeViaApi(name);

  await prepareChatTrainee(name);
  await logInAsAdmin(admin);
  await openTraineePage(admin, userId, name);

  // "Chặn" -> the sheet -> level, duration, reason -> save.
  await admin.getByRole("button", { name: "Chặn", exact: true }).click();
  const sheet = admin.getByRole("dialog", { name: "Chặn học viên" });

  await expect(sheet).toBeVisible();
  await sheet.getByRole("radio", { name: /^Hạn chế/ }).check();
  await sheet.getByRole("radio", { name: "7 ngày" }).check();
  await sheet.getByLabel("Lý do").fill(REASON);
  await sheet.getByRole("button", { name: "Chặn", exact: true }).click();
  await expect(admin.getByText("Đã chặn học viên")).toBeVisible();
  await expect(sheet).toHaveCount(0);

  // The trainee page shows the status with "Gỡ chặn" and "Đổi mức chặn".
  await expect(admin.getByText("Đang bị hạn chế")).toBeVisible();
  await expect(admin.getByText(`Lý do: ${REASON}`)).toBeVisible();
  await expect(admin.getByRole("button", { name: "Gỡ chặn" })).toBeVisible();
  await expect(
    admin.getByRole("button", { name: "Đổi mức chặn" }),
  ).toBeVisible();

  // The list badge on the dashboard.
  await admin.goto("/admin");
  await expect(
    admin.getByRole("link", { name: new RegExp(name) }).getByText("Bị hạn chế"),
  ).toBeVisible();

  // The trainee still signs in and sees the banner with the reason.
  const trainee = await signInTrainee(browser, name);

  try {
    await expect(getBanner(trainee.page)).toBeVisible();
    await expect(getBanner(trainee.page)).toContainText(`Lý do: ${REASON}`);

    // Chat: the API refuses the send with the restricted text, nothing stored.
    await trainee.page.goto("/messages/coach");
    await expect(getBanner(trainee.page)).toBeVisible();
    await sendFromComposer(trainee.page, `Bị chặn ${Date.now().toString(36)}`);
    await expect(
      trainee.page
        .getByRole("alert")
        .filter({ hasText: RESTRICTION_MESSAGES.RESTRICTED }),
    ).toBeVisible();
    await expect.poll(() => countMessages(name)).toBe(0);
  } finally {
    await trainee.context.close();
  }
});

test("lifting the block removes the banner and the trainee can send again", async ({
  page: admin,
  browser,
}) => {
  const name = uniqueName("Lifted");
  const userId = await createTraineeViaApi(name);
  const text = `Sau khi gỡ ${Date.now().toString(36)}`;

  await prepareChatTrainee(name);
  await blockTraineeViaApi(userId, {
    level: "restricted",
    duration: "24h",
    reason: REASON,
  });
  const trainee = await signInTrainee(browser, name);

  try {
    await trainee.page.goto("/messages/coach");
    await expect(getBanner(trainee.page)).toBeVisible();

    await logInAsAdmin(admin);
    await openTraineePage(admin, userId, name);
    await admin.getByRole("button", { name: "Gỡ chặn" }).click();
    await expect(admin.getByText("Đã gỡ chặn")).toBeVisible();
    await expect(
      admin.getByRole("button", { name: "Chặn", exact: true }),
    ).toBeVisible();
    await expect(admin.getByText("Đang bị hạn chế")).toHaveCount(0);

    await trainee.page.reload();
    await expect(getComposer(trainee.page)).toBeVisible();
    await expect(getBanner(trainee.page)).toHaveCount(0);
    await sendFromComposer(trainee.page, text);
    await expect(
      trainee.page.getByRole("log").getByText(text, { exact: true }),
    ).toBeVisible();
    await expect.poll(() => countMessages(name)).toBe(1);
  } finally {
    await trainee.context.close();
  }
});

test("a suspended trainee's login shows the suspension with the reason", async ({
  page,
}) => {
  const name = uniqueName("Suspended");
  const userId = await createTraineeViaApi(name);

  await blockTraineeViaApi(userId, {
    level: "suspended",
    duration: "7d",
    reason: REASON,
  });

  await page.goto("/");
  await fillTraineeLogin(page, name);
  await expect(
    page.getByText(
      new RegExp(`^Tài khoản của bạn đã bị khoá đến .+\\. Lý do: ${REASON}$`),
    ),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/\/workouts/);

  // A wrong password never reveals the suspension.
  await fillTraineeLogin(page, name, "not-the-password");
  await expect(page.getByText("Sai email hoặc mật khẩu")).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);
});

test("a PT sees no block control on their trainee's page", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const pt = {
    username: `e2e-block-pt-${suffix}`,
    password: "e2e-only-pt-password",
  };
  const ptId = await createPtViaApi(pt.username, pt.password);
  const name = uniqueName("Pt Trainee");
  const userId = await createTraineeViaApi(name, { ptAdminId: ptId });

  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(pt.username);
  await page.getByLabel("Mật khẩu").fill(pt.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);

  await openTraineePage(page, userId, name);
  // The other tools are there, the block control is not.
  await expect(page.getByRole("button", { name: "Xóa user" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chặn", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gỡ chặn" })).toHaveCount(0);
});
