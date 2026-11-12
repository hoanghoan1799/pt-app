import { deflateSync } from "node:zlib";

import { type Browser, expect, type Page, test } from "@playwright/test";

import { withApiDb } from "./api-db";
import { prepareChatTrainee, resetChat } from "./api-seed-chat";
import { clearAvatarsViaApi } from "./api-seed-users";
import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_CHAT_NAME } from "./config";

// Profile photos (KAN-157): upload in the settings sheet, then the other side
// sees it in the conversation header. The spec owns E2E_CHAT_NAME's chat rows.
const resetState = async (enabled: boolean) => {
  await clearAvatarsViaApi(E2E_CHAT_NAME);
  // Chat on with an empty conversation, or back to the seeded (off) state.
  return enabled
    ? prepareChatTrainee(E2E_CHAT_NAME)
    : resetChat(E2E_CHAT_NAME);
};

// A solid-colour 40x20 PNG built in memory: wide, so the square crop matters.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;

  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
const crc32 = (bytes: Buffer) => {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const makePng = (width: number, height: number) => {
  const header = Buffer.alloc(13);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [230, 90, 40]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

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

const uploadAvatar = async (page: Page, gearName: string) => {
  await page.getByRole("button", { name: gearName }).click();
  const field = page.locator("[data-avatar-field]");

  await expect(field).toBeVisible();
  await field.locator('input[type="file"]').setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: makePng(40, 20),
  });
  // The preview shows before saving.
  await expect(field.locator("[data-avatar-image]")).toHaveAttribute(
    "src",
    /^data:image\/(webp|jpeg);base64,/,
  );
  await field.getByRole("button", { name: "Lưu ảnh" }).click();
  await expect(field.locator("[data-avatar-image]")).toHaveAttribute(
    "src",
    /^\/api\/avatar\/(user|admin)\/\d+\?v=\d+$/,
  );
  await expect(field.getByRole("button", { name: "Xoá ảnh" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-chat-settings]")).toHaveCount(0);
};

test.describe("avatars", () => {
  test.afterAll(async () => {
    await resetState(false);
  });

  test("a trainee's uploaded photo shows in the admin header, inbox and, once removed, falls back to initials", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const userId = await resetState(true);
    const trainee = await newSession(browser);
    const admin = await newSession(browser);
    const t = trainee.page;
    const a = admin.page;

    try {
      await t.goto("/");
      await fillTraineeLogin(t, E2E_CHAT_NAME);
      await expect(t).toHaveURL(/\/workouts/);
      await t.goto("/messages/coach");
      await uploadAvatar(t, "Cài đặt cuộc trò chuyện");

      await logInAsAdmin(a);
      await a.goto(`/admin/users/${userId}/messages`);
      const image = a.locator("header [data-avatar-image]");

      await expect(image).toHaveCount(1);
      await expect(image).toHaveAttribute(
        "src",
        new RegExp(`^/api/avatar/user/${userId}\\?v=\\d+$`),
      );
      // The route really serves a decodable square image.
      await expect
        .poll(() =>
          image.evaluate((node) => {
            const img = node as HTMLImageElement;

            return img.complete && img.naturalWidth === img.naturalHeight
              ? img.naturalWidth
              : 0;
          }),
        )
        .toBe(256);

      // The payloads stay small: the thread poll carries URLs, not images.
      const poll = await a.request.get(
        `/api/admin/chat/${await conversationId(userId)}/messages`,
      );

      expect(await poll.text()).not.toContain("data:image");

      await a.goto("/admin/messages");
      await expect(
        a
          .getByRole("link")
          .filter({ hasText: E2E_CHAT_NAME })
          .locator("[data-avatar-image]"),
      ).toHaveCount(1);

      // Remove it: the header is back to initials only.
      await t.getByRole("button", { name: "Cài đặt cuộc trò chuyện" }).click();
      await t
        .locator("[data-avatar-field]")
        .getByRole("button", { name: "Xoá ảnh" })
        .click();
      await expect(
        t.locator("[data-avatar-field] [data-avatar-image]"),
      ).toHaveCount(0);
      await a.goto(`/admin/users/${userId}/messages`);
      await expect(a.locator("header [data-avatar-image]")).toHaveCount(0);
      await expect(a.locator("header [data-avatar]")).toBeVisible();
    } finally {
      await trainee.context.close();
      await admin.context.close();
    }
  });

  test("an admin's uploaded photo shows in the trainee header", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const userId = await resetState(true);
    const trainee = await newSession(browser);
    const admin = await newSession(browser);
    const t = trainee.page;
    const a = admin.page;

    try {
      await logInAsAdmin(a);
      await a.goto(`/admin/users/${userId}/messages`);
      await uploadAvatar(a, "Biệt danh và màu");
      await a.getByLabel("Nội dung tin nhắn").fill("Chào em");
      await a.getByRole("button", { name: "Gửi tin nhắn" }).click();
      await expect(a.getByText("Đang gửi…")).toHaveCount(0);

      await t.goto("/");
      await fillTraineeLogin(t, E2E_CHAT_NAME);
      await expect(t).toHaveURL(/\/workouts/);
      await t.goto("/messages/coach");
      await expect(t.getByText("Chào em")).toBeVisible();
      await expect(t.locator("header [data-avatar-image]")).toHaveAttribute(
        "src",
        /^\/api\/avatar\/admin\/\d+\?v=\d+$/,
      );
      // The same photo sits beside the PT's bubble.
      await expect(
        t.getByRole("log").locator("[data-avatar-image]"),
      ).toHaveCount(1);
    } finally {
      await trainee.context.close();
      await admin.context.close();
    }
  });

  test("a trainee cannot read another trainee's photo", async ({ browser }) => {
    const userId = await resetState(true);
    const trainee = await newSession(browser);

    try {
      await trainee.page.goto("/");
      await fillTraineeLogin(trainee.page, E2E_CHAT_NAME);
      await expect(trainee.page).toHaveURL(/\/workouts/);
      const others = await trainee.page.request.get(
        `/api/avatar/user/${userId + 1000}`,
      );

      expect(others.status()).toBe(404);
      const anonymous = await (
        await browser.newContext({ baseURL: test.info().project.use.baseURL })
      ).request.get(`/api/avatar/user/${userId}`, { maxRedirects: 0 });

      expect(anonymous.status()).toBe(401);
    } finally {
      await trainee.context.close();
    }
  });
});

const conversationId = (userId: number) =>
  withApiDb(async (client) => {
    const result = await client.query(
      "SELECT id FROM chat_conversations WHERE user_id = $1",
      [userId],
    );

    return Number(result.rows[0].id);
  });
