import { createClient } from "@libsql/client";
import { type Browser, expect, type Page, test } from "@playwright/test";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { toEmailKey } from "@/utils/email";

import { fillTraineeLogin } from "./auth";
import {
  E2E_ADMIN,
  E2E_CHAT_NAME,
  E2E_CHAT_OFF_NAME,
  E2E_DB_URL,
  e2eEmail,
} from "./config";
import { shot } from "./shots";

// Realtime chat phase 1 test matrix (docs/specs/realtime-chat.md section 14,
// KAN-102), on the polling transport (there is no Ably key in e2e). Every spec
// owns a seeded trainee and wipes its chat rows and permission first, so the
// specs do not depend on each other or on a rerun (--repeat-each).
const DB_ATTEMPTS = 5;
const SEND_TIMEOUT_MS = 60_000;

const withDb = async <T>(
  run: (client: ReturnType<typeof createClient>) => Promise<T>,
) => {
  // The app server writes to the same file while the spec polls it, so a
  // busy database is retried instead of failing the spec.
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

// Back to the seeded state: no conversation, no messages, chat never enabled.
const resetChat = (name: string) =>
  withDb(async (client) => {
    const userId = await getUserId(name);
    const conversations = `(SELECT id FROM chat_conversations WHERE user_id = ?)`;

    await client.execute({
      sql: `DELETE FROM chat_messages WHERE conversation_id IN ${conversations}`,
      args: [userId],
    });
    await client.execute({
      sql: `DELETE FROM chat_reads WHERE conversation_id IN ${conversations}`,
      args: [userId],
    });
    await client.execute({
      sql: "DELETE FROM chat_conversations WHERE user_id = ?",
      args: [userId],
    });
    await client.execute({
      sql: "UPDATE users SET chat_enabled = NULL, chat_enabled_changed_at = NULL, chat_enabled_by_admin_id = NULL WHERE id = ?",
      args: [userId],
    });
  });

const countMessages = (name: string) =>
  withDb(async (client) => {
    const result = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ?)",
      args: [await getUserId(name)],
    });

    return Number(result.rows[0].n);
  });

// The read cursor is saved after a short debounce: wait for it before leaving
// the thread, or the unread count would still include the message.
const getReadCursor = (name: string, readerKeyPrefix: string) =>
  withDb(async (client) => {
    const result = await client.execute({
      sql: "SELECT last_read_message_id AS id FROM chat_reads WHERE reader_key LIKE ? AND conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ?)",
      args: [`${readerKeyPrefix}%`, await getUserId(name)],
    });

    return result.rows.length === 0 ? 0 : Number(result.rows[0].id);
  });

const getNewestMessageId = (name: string, senderRole: "user" | "admin") =>
  withDb(async (client) => {
    const result = await client.execute({
      sql: "SELECT MAX(id) AS id FROM chat_messages WHERE sender_role = ? AND conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ?)",
      args: [senderRole, await getUserId(name)],
    });

    return Number(result.rows[0].id);
  });

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

type NewSessionOptions = { keepInstallBanner?: boolean; userAgent?: string };

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// A browser context with its own cookies, like another device.
const newSession = async (
  browser: Browser,
  { keepInstallBanner = false, userAgent }: NewSessionOptions = {},
) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    ...(userAgent ? { userAgent, hasTouch: true } : {}),
  });

  if (keepInstallBanner) {
    return { context, page: await context.newPage() };
  }

  // The install banner has its own specs (pwa.spec.ts), so it is dismissed
  // here like a trainee would; the banner spec below keeps it.
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

const logInAsTrainee = async (page: Page, name: string) => {
  await page.goto("/");
  await fillTraineeLogin(page, name);
  await expect(page).toHaveURL(/\/workouts/);
};

const getTabBar = (page: Page) =>
  page.getByRole("navigation", { name: "Chuyển mục" });

const getChatSwitch = (page: Page) =>
  page.getByRole("switch", { name: "Cho phép nhắn tin" });

const getComposer = (page: Page) => page.getByLabel("Nội dung tin nhắn");

const sendFromComposer = async (page: Page, text: string) => {
  await getComposer(page).fill(text);
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  // The bubble shows at once (optimistic) but the server action is still in
  // flight; leaving the page now would drop it. Under a cold `next dev` (CI)
  // the first call compiles the action, so wait longer than the default.
  await expect(page.getByText("Đang gửi…")).toHaveCount(0, {
    timeout: SEND_TIMEOUT_MS,
  });
};

// Opens the member's chat page as the admin and flips the lock switch.
const setChatSwitch = async (page: Page, userId: number, enabled: boolean) => {
  await page.goto(`/admin/users/${userId}/messages`);
  const lock = getChatSwitch(page);

  await expect(lock).toHaveAttribute("aria-checked", String(!enabled));
  await lock.click();
  await expect(lock).toHaveAttribute("aria-checked", String(enabled));
  // The page refreshes after the action; the lock state survives a reload.
  await page.reload();
  await expect(getChatSwitch(page)).toHaveAttribute(
    "aria-checked",
    String(enabled),
  );
};

test("chat API routes answer 401 with a JSON body without a session", async ({
  request,
}) => {
  for (const path of ["/api/chat/messages", "/api/chat/unread"]) {
    const response = await request.get(path, { maxRedirects: 0 });

    expect(response.status(), path).toBe(401);
    expect(response.headers()["content-type"], path).toContain(
      "application/json",
    );
    expect(await response.json(), path).toEqual({ error: "unauthorized" });
  }

  const adminResponse = await request.get("/api/admin/chat/1/messages", {
    maxRedirects: 0,
  });

  expect(adminResponse.status()).toBe(401);
  expect(await adminResponse.json()).toEqual({ error: "unauthorized" });
});

test("a trainee who was never enabled has no chat tab and /messages sends them to the workouts", async ({
  browser,
}) => {
  await resetChat(E2E_CHAT_OFF_NAME);
  const trainee = await newSession(browser);

  try {
    await logInAsTrainee(trainee.page, E2E_CHAT_OFF_NAME);
    await expect(getTabBar(trainee.page).getByRole("link")).toHaveCount(3);
    await expect(
      getTabBar(trainee.page).getByRole("link", { name: "Nhắn tin" }),
    ).toHaveCount(0);

    await trainee.page.goto("/messages");
    await expect(trainee.page).toHaveURL(/\/workouts$/);
    await expect(getComposer(trainee.page)).toHaveCount(0);
  } finally {
    await trainee.context.close();
  }
});

test("enable, message, reply, unread badges and the PT name work end to end", async ({
  page: admin,
  browser,
}) => {
  await resetChat(E2E_CHAT_NAME);
  const userId = await getUserId(E2E_CHAT_NAME);
  const question = `Câu hỏi e2e ${Date.now().toString(36)}`;
  const reply = `Trả lời e2e ${Date.now().toString(36)}`;
  const trainee = await newSession(browser);

  try {
    await logInAsAdmin(admin);
    await setChatSwitch(admin, userId, true);
    await shot(admin, "chat-01-admin-enabled-empty", { fullPage: true });

    // The trainee now has the tab and can send.
    await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
    await expect(getTabBar(trainee.page).getByRole("link")).toHaveCount(4);
    await getTabBar(trainee.page)
      .getByRole("link", { name: "Nhắn tin" })
      .click();
    await expect(trainee.page).toHaveURL(/\/messages$/);
    await expect(
      trainee.page.getByRole("heading", { name: "PT của bạn" }),
    ).toBeVisible();
    await sendFromComposer(trainee.page, question);
    const traineeLog = trainee.page.getByRole("log");

    await expect(traineeLog.getByText(question, { exact: true })).toBeVisible();
    await shot(trainee.page, "chat-02-trainee-sent");
    await expect.poll(() => countMessages(E2E_CHAT_NAME)).toBe(1);

    // Admin inbox: the exact text and one unread for this trainee only.
    await admin.goto("/admin/messages");
    const row = admin.getByRole("link").filter({ hasText: E2E_CHAT_NAME });

    await expect(row).toHaveCount(1);
    await expect(row).toContainText(question);
    await expect(row.getByRole("status")).toHaveAccessibleName(
      "1 tin nhắn chưa đọc",
    );
    await expect(row.getByRole("status")).toHaveText("1");
    await shot(admin, "chat-03-admin-inbox-unread");

    // Admin dashboard tile and header badge.
    await admin.goto("/admin");
    await expect(
      admin.getByRole("link", { name: "Tin nhắn chưa đọc" }),
    ).toContainText("1");
    await expect(
      admin
        .getByRole("link", { name: "Tin nhắn", exact: true })
        .getByRole("status"),
    ).toHaveText("1");

    // Opening the thread and replying.
    await admin.goto(`/admin/users/${userId}/messages`);
    const adminLog = admin.getByRole("log");

    await expect(adminLog.getByText(question, { exact: true })).toBeVisible();
    await sendFromComposer(admin, reply);
    await expect(adminLog.getByText(reply, { exact: true })).toBeVisible();

    // Reading the thread clears the admin unread count.
    await expect
      .poll(() => getReadCursor(E2E_CHAT_NAME, "admin:"))
      .toBe(await getNewestMessageId(E2E_CHAT_NAME, "user"));
    await admin.goto("/admin/messages");
    await expect(
      admin.getByRole("link").filter({ hasText: E2E_CHAT_NAME }),
    ).toContainText(reply);
    await expect(
      admin
        .getByRole("link")
        .filter({ hasText: E2E_CHAT_NAME })
        .getByRole("status"),
    ).toHaveCount(0);

    // Trainee on another page: the tab badge shows the one unread reply.
    await trainee.page.goto("/workouts");
    await expect(
      getTabBar(trainee.page).getByRole("status", {
        name: "1 tin nhắn chưa đọc",
      }),
    ).toHaveText("1");
    await shot(trainee.page, "chat-04-trainee-tab-badge");

    // Opening the thread shows the reply, the PT name, and clears the badge.
    await trainee.page.goto("/messages");
    await expect(
      trainee.page.getByRole("log").getByText(reply, { exact: true }),
    ).toBeVisible();
    await expect(
      trainee.page.getByRole("heading", { name: E2E_ADMIN.username }),
    ).toBeVisible();
    await shot(trainee.page, "chat-05-trainee-reply");

    await expect
      .poll(async () => getReadCursor(E2E_CHAT_NAME, "user"))
      .toBe(await getNewestMessageId(E2E_CHAT_NAME, "admin"));
    await trainee.page.goto("/workouts");
    await expect(getTabBar(trainee.page)).toBeVisible();
    await expect(
      getTabBar(trainee.page).getByRole("link", { name: "Nhắn tin" }),
    ).toBeVisible();
    await expect(getTabBar(trainee.page).getByRole("status")).toHaveCount(0);
    await expect.poll(() => countMessages(E2E_CHAT_NAME)).toBe(2);
  } finally {
    await trainee.context.close();
  }
});

test("locking chat shows the banner, keeps history, refuses sends and unlocking restores the composer", async ({
  page: admin,
  browser,
}) => {
  await resetChat(E2E_CHAT_NAME);
  const userId = await getUserId(E2E_CHAT_NAME);
  const history = `Lịch sử e2e ${Date.now().toString(36)}`;
  const blocked = `Bị chặn e2e ${Date.now().toString(36)}`;
  const trainee = await newSession(browser);

  try {
    await logInAsAdmin(admin);
    await setChatSwitch(admin, userId, true);
    await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
    await trainee.page.goto("/messages");
    await sendFromComposer(trainee.page, history);
    await expect(
      trainee.page.getByRole("log").getByText(history, { exact: true }),
    ).toBeVisible();
    await expect.poll(() => countMessages(E2E_CHAT_NAME)).toBe(1);

    // Keep the open page from learning about the lock through its poll, so
    // its composer is stale and the send really reaches the server action.
    await trainee.page.route("**/api/chat/messages**", (route) =>
      route.abort(),
    );
    await setChatSwitch(admin, userId, false);
    await expect(getComposer(trainee.page)).toBeVisible();
    await sendFromComposer(trainee.page, blocked);
    await expect(
      trainee.page
        .getByRole("alert")
        .filter({ hasText: CHAT_MESSAGES.CHAT_LOCKED }),
    ).toHaveText(CHAT_MESSAGES.CHAT_LOCKED);
    await expect.poll(() => countMessages(E2E_CHAT_NAME)).toBe(1);
    await trainee.page.unroute("**/api/chat/messages**");

    // A fresh load: banner, no composer, history still readable.
    await trainee.page.reload();
    await expect(
      trainee.page.getByRole("status").filter({
        hasText: CHAT_MESSAGES.CHAT_LOCKED,
      }),
    ).toHaveText(CHAT_MESSAGES.CHAT_LOCKED);
    await expect(getComposer(trainee.page)).toHaveCount(0);
    await expect(
      trainee.page.getByRole("log").getByText(history, { exact: true }),
    ).toBeVisible();
    await expect(trainee.page.getByRole("log").getByText(blocked)).toHaveCount(
      0,
    );
    await shot(trainee.page, "chat-06-trainee-locked");

    // The admin side shows the lock too and cannot write.
    await admin.reload();
    await expect(
      admin.getByRole("status").filter({
        hasText: CHAT_MESSAGES.ADMIN_CHAT_LOCKED,
      }),
    ).toHaveText(CHAT_MESSAGES.ADMIN_CHAT_LOCKED);
    await expect(getComposer(admin)).toHaveCount(0);

    // Unlock: the composer is back and sending works again.
    await setChatSwitch(admin, userId, true);
    await trainee.page.reload();
    await expect(getComposer(trainee.page)).toBeVisible();
    await expect(trainee.page.getByText(CHAT_MESSAGES.CHAT_LOCKED)).toHaveCount(
      0,
    );
    await sendFromComposer(trainee.page, blocked);
    await expect(
      trainee.page.getByRole("log").getByText(blocked, { exact: true }),
    ).toBeVisible();
    await expect.poll(() => countMessages(E2E_CHAT_NAME)).toBe(2);
  } finally {
    await trainee.context.close();
  }
});

test("the service worker never caches /api/chat responses", async ({
  page: admin,
  browser,
}) => {
  await resetChat(E2E_CHAT_NAME);
  const userId = await getUserId(E2E_CHAT_NAME);
  const trainee = await newSession(browser);

  try {
    await logInAsAdmin(admin);
    await setChatSwitch(admin, userId, true);
    await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
    await trainee.page.goto("/messages");
    await trainee.page.evaluate(() => navigator.serviceWorker.ready);
    // A worker that activated after this page loaded controls it on reload.
    if (
      await trainee.page.evaluate(
        () => navigator.serviceWorker.controller === null,
      )
    ) {
      await trainee.page.reload();
    }
    await trainee.page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );

    const online = await trainee.page.evaluate(async () => {
      const response = await fetch("/api/chat/unread");

      return { status: response.status, body: await response.json() };
    });

    expect(online).toEqual({
      status: 200,
      body: { count: 0, chatEnabled: true, hasHistory: false },
    });

    // Offline, the same fetch must fail: nothing answers from a cache.
    await trainee.context.route("**/*", (route) =>
      route.abort("internetdisconnected"),
    );
    try {
      const outcome = await trainee.page.evaluate(async () => {
        try {
          await fetch("/api/chat/unread");
          await fetch("/api/chat/messages");
          return "served";
        } catch {
          return "failed";
        }
      });

      expect(outcome).toBe("failed");
    } finally {
      await trainee.context.unroute("**/*");
    }

    const cachedChatUrls = await trainee.page.evaluate(async () => {
      const urls: string[] = [];

      for (const name of await caches.keys()) {
        const cache = await caches.open(name);

        for (const request of await cache.keys()) {
          urls.push(new URL(request.url).pathname);
        }
      }
      return urls.filter((path) => path.startsWith("/api/chat"));
    });

    expect(cachedChatUrls).toEqual([]);
  } finally {
    await trainee.context.close();
  }
});

test("the install banner stays off the chat page so it never covers the composer", async ({
  page: admin,
  browser,
}) => {
  await resetChat(E2E_CHAT_NAME);
  const userId = await getUserId(E2E_CHAT_NAME);
  const text = `Banner e2e ${Date.now().toString(36)}`;
  const trainee = await newSession(browser, {
    keepInstallBanner: true,
    userAgent: IPHONE_SAFARI,
  });
  const banner = trainee.page.getByRole("region", { name: "Cài ứng dụng" });

  try {
    await logInAsAdmin(admin);
    await setChatSwitch(admin, userId, true);
    await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
    // Shown on the other tabs, as before.
    await expect(banner).toBeVisible();

    await getTabBar(trainee.page)
      .getByRole("link", { name: "Nhắn tin" })
      .click();
    await expect(trainee.page).toHaveURL(/\/messages$/);
    await expect(banner).toHaveCount(0);
    // A real tap (no force) reaches the send button.
    await sendFromComposer(trainee.page, text);
    await expect(
      trainee.page.getByRole("log").getByText(text, { exact: true }),
    ).toBeVisible();
    await expect.poll(() => countMessages(E2E_CHAT_NAME)).toBe(1);
    await shot(trainee.page, "chat-07-no-install-banner");

    // Not dismissed: it comes back on the next tab.
    await getTabBar(trainee.page)
      .getByRole("link", { name: "Lịch tập" })
      .click();
    await expect(banner).toBeVisible();
  } finally {
    await trainee.context.close();
  }
});
