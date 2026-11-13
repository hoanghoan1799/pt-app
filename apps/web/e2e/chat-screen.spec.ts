import { type Browser, expect, type Page, test } from "@playwright/test";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";

import {
  type AdminSeen,
  getAdminsLastSeen,
  prepareThread,
  resetChat as resetChatRows,
  restoreAdminsLastSeen,
  setAdminsLastSeen,
} from "./api-seed-chat";
import { fillTraineeLogin } from "./auth";
import { E2E_CHAT_NAME, E2E_CHAT_OFF_NAME } from "./config";

// The focused trainee conversation screen (KAN-136, docs/specs/chat-ux-v2.md
// B1-B5): tab bar hidden, Back behaviour, the header with its presence dot,
// time breaks after a 30 minute gap, and the read-only thread when chat is
// off. Presence is made deterministic by writing admins.last_seen_at straight
// into the e2e PostgreSQL (no admin page is open). Each spec resets the rows
// it touches first and last, so a rerun (--repeat-each) starts clean.
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// Asia/Ho_Chi_Minh has no daylight saving: a fixed UTC+7.
const VN_OFFSET_MS = 7 * HOUR_MS;

// Back to the seeded state: no conversation, chat never enabled, never seen.
const resetChat = (name: string) => resetChatRows(name, { profile: true });

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

const logInAsTrainee = async (page: Page, name: string) => {
  await page.goto("/");
  await fillTraineeLogin(page, name);
  await expect(page).toHaveURL(/\/workouts/);
};

const getTabBar = (page: Page) =>
  page.getByRole("navigation", { name: "Chuyển mục" });

const getHeader = (page: Page) => page.getByRole("banner");

const getLog = (page: Page) => page.getByRole("log");

// Epoch ms of 10:00 (Asia/Ho_Chi_Minh) three days ago: every message seeded
// within a few hours of it is on the same VN day, so no day separator sits
// between them.
const tenAmThreeDaysAgo = () => {
  const vnMidnight =
    Math.floor((Date.now() + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;

  return vnMidnight - 3 * DAY_MS + 10 * HOUR_MS;
};

const formatVnTime = (ms: number) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));

// The labels of the separators (the <p> items) sitting between two messages
// of the thread, in DOM order. A message is the item holding its text.
const separatorsBetween = (page: Page, first: string, second: string) =>
  getLog(page).evaluate(
    (log, [a, b]) => {
      const items = Array.from(log.children);
      const indexOf = (text: string) =>
        items.findIndex((item) => item.textContent?.includes(text));
      const from = indexOf(a);
      const to = indexOf(b);

      if (from < 0 || to < 0) {
        return null;
      }
      return items
        .slice(from + 1, to)
        .filter((item) => item.tagName === "P")
        .map((item) => item.textContent ?? "");
    },
    [first, second],
  );

test.describe("trainee conversation screen", () => {
  let savedAdminsLastSeen: AdminSeen[] = [];

  test.beforeEach(async () => {
    savedAdminsLastSeen = await getAdminsLastSeen();
  });

  test.afterEach(async () => {
    await resetChat(E2E_CHAT_NAME);
    await resetChat(E2E_CHAT_OFF_NAME);
    await restoreAdminsLastSeen(savedAdminsLastSeen);
  });

  test("the tab bar is gone and Back returns to the page the trainee came from", async ({
    browser,
  }) => {
    await prepareThread(E2E_CHAT_NAME, { enabled: true, messages: [] });
    const trainee = await newSession(browser);

    try {
      await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
      await expect(getTabBar(trainee.page)).toBeVisible();
      await getTabBar(trainee.page)
        .getByRole("link", { name: "Nhắn tin" })
        .click();
      await expect(trainee.page).toHaveURL(/\/messages$/);
      // The Messages tab is the inbox now; the coach chat is its first row.
      await trainee.page.getByRole("link", { name: /Huấn luyện viên/ }).click();
      await expect(trainee.page).toHaveURL(/\/messages\/coach$/);
      await expect(getTabBar(trainee.page)).toHaveCount(0);

      await getHeader(trainee.page)
        .getByRole("button", { name: "Quay lại" })
        .click();
      await expect(trainee.page).toHaveURL(/\/workouts$/);
      await expect(getTabBar(trainee.page)).toBeVisible();
    } finally {
      await trainee.context.close();
    }
  });

  test("Back on a freshly opened /messages (no history) goes to /workouts", async ({
    browser,
  }) => {
    await prepareThread(E2E_CHAT_NAME, { enabled: true, messages: [] });
    const trainee = await newSession(browser);

    try {
      await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
      // A new tab shares the session but has no history of its own.
      const fresh = await trainee.context.newPage();

      await fresh.goto("/messages/coach");
      await expect(fresh).toHaveURL(/\/messages\/coach$/);
      await expect(getTabBar(fresh)).toHaveCount(0);
      // Nothing of this app behind it: a new tab has no same-origin referrer.
      expect(await fresh.evaluate(() => document.referrer)).toBe("");

      await getHeader(fresh).getByRole("button", { name: "Quay lại" }).click();
      await expect(fresh).toHaveURL(/\/workouts$/);
    } finally {
      await trainee.context.close();
    }
  });

  test("an online PT shows the green dot and 'Đang hoạt động' directly under the name", async ({
    browser,
  }) => {
    await prepareThread(E2E_CHAT_NAME, { enabled: true, messages: [] });
    await setAdminsLastSeen(Date.now());
    const trainee = await newSession(browser);

    try {
      await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
      await trainee.page.goto("/messages/coach");
      const header = getHeader(trainee.page);
      const name = header.getByRole("heading", { level: 1 });
      const status = header.getByRole("status", {
        name: /^Trạng thái hoạt động/,
      });
      const dot = status.locator("span[aria-hidden]");

      await expect(status).toHaveAttribute("data-online", "true");
      await expect(status).toHaveText("Đang hoạt động");
      await expect(dot).toHaveCount(1);
      await expect(dot).toHaveClass(/bg-success/);

      // The dot and the status text share one row directly under the name.
      const nameBox = await name.boundingBox();
      const dotBox = await dot.boundingBox();
      const statusBox = await status.boundingBox();

      expect(nameBox).not.toBeNull();
      expect(dotBox).not.toBeNull();
      expect(statusBox).not.toBeNull();
      expect(statusBox!.y).toBeGreaterThanOrEqual(
        nameBox!.y + nameBox!.height - 1,
      );
      expect(dotBox!.y).toBeGreaterThanOrEqual(statusBox!.y - 1);
      expect(dotBox!.y + dotBox!.height).toBeLessThanOrEqual(
        statusBox!.y + statusBox!.height + 1,
      );
    } finally {
      await trainee.context.close();
    }
  });

  test("an idle PT shows 'Hoạt động … trước' and no dot", async ({
    browser,
  }) => {
    await prepareThread(E2E_CHAT_NAME, { enabled: true, messages: [] });
    await setAdminsLastSeen(Date.now() - 5 * MINUTE_MS);
    const trainee = await newSession(browser);

    try {
      await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
      await trainee.page.goto("/messages/coach");
      const header = getHeader(trainee.page);
      const status = header.getByRole("status", {
        name: /^Trạng thái hoạt động/,
      });

      await expect(status).toHaveAttribute("data-online", "false");
      await expect(status).toHaveText("Hoạt động 5 phút trước");
      await expect(status.locator("span[aria-hidden]")).toHaveCount(0);
    } finally {
      await trainee.context.close();
    }
  });

  test("a time separator shows only after a gap over 30 minutes", async ({
    browser,
  }) => {
    const base = tenAmThreeDaysAgo();
    const tag = Date.now().toString(36);
    const body = (label: string) => `Tin ${label} ${tag}`;

    await prepareThread(E2E_CHAT_NAME, {
      enabled: true,
      messages: [
        { body: body("A"), createdAt: base },
        { body: body("B"), createdAt: base + 29 * MINUTE_MS },
        { body: body("C"), createdAt: base + 60 * MINUTE_MS },
      ],
    });
    const trainee = await newSession(browser);

    try {
      await logInAsTrainee(trainee.page, E2E_CHAT_NAME);
      await trainee.page.goto("/messages/coach");
      await expect(getLog(trainee.page).getByText(body("C"))).toBeVisible();

      // 29 minutes apart: no separator of any kind between A and B.
      expect(
        await separatorsBetween(trainee.page, body("A"), body("B")),
      ).toEqual([]);
      // 31 minutes apart: exactly one separator, labelled with C's send time.
      expect(formatVnTime(base + 60 * MINUTE_MS)).toBe("11:00");
      expect(
        await separatorsBetween(trainee.page, body("B"), body("C")),
      ).toEqual(["11:00"]);
    } finally {
      await trainee.context.close();
    }
  });

  test("with chat off the tab stays, old messages show read-only under the locked banner", async ({
    browser,
  }) => {
    const base = tenAmThreeDaysAgo();
    const tag = Date.now().toString(36);
    const older = `Tin cũ một ${tag}`;
    const newer = `Tin cũ hai ${tag}`;

    await prepareThread(E2E_CHAT_OFF_NAME, {
      enabled: false,
      messages: [
        { body: older, createdAt: base },
        { body: newer, createdAt: base + 5 * MINUTE_MS },
      ],
    });
    const trainee = await newSession(browser);

    try {
      await logInAsTrainee(trainee.page, E2E_CHAT_OFF_NAME);
      const tab = getTabBar(trainee.page).getByRole("link", {
        name: "Nhắn tin",
      });

      await expect(tab).toBeVisible();
      await tab.click();
      await expect(trainee.page).toHaveURL(/\/messages$/);
      // The Messages tab is the inbox now; the coach chat is its first row.
      await trainee.page.getByRole("link", { name: /Huấn luyện viên/ }).click();
      await expect(trainee.page).toHaveURL(/\/messages\/coach$/);

      const log = getLog(trainee.page);

      await expect(log.getByText(older, { exact: true })).toBeVisible();
      await expect(log.getByText(newer, { exact: true })).toBeVisible();
      await expect(
        trainee.page.getByRole("status").filter({
          hasText: CHAT_MESSAGES.CHAT_LOCKED,
        }),
      ).toHaveText(CHAT_MESSAGES.CHAT_LOCKED);
      await expect(trainee.page.getByLabel("Nội dung tin nhắn")).toHaveCount(0);
      await expect(
        trainee.page.getByRole("button", { name: "Gửi tin nhắn" }),
      ).toHaveCount(0);
      await expect(
        trainee.page.getByText("PT chưa mở nhắn tin cho bạn", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await trainee.context.close();
    }
  });
});
