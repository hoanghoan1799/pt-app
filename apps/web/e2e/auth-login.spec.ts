import { type Browser, expect, type Page, test } from "@playwright/test";

import { GENERATED_PASSWORD_ALPHABET } from "@/constants/password";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import { MEMBER_MESSAGES } from "@/features/members/constants/messages";
import { toEmailKey } from "@/utils/email";

import { restoreTraineeCredentials, withApiDb } from "./api-db";
import { fillTraineeLogin, logOutViaMenu } from "./auth";
import {
  E2E_ADMIN,
  E2E_CHANGER_NAME,
  E2E_EMPTY_NAME,
  E2E_LOCKED_NAME,
  E2E_RESET_NAME,
  E2E_USER_PASSWORD,
  e2eEmail,
} from "./config";
import { answerConfirm } from "./confirm";
import { shot } from "./shots";

// Email + password login test matrix (docs/specs/email-password-login.md,
// KAN-86): create member, duplicate email, generic error, lockout, change and
// admin reset. Every spec that locks an account or changes credentials owns a
// seeded trainee and puts its credentials back first, so the specs do not
// depend on each other or on a rerun (--repeat-each) of the same database.
const PASSWORD_PATTERN = new RegExp(`^[${GENERATED_PASSWORD_ALPHABET}]{12}$`);
const NEW_PASSWORD = "e2e-brand-new-password";

// Back to the seeded state: shared password, no password change, no failures.
// Logins live in the API's PostgreSQL now (see api-db.ts).
const restoreCredentials = restoreTraineeCredentials;

// Ids for /admin/users/<id>, read from the API's PostgreSQL.
const getUserId = (email: string) =>
  withApiDb(async (client) => {
    const result = await client.query(
      "SELECT id FROM users WHERE email_key = $1",
      [toEmailKey(email)],
    );

    return Number(result.rows[0].id);
  });

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

// A browser context with its own cookies, like another device.
const newSession = async (browser: Browser) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });

  return { context, page: await context.newPage() };
};

const logInAs = async (page: Page, name: string, password: string) => {
  await page.goto("/");
  await fillTraineeLogin(page, name, password);
};

test("the admin creates a member and sees the password once; the member logs in with it", async ({
  page,
  browser,
}) => {
  // Unique per run: --repeat-each shares one database.
  const suffix = Date.now().toString(36);
  const name = `E2E Created ${suffix}`;
  const email = `created.${suffix}@e2e.test`;

  await logInAsAdmin(page);
  await page.getByRole("button", { name: "Thêm user" }).click();
  await page.getByLabel("Tên user mới").fill(name);
  await page.getByLabel("Email đăng nhập").fill(email);
  await page.getByRole("button", { name: "Thêm", exact: true }).click();

  const panel = page.getByRole("status").filter({ hasText: email });
  const passwordText = panel.getByTestId("one-time-password");

  await expect(passwordText).toHaveText(PASSWORD_PATTERN);
  await expect(panel).toContainText(name);
  await expect(panel).toContainText(MEMBER_MESSAGES.PASSWORD_ONCE);
  const password = (await passwordText.textContent()) ?? "";

  await shot(page, "01-create-member-password-panel");

  await panel.getByRole("button", { name: "Xong" }).click();
  await expect(passwordText).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByTestId("one-time-password")).toHaveCount(0);
  await expect(page.getByText(password, { exact: false })).toHaveCount(0);

  const trainee = await newSession(browser);

  try {
    await trainee.page.goto("/");
    await trainee.page.getByLabel("Email").fill(email);
    await trainee.page.getByLabel("Mật khẩu").fill(password);
    await trainee.page.getByRole("button", { name: "Vào tập" }).click();
    await expect(trainee.page).toHaveURL(/\/workouts/);
  } finally {
    await trainee.context.close();
  }
});

test("a duplicate email in a different case is refused", async ({ page }) => {
  await logInAsAdmin(page);
  await page.getByRole("button", { name: "Thêm user" }).click();
  await page.getByLabel("Tên user mới").fill("E2E Duplicate Email");
  await page
    .getByLabel("Email đăng nhập")
    .fill(e2eEmail(E2E_EMPTY_NAME).toUpperCase());
  await page.getByRole("button", { name: "Thêm", exact: true }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: MEMBER_MESSAGES.EMAIL_TAKEN }),
  ).toHaveText(MEMBER_MESSAGES.EMAIL_TAKEN);
  await expect(page.getByTestId("one-time-password")).toHaveCount(0);
});

test("a wrong password and an unknown email show the same generic message", async ({
  page,
}) => {
  const error = page.locator("#login-error");

  await page.goto("/");
  await fillTraineeLogin(page, E2E_EMPTY_NAME, "not-the-password");
  await expect(error).toHaveText(AUTH_MESSAGES.EMAIL_LOGIN_WRONG);

  await page.goto("/");
  await page.getByLabel("Email").fill(`nobody.${Date.now()}@e2e.test`);
  await page.getByLabel("Mật khẩu").fill(E2E_USER_PASSWORD);
  await page.getByRole("button", { name: "Vào tập" }).click();
  await expect(error).toHaveText(AUTH_MESSAGES.EMAIL_LOGIN_WRONG);
  await expect(page).toHaveURL(/\/$/);
});

test("5 wrong passwords lock the account, and the correct password is refused while locked", async ({
  page,
}) => {
  await restoreCredentials(E2E_LOCKED_NAME);
  const error = page.locator("#login-error");

  await page.goto("/");

  for (let attempt = 1; attempt <= 5; attempt++) {
    await fillTraineeLogin(page, E2E_LOCKED_NAME, `wrong-password-${attempt}`);
    // The failure that reaches the limit still answers "wrong", not "locked".
    await expect(error).toHaveText(AUTH_MESSAGES.EMAIL_LOGIN_WRONG);
    // Wait for the pending form to settle before the next attempt.
    await expect(page.getByRole("button", { name: "Vào tập" })).toBeEnabled();
  }

  await fillTraineeLogin(page, E2E_LOCKED_NAME, E2E_USER_PASSWORD);
  await expect(error).toHaveText(AUTH_MESSAGES.LOGIN_LOCKED);
  await expect(page).toHaveURL(/\/$/);
  await shot(page, "02-login-locked");

  // Still locked on a fresh page load, so the lock is stored, not in the form.
  await page.goto("/");
  await fillTraineeLogin(page, E2E_LOCKED_NAME, E2E_USER_PASSWORD);
  await expect(error).toHaveText(AUTH_MESSAGES.LOGIN_LOCKED);
  await expect(page).toHaveURL(/\/$/);

  await restoreCredentials(E2E_LOCKED_NAME);
});

test("a trainee changes the password; the old one fails and the new one works", async ({
  page,
  browser,
}) => {
  await restoreCredentials(E2E_CHANGER_NAME);

  await logInAs(page, E2E_CHANGER_NAME, E2E_USER_PASSWORD);
  await expect(page).toHaveURL(/\/workouts/);

  await page.goto("/account/password");
  await page.getByLabel("Mật khẩu hiện tại").fill(E2E_USER_PASSWORD);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();

  // Redirected to the main page with a toast, no inline success message (KAN-123).
  await expect(page).toHaveURL(/\/workouts$/);
  await expect(page.locator("[data-sonner-toast]")).toHaveText(
    AUTH_MESSAGES.PASSWORD_CHANGED_TOAST,
  );
  await expect(
    page.getByText(AUTH_MESSAGES.PASSWORD_CHANGED, { exact: true }),
  ).toHaveCount(0);

  // Still signed in on this device after the change (D6).
  await page.goto("/workouts");
  await expect(page).toHaveURL(/\/workouts/);
  await logOutViaMenu(page);
  await expect(page).toHaveURL(/\/$/);

  const next = await newSession(browser);

  try {
    await logInAs(next.page, E2E_CHANGER_NAME, E2E_USER_PASSWORD);
    await expect(next.page.locator("#login-error")).toHaveText(
      AUTH_MESSAGES.EMAIL_LOGIN_WRONG,
    );
    await expect(next.page).toHaveURL(/\/$/);

    await fillTraineeLogin(next.page, E2E_CHANGER_NAME, NEW_PASSWORD);
    await expect(next.page).toHaveURL(/\/workouts/);
  } finally {
    await next.context.close();
  }

  await restoreCredentials(E2E_CHANGER_NAME);
});

test("change password: wrong current password stays inline; the toggle shows the text", async ({
  page,
}) => {
  await logInAs(page, E2E_CHANGER_NAME, E2E_USER_PASSWORD);
  await expect(page).toHaveURL(/\/workouts/);
  await page.goto("/account/password");

  const current = page.getByLabel("Mật khẩu hiện tại");
  // The div that holds the input and its show/hide button (the Input component
  // adds a wrapper div of its own around the input, so `.last()` is not enough).
  const field = page.locator("div.relative").filter({ has: current });
  const toggle = field.getByRole("button", { name: "Hiện mật khẩu" });

  await expect(current).toHaveAttribute("type", "password");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(current).toHaveAttribute("type", "text");
  await expect(
    field.getByRole("button", { name: "Ẩn mật khẩu" }),
  ).toHaveAttribute("aria-pressed", "true");
  await field.getByRole("button", { name: "Ẩn mật khẩu" }).click();
  await expect(current).toHaveAttribute("type", "password");

  await current.fill("not-the-current-password");
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();

  await expect(page.locator("#currentPassword-error")).toHaveText(
    AUTH_MESSAGES.CURRENT_PASSWORD_WRONG,
  );
  await expect(page).toHaveURL(/\/account\/password$/);
});

test("an admin reset logs the trainee out of their open session; the new password works", async ({
  browser,
}) => {
  await restoreCredentials(E2E_RESET_NAME);
  const userId = await getUserId(e2eEmail(E2E_RESET_NAME));
  const trainee = await newSession(browser);
  const admin = await newSession(browser);

  try {
    await logInAs(trainee.page, E2E_RESET_NAME, E2E_USER_PASSWORD);
    await expect(trainee.page).toHaveURL(/\/workouts/);

    // A session is stale when its login second is before the whole second of
    // the reset (authAt < floor(passwordChangedAt)). Logging in and resetting
    // within the same second would keep the old session alive, so wait out
    // the second first.
    await trainee.page.waitForTimeout(1_200);

    await logInAsAdmin(admin.page);
    await admin.page.goto(`/admin/users/${userId}`);
    await admin.page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
    await answerConfirm(admin.page, "Đặt lại");
    const passwordText = admin.page.getByTestId("one-time-password");

    await expect(passwordText).toHaveText(PASSWORD_PATTERN);
    const newPassword = (await passwordText.textContent()) ?? "";

    // The trainee's next navigation is sent to the login page.
    await trainee.page.goto("/workouts");
    await expect(trainee.page).toHaveURL(/\/$/);
    await expect(trainee.page.getByLabel("Email")).toBeVisible();

    await fillTraineeLogin(trainee.page, E2E_RESET_NAME, E2E_USER_PASSWORD);
    await expect(trainee.page.locator("#login-error")).toHaveText(
      AUTH_MESSAGES.EMAIL_LOGIN_WRONG,
    );

    await fillTraineeLogin(trainee.page, E2E_RESET_NAME, newPassword);
    await expect(trainee.page).toHaveURL(/\/workouts/);
  } finally {
    await trainee.context.close();
    await admin.context.close();
  }

  await restoreCredentials(E2E_RESET_NAME);
});
