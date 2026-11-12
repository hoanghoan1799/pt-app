import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { fillTraineeLogin, logInAsAdmin, logOutViaMenu } from "./auth";
import { E2E_API_URL, E2E_BASE_URL, E2E_USER_NAME } from "./config";

// The web session is an opaque API token in an httpOnly cookie. These specs
// cover what that means in the browser: the cookie, logout revoking the token on
// the API, a stale cookie, and the admin passcode lock (state kept by the API).
const ADMIN_PASSCODE = "4821";

const sessionCookie = async (context: BrowserContext, name: string) =>
  (await context.cookies(E2E_BASE_URL)).find((cookie) => cookie.name === name);

const apiStatus = async (token: string, path = "/v1/auth/me") =>
  (
    await fetch(`${E2E_API_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).status;

const apiAdmin = (token: string) => ({
  put: (path: string, body: object) =>
    fetch(`${E2E_API_URL}${path}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  post: (path: string, body?: object) =>
    fetch(`${E2E_API_URL}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  del: (path: string, body: object) =>
    fetch(`${E2E_API_URL}${path}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
});

const typePasscode = async (page: Page, code: string) => {
  for (const digit of code) {
    await page.keyboard.press(digit);
  }
};

test("the trainee cookie is an httpOnly opaque API token and logout revokes it", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_USER_NAME);
  await expect(page).toHaveURL(/\/workouts/);

  const cookie = await sessionCookie(context, "pt_user");

  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  // Not a JWT (three dot-separated parts); the API knows what it means.
  expect(cookie?.value.split(".")).toHaveLength(1);
  // About 400 days.
  expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(
    399 * 24 * 3600,
  );
  // Never readable from page scripts.
  expect(await page.evaluate(() => document.cookie)).not.toContain("pt_user");

  const token = cookie?.value ?? "";

  expect(await apiStatus(token)).toBe(200);

  await logOutViaMenu(page);
  await expect(page).toHaveURL(/\/$/);
  expect(await sessionCookie(context, "pt_user")).toBeUndefined();
  // The token itself is dead on the API, not only forgotten by the browser.
  expect(await apiStatus(token)).toBe(401);
});

test("a stale or foreign session cookie sends the visitor to the login page and is cleared", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "pt_user",
      value: "not-a-session-token",
      url: E2E_BASE_URL,
      httpOnly: true,
    },
  ]);

  await page.goto("/workouts");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await sessionCookie(context, "pt_user")).toBeUndefined();
});

test("a trainee session cannot open the admin area", async ({ page }) => {
  await page.goto("/");
  await fillTraineeLogin(page, E2E_USER_NAME);
  await expect(page).toHaveURL(/\/workouts/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/workouts/);
});

test("admin login sets a 7 day cookie; logout revokes the token", async ({
  page,
  context,
}) => {
  await logInAsAdmin(page);

  const cookie = await sessionCookie(context, "pt_admin");

  expect(cookie?.httpOnly).toBe(true);
  expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeLessThan(
    7 * 24 * 3600 + 60,
  );
  const token = cookie?.value ?? "";

  expect(await apiStatus(token)).toBe(200);

  await logOutViaMenu(page);
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(await apiStatus(token)).toBe(401);
});

test("an admin with a passcode is sent to the lock screen and unlocks with the code", async ({
  page,
  context,
}) => {
  await logInAsAdmin(page);
  const token = (await sessionCookie(context, "pt_admin"))?.value ?? "";
  const api = apiAdmin(token);

  try {
    expect(
      (await api.put("/v1/admins/me/passcode", { passcode: ADMIN_PASSCODE }))
        .status,
    ).toBe(200);
    expect((await api.post("/v1/admins/me/passcode/lock")).status).toBe(200);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/lock/);

    // A wrong code stays on the lock screen.
    await typePasscode(page, "0000");
    await expect(
      page.getByRole("alert").filter({ hasText: "Sai mã khoá" }),
    ).toHaveText("Sai mã khoá. Còn 4 lần.");
    await expect(page).toHaveURL(/\/admin\/lock/);

    await typePasscode(page, ADMIN_PASSCODE);
    await expect(page).toHaveURL(/\/admin(\?.*)?$/);
  } finally {
    // Leave the shared admin without a passcode for the other specs.
    await api.del("/v1/admins/me/passcode", {
      currentPasscode: ADMIN_PASSCODE,
    });
  }
});
