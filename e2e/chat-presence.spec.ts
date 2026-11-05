import { createClient } from "@libsql/client";
import { type Browser, expect, type Page, test } from "@playwright/test";

import { toEmailKey } from "@/utils/email";

import { fillTraineeLogin } from "./auth";
import {
  E2E_ADMIN,
  E2E_CHAT_NAME,
  E2E_CHAT_OFF_NAME,
  E2E_DB_URL,
  e2eEmail,
} from "./config";

// Chat presence (KAN-130, docs/specs/chat-presence.md): online status and
// last seen on the trainee thread, the admin thread and the admin inbox.
// "Offline" is made deterministic by writing last_seen_at straight into the
// e2e SQLite file while the peer has no page open. Each spec resets the rows
// it touches first and last, so a rerun (--repeat-each) starts clean.
const DB_ATTEMPTS = 5;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
// The server skips a beat when the stored one is under 60 s old (one write a
// minute), so a beat from an earlier spec can be up to 60 s old and still be
// the newest one. Online means under 120 s; 90 s leaves room for both.
const FRESH_MS = 90_000;

const withDb = async <T>(
  run: (client: ReturnType<typeof createClient>) => Promise<T>,
) => {
  for (let attempt = 1; ; attempt += 1) {
    const client = createClient({ url: E2E_DB_URL });

    try {
      await client.execute("PRAGMA busy_timeout = 5000");
      return await run(client);
    } catch (error) {
      if (attempt >= DB_ATTEMPTS || !String(error).includes("SQLITE_BUSY")) {
        throw error;
      }
    } finally {
      client.close();
    }
  }
};

const getUserId = (name: string) =>
  withDb(async (client) => {
    const result = await client.execute({
      sql: "SELECT id FROM users WHERE email_key = ?",
      args: [toEmailKey(e2eEmail(name))],
    });

    return Number(result.rows[0].id);
  });

// last_seen_at is a `timestamp` column: whole seconds.
const setUserLastSeen = (name: string, atMs: number | null) =>
  withDb((client) =>
    client.execute({
      sql: "UPDATE users SET last_seen_at = ? WHERE email_key = ?",
      args: [
        atMs === null ? null : Math.floor(atMs / 1000),
        toEmailKey(e2eEmail(name)),
      ],
    }),
  );

const getLastSeenMs = (table: "users" | "admins", where: string, arg: string) =>
  withDb(async (client) => {
    const result = await client.execute({
      sql: `SELECT last_seen_at AS seen FROM ${table} WHERE ${where} = ?`,
      args: [arg],
    });
    const seen = result.rows[0]?.seen;

    return seen === null || seen === undefined ? null : Number(seen) * 1000;
  });

// Chat enabled with an empty conversation (the inbox lists it), presence unknown.
const prepareChatTrainee = (name: string) =>
  withDb(async (client) => {
    const userId = await getUserId(name);

    await client.execute({
      sql: "DELETE FROM chat_conversations WHERE user_id = ?",
      args: [userId],
    });
    await client.execute({
      sql: "UPDATE users SET chat_enabled = 1, last_seen_at = NULL WHERE id = ?",
      args: [userId],
    });
    await client.execute({
      sql: "INSERT INTO chat_conversations (user_id) VALUES (?)",
      args: [userId],
    });

    return userId;
  });

// Back to the seeded state (chat locked, no conversation, never seen).
const resetChatTrainee = (name: string) =>
  withDb(async (client) => {
    const userId = await getUserId(name);

    await client.execute({
      sql: "DELETE FROM chat_conversations WHERE user_id = ?",
      args: [userId],
    });
    await client.execute({
      sql: "UPDATE users SET chat_enabled = NULL, chat_enabled_changed_at = NULL, chat_enabled_by_admin_id = NULL, last_seen_at = NULL WHERE id = ?",
      args: [userId],
    });
  });

const newSession = async (browser: Browser) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
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

const logInAsTrainee = async (page: Page, name: string) => {
  await page.goto("/");
  await fillTraineeLogin(page, name);
  await expect(page).toHaveURL(/\/workouts/);
};

// The page's own heartbeat is what makes someone online: wait for it to land.
// The next beat is a minute away, so when the first one was lost (a parallel
// worker holding the SQLite write lock answers 500 SQLITE_BUSY), send the
// same beat again from the page's session instead of waiting for the timer.
const expectFresh = (
  page: Page,
  path: string,
  read: () => Promise<number | null>,
) =>
  expect
    .poll(async () => {
      const seen = await read();
      const isFresh = seen !== null && Date.now() - seen < FRESH_MS;

      if (!isFresh) {
        await page.request.post(path);
      }
      return isFresh;
    })
    .toBe(true);

const getStatus = (page: Page) =>
  page.getByRole("status", { name: /^Trạng thái hoạt động/ });

const getInboxRow = (page: Page, name: string) =>
  page.getByRole("link").filter({ hasText: name });

test("the heartbeat endpoint answers 401 without a session", async ({
  request,
}) => {
  for (const path of ["/api/presence", "/api/presence?as=admin"]) {
    const response = await request.post(path, { maxRedirects: 0 });

    expect(response.status(), path).toBe(401);
    expect(response.headers()["cache-control"], path).toBe("no-store");
    expect(await response.json(), path).toEqual({ error: "unauthorized" });
  }
});

test("the trainee sees the PT side online while an admin has the app open", async ({
  browser,
}) => {
  await prepareChatTrainee(E2E_CHAT_NAME);
  const admin = await newSession(browser);
  const trainee = await newSession(browser);

  try {
    await logInAsAdmin(admin.page);
    await admin.page.goto("/admin/messages");
    await expectFresh(admin.page, "/api/presence?as=admin", () =>
      getLastSeenMs("admins", "username", E2E_ADMIN.username),
    );

    await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
    await trainee.page.goto("/messages");
    const status = getStatus(trainee.page);

    await expect(status).toHaveAttribute("data-online", "true");
    await expect(status).toHaveAccessibleName(
      "Trạng thái hoạt động: Đang hoạt động",
    );
    await expect(status).toHaveText("Đang hoạt động");
  } finally {
    await admin.context.close();
    await trainee.context.close();
    await resetChatTrainee(E2E_CHAT_NAME);
  }
});

test("the admin thread shows the trainee's last seen when the trainee is idle", async ({
  browser,
}) => {
  const userId = await prepareChatTrainee(E2E_CHAT_OFF_NAME);
  const admin = await newSession(browser);

  try {
    // No trainee page is open, so nothing refreshes this row.
    await setUserLastSeen(E2E_CHAT_OFF_NAME, Date.now() - FIVE_MINUTES_MS);
    await logInAsAdmin(admin.page);
    await admin.page.goto(`/admin/users/${userId}/messages`);
    const status = getStatus(admin.page);

    await expect(status).toHaveAttribute("data-online", "false");
    await expect(status).toHaveText("Hoạt động 5 phút trước");
    await expect(status).toHaveAccessibleName(
      "Trạng thái hoạt động: Hoạt động 5 phút trước",
    );

    // The admin's own heartbeat stamps the admin row, never the trainee's.
    await admin.page.waitForTimeout(1500);
    expect(
      await getLastSeenMs(
        "users",
        "email_key",
        toEmailKey(e2eEmail(E2E_CHAT_OFF_NAME)),
      ),
    ).toBeLessThan(Date.now() - FIVE_MINUTES_MS + 60_000);
    await expect(status).toHaveText("Hoạt động 5 phút trước");
  } finally {
    await admin.context.close();
    await resetChatTrainee(E2E_CHAT_OFF_NAME);
  }
});

test("the admin inbox shows a green dot for an online trainee and short last-seen text for an idle one", async ({
  browser,
}) => {
  await prepareChatTrainee(E2E_CHAT_NAME);
  await prepareChatTrainee(E2E_CHAT_OFF_NAME);
  const admin = await newSession(browser);
  const trainee = await newSession(browser);

  try {
    await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
    await expectFresh(trainee.page, "/api/presence", () =>
      getLastSeenMs("users", "email_key", toEmailKey(e2eEmail(E2E_CHAT_NAME))),
    );
    await setUserLastSeen(E2E_CHAT_OFF_NAME, Date.now() - FIVE_MINUTES_MS);

    await logInAsAdmin(admin.page);
    await admin.page.goto("/admin/messages");
    const online = getInboxRow(admin.page, E2E_CHAT_NAME);
    const idle = getInboxRow(admin.page, E2E_CHAT_OFF_NAME);

    await expect(online).toHaveCount(1);
    await expect(
      online.getByRole("img", { name: "Đang hoạt động" }),
    ).toHaveCount(1);
    await expect(online.getByText("trước")).toHaveCount(0);

    await expect(idle).toHaveCount(1);
    await expect(idle.getByText("5 phút trước", { exact: true })).toBeVisible();
    await expect(idle.getByRole("img", { name: "Đang hoạt động" })).toHaveCount(
      0,
    );
  } finally {
    await admin.context.close();
    await trainee.context.close();
    await resetChatTrainee(E2E_CHAT_NAME);
    await resetChatTrainee(E2E_CHAT_OFF_NAME);
  }
});
