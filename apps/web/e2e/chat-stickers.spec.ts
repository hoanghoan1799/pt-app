import { crc32, deflateSync } from "node:zlib";

import { type Browser, expect, type Page, test } from "@playwright/test";

import {
  getCustomStickerRows,
  getUserId as getChatUserId,
  resetChat as resetChatRows,
} from "./api-seed-chat";
import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_CHAT_NAME } from "./config";
import { answerConfirm } from "./confirm";

// Chat stickers (KAN-146, docs/specs/chat-ux-v2.md E0 to E3): the bundled pack
// through the sticker panel, the sticker bubble on both sides, reactions,
// reply quote, the long-press sheet without Chỉnh sửa / Sao chép, unsend, the
// hidden GIPHY tab (the e2e env has no GIPHY_API_KEY, and GIPHY is never
// called) and the locked chat. Two browser contexts, one trainee and one PT.
// Every test resets the rows it touches first and last.
const LONG_PRESS_MS = 600;
const SYNC = { timeout: 20_000 };
const UNSENT = "Tin nhắn đã bị thu hồi";
const QUOTE = "Xem tin nhắn được trả lời";

const FIRE = { alt: "Lửa", src: "/stickers/fluent/fire.svg" };
const TROPHY = { alt: "Cúp", src: "/stickers/fluent/trophy.svg" };

const getUserId = () => getChatUserId(E2E_CHAT_NAME);

// Back to the seeded state: no conversation, no personal stickers, chat locked.
const resetChat = () => resetChatRows(E2E_CHAT_NAME, { stickers: true });

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

const lockSwitch = (page: Page) =>
  page.getByRole("switch", { name: "Cho phép nhắn tin" });

const setChat = async (admin: Page, userId: number, isOn: boolean) => {
  await admin.goto(`/admin/users/${userId}/messages`);
  if ((await lockSwitch(admin).getAttribute("aria-checked")) !== String(isOn)) {
    await lockSwitch(admin).click();
  }
  await expect(lockSwitch(admin)).toHaveAttribute("aria-checked", String(isOn));
  await admin.reload();
};

const sheet = (page: Page) => page.getByRole("dialog");
const stickerButton = (page: Page) =>
  page.getByRole("button", { name: "Mở sticker" });

// The sticker bubble showing the image with this alt text.
const sticker = (page: Page, alt: string) =>
  page
    .getByRole("log")
    .locator("[data-bubble][data-sticker]")
    .filter({ has: page.getByRole("img", { name: alt, exact: true }) });

// The whole message: bubble plus the reaction chips under it.
const entry = (page: Page, alt: string) =>
  sticker(page, alt).locator("xpath=../..");

const longPress = async (page: Page, target: ReturnType<typeof sticker>) => {
  const box = await target.boundingBox();

  if (!box) {
    throw new Error("The sticker bubble is not on screen");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(LONG_PRESS_MS);
  await page.mouse.up();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByText(/^Gửi lúc /)).toBeVisible();
};

// Opens the panel, goes to the first group and taps the sticker.
const sendSticker = async (page: Page, alt: string) => {
  await stickerButton(page).click();
  await sheet(page).getByRole("tab", { name: "Tập luyện" }).click();
  await expect(
    sheet(page).getByRole("tab", { name: "Tập luyện" }),
  ).toHaveAttribute("aria-selected", "true");
  await sheet(page).getByRole("button", { name: alt, exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByText("Đang gửi…")).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(sticker(page, alt)).toBeVisible();
};

interface Scene {
  trainee: Page;
  admin: Page;
}

// Chat enabled by the PT, both threads open and empty.
const withScene = async (
  browser: Browser,
  body: (scene: Scene) => Promise<void>,
  { isLocked = false }: { isLocked?: boolean } = {},
) => {
  test.setTimeout(120_000);
  await resetChat();
  const userId = await getUserId();
  const adminSession = await newSession(browser);
  const traineeSession = await newSession(browser);
  const admin = adminSession.page;
  const trainee = traineeSession.page;

  try {
    await admin.goto("/admin/login");
    await admin.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
    await admin.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
    await admin.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(admin).toHaveURL(/\/admin(\?.*)?$/);
    await setChat(admin, userId, true);

    await trainee.goto("/");
    await fillTraineeLogin(trainee, E2E_CHAT_NAME);
    await expect(trainee).toHaveURL(/\/workouts/);
    await trainee.goto("/messages/coach");

    if (isLocked) {
      // A sticker first, so the locked thread has one to long-press.
      await sendSticker(trainee, FIRE.alt);
      await expect(sticker(admin, FIRE.alt)).toBeVisible(SYNC);
      await setChat(admin, userId, false);
      await admin.goto(`/admin/users/${userId}/messages`);
      await trainee.reload();
    }

    await body({ trainee, admin });
  } finally {
    await adminSession.context.close();
    await traineeSession.context.close();
    await resetChat();
  }
};

test("the trainee sends a bundled sticker and the PT sees the image; GIPHY stays hidden without a key", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin }) => {
    await stickerButton(trainee).click();
    await expect(sheet(trainee).getByRole("tab")).toHaveText([
      "Của tôi",
      "Tập luyện",
      "Ăn uống",
      "Cảm xúc",
    ]);
    // Without GIPHY_API_KEY the route says enabled:false; the tab never shows.
    const answer = await trainee.request.get("/api/chat/stickers/giphy?q=");

    expect(await answer.json()).toEqual({ enabled: false, stickers: [] });
    await expect(
      sheet(trainee).getByRole("tab", { name: "GIPHY" }),
    ).toHaveCount(0);
    await expect(sheet(trainee).getByText("Powered by GIPHY")).toHaveCount(0);

    // Another group has its own stickers.
    await sheet(trainee).getByRole("tab", { name: "Ăn uống" }).click();
    await expect(
      sheet(trainee).getByRole("button", { name: "Salad", exact: true }),
    ).toBeVisible();
    await sheet(trainee).getByRole("tab", { name: "Tập luyện" }).click();
    await sheet(trainee)
      .getByRole("button", { name: FIRE.alt, exact: true })
      .click();
    await expect(sheet(trainee)).toHaveCount(0);

    // Both sides show the same image, no bubble text, no bubble background.
    for (const [page, options] of [
      [trainee, undefined],
      [admin, SYNC],
    ] as const) {
      const bubble = sticker(page, FIRE.alt);

      await expect(bubble).toBeVisible(options);
      const image = bubble.getByRole("img", { name: FIRE.alt, exact: true });

      await expect(image).toHaveAttribute("src", FIRE.src);
      await expect(image).toHaveAttribute("alt", FIRE.alt);
      await expect(image).toHaveAttribute("loading", "lazy");
      // The pop animation scales the image for a moment; wait for it to settle.
      await expect
        .poll(async () => (await image.boundingBox())?.width)
        .toBe(120);
      await expect(bubble.locator("p")).toHaveCount(0);
      await expect(bubble).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    // The PT sends one back through the same panel.
    await sendSticker(admin, TROPHY.alt);
    await expect(sticker(trainee, TROPHY.alt).getByRole("img")).toHaveAttribute(
      "src",
      TROPHY.src,
      SYNC,
    );
  });
});

test("a sent sticker is first in Gần đây, newest first, and survives a reload", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee }) => {
    // Nothing sent yet: no Gần đây tab and the panel opens on Tập luyện.
    await stickerButton(trainee).click();
    await expect(
      sheet(trainee).getByRole("tab", { name: "Gần đây" }),
    ).toHaveCount(0);
    await expect(
      sheet(trainee).getByRole("tab", { name: "Tập luyện" }),
    ).toHaveAttribute("aria-selected", "true");
    await trainee.keyboard.press("Escape");
    await expect(sheet(trainee)).toHaveCount(0);

    await sendSticker(trainee, FIRE.alt);
    await sendSticker(trainee, TROPHY.alt);

    // Resend the first one from Gần đây: it moves back to the front.
    await stickerButton(trainee).click();
    await expect(
      sheet(trainee).locator('[data-sticker-grid="recent"] > button').first(),
    ).toHaveAttribute("aria-label", TROPHY.alt);
    await sheet(trainee)
      .locator('[data-sticker-grid="recent"] > button')
      .nth(1)
      .click();
    await expect(sheet(trainee)).toHaveCount(0);
    await expect(sticker(trainee, FIRE.alt)).toHaveCount(2);
    await expect(trainee.getByText("Đang gửi…")).toHaveCount(0, {
      timeout: 60_000,
    });

    await stickerButton(trainee).click();
    const recent = sheet(trainee).getByRole("tab", { name: "Gần đây" });

    await expect(sheet(trainee).getByRole("tab").first()).toHaveText("Gần đây");
    await expect(recent).toHaveAttribute("aria-selected", "true");
    // Newest first, and the repeat moved up instead of duplicating.
    await expect(
      sheet(trainee).locator('[data-sticker-grid="recent"] > button'),
    ).toHaveCount(2);
    const first = sheet(trainee)
      .locator('[data-sticker-grid="recent"] > button')
      .first();

    await expect(first).toHaveAttribute("aria-label", FIRE.alt);
    await expect(first.locator("img")).toHaveAttribute("src", FIRE.src);
    await expect(
      sheet(trainee).locator('[data-sticker-grid="recent"] > button').nth(1),
    ).toHaveAttribute("aria-label", TROPHY.alt);

    // It is remembered across a reload and sends straight from the group.
    await trainee.keyboard.press("Escape");
    await trainee.reload();
    await stickerButton(trainee).click();
    await expect(
      sheet(trainee).locator('[data-sticker-grid="recent"] > button').first(),
    ).toHaveAttribute("aria-label", FIRE.alt);
    await sheet(trainee)
      .locator('[data-sticker-grid="recent"] > button')
      .nth(1)
      .click();
    await expect(sheet(trainee)).toHaveCount(0);
    await expect(sticker(trainee, TROPHY.alt).last()).toBeVisible();
  });
});

test("a sticker takes a reaction and a reply (quoted as Sticker), its sheet has no Chỉnh sửa or Sao chép, and unsend leaves the tombstone", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin }) => {
    await sendSticker(trainee, FIRE.alt);
    await expect(sticker(admin, FIRE.alt)).toBeVisible(SYNC);

    // The PT reacts: the chip shows on both sides.
    await longPress(admin, sticker(admin, FIRE.alt));
    await sheet(admin).getByRole("button", { name: "💪" }).click();
    await expect(
      entry(admin, FIRE.alt).getByRole("button", { name: "💪 1" }),
    ).toBeVisible();
    await expect(
      entry(trainee, FIRE.alt).getByRole("button", { name: "💪 1" }),
    ).toBeVisible(SYNC);

    // The trainee's own sticker: Reply and Thu hồi, but no Edit or Copy.
    await longPress(trainee, sticker(trainee, FIRE.alt));
    await expect(sheet(trainee).getByRole("button")).toContainText([
      "❤️",
      "😂",
      "😮",
      "😢",
      "💪",
      "👍",
      "Trả lời",
      "Thu hồi",
    ]);
    await expect(
      sheet(trainee).getByRole("button", { name: "Chỉnh sửa" }),
    ).toHaveCount(0);
    await expect(
      sheet(trainee).getByRole("button", { name: "Sao chép" }),
    ).toHaveCount(0);
    await sheet(trainee).getByRole("button", { name: "Trả lời" }).click();

    // The reply bar says Sticker; the sent reply quotes "Sticker" on both sides.
    await expect(trainee.getByText(/^Đang trả lời/)).toBeVisible();
    await expect(trainee.getByText("Sticker", { exact: true })).toBeVisible();
    const reply = `Cảm ơn PT ${Date.now().toString(36)}`;

    await trainee.getByLabel("Nội dung tin nhắn").fill(reply);
    await trainee.getByRole("button", { name: "Gửi tin nhắn" }).click();
    await expect(trainee.getByText("Đang gửi…")).toHaveCount(0, {
      timeout: 60_000,
    });
    for (const [page, options] of [
      [trainee, undefined],
      [admin, SYNC],
    ] as const) {
      await expect(
        page
          .getByRole("log")
          .getByRole("button", { name: QUOTE })
          .filter({ hasText: "Sticker" }),
      ).toBeVisible(options);
    }

    // The PT's view of the same sticker: the sheet of someone else's sticker
    // has no Edit, Copy or Thu hồi either.
    await longPress(admin, sticker(admin, FIRE.alt));
    await expect(
      sheet(admin).getByRole("button", { name: "Thu hồi" }),
    ).toHaveCount(0);
    await expect(
      sheet(admin).getByRole("button", { name: "Sao chép" }),
    ).toHaveCount(0);
    await admin.keyboard.press("Escape");
    await expect(sheet(admin)).toHaveCount(0);

    // Unsend: both sides show the tombstone, the image and the reaction go.
    await longPress(trainee, sticker(trainee, FIRE.alt));
    await sheet(trainee).getByRole("button", { name: "Thu hồi" }).click();
    await answerConfirm(
      trainee,
      "Thu hồi",
      "Thu hồi tin nhắn này với mọi người?",
    );
    for (const [page, options] of [
      [trainee, undefined],
      [admin, SYNC],
    ] as const) {
      await expect(page.getByRole("log").getByRole("img")).toHaveCount(
        0,
        options,
      );
      await expect(
        page.getByRole("log").locator("[data-bubble] > p", { hasText: UNSENT }),
      ).toHaveCount(1);
      await expect(page.getByRole("button", { name: "💪 1" })).toHaveCount(0);
      // The reply that quoted it shows the tombstone instead of "Sticker".
      await expect(
        page
          .getByRole("log")
          .getByRole("button", { name: QUOTE })
          .filter({ hasText: UNSENT }),
      ).toBeVisible();
    }
  });
});

test("a locked chat has no sticker button, and a sticker offers no actions", async ({
  browser,
}) => {
  await withScene(
    browser,
    async ({ trainee, admin }) => {
      await expect(trainee.getByLabel("Nội dung tin nhắn")).toHaveCount(0);
      await expect(admin.getByLabel("Nội dung tin nhắn")).toHaveCount(0);
      await expect(stickerButton(trainee)).toHaveCount(0);
      await expect(stickerButton(admin)).toHaveCount(0);
      await expect(sticker(trainee, FIRE.alt)).toBeVisible();

      // Read-only: a sticker has nothing to copy, so the long-press opens
      // no sheet at all.
      const box = await sticker(trainee, FIRE.alt).boundingBox();

      if (!box) {
        throw new Error("The sticker bubble is not on screen");
      }
      await trainee.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await trainee.mouse.down();
      await trainee.waitForTimeout(LONG_PRESS_MS);
      await trainee.mouse.up();
      await expect(sheet(trainee)).toHaveCount(0);
    },
    { isLocked: true },
  );
});

// KAN-158: personal stickers. A real PNG built in memory (no fixture file):
// a gradient the browser can decode, resize and re-encode.
const makePng = (width: number, height: number) => {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    const checksum = Buffer.alloc(4);

    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 3 + 1);

    for (let x = 0; x < width; x += 1) {
      rows[start + 1 + x * 3] = (x * 255) / width;
      rows[start + 2 + x * 3] = (y * 255) / height;
      rows[start + 3 + x * 3] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const MINE_ALT = "Sticker của tôi";
const MAX_STICKER_BYTES = 150 * 1024;
const ownTiles = (page: Page) => sheet(page).locator("[data-custom-sticker]");

const openMine = async (page: Page) => {
  await stickerButton(page).click();
  await sheet(page).getByRole("tab", { name: "Của tôi" }).click();
  await expect(
    sheet(page).getByRole("tab", { name: "Của tôi" }),
  ).toHaveAttribute("aria-selected", "true");
};

const addPhoto = async (page: Page, buffer: Buffer, name = "photo.png") => {
  await sheet(page)
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: "image/png", buffer });
};

test("a trainee turns a photo into a personal sticker, sends it and the PT sees it", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin }) => {
    await openMine(trainee);
    // After Gần đây (none yet) and before the bundled groups.
    await expect(sheet(trainee).getByRole("tab")).toHaveText([
      "Của tôi",
      "Tập luyện",
      "Ăn uống",
      "Cảm xúc",
    ]);
    await expect(sheet(trainee).getByText("0/100 sticker")).toBeVisible();
    await expect(sheet(trainee).locator('input[type="file"]')).toHaveAttribute(
      "accept",
      "image/*",
    );

    // A 1200x800 photo: far larger than the 512 px sticker box.
    await addPhoto(trainee, makePng(1200, 800));
    await expect(ownTiles(trainee)).toHaveCount(1);
    await expect(sheet(trainee).getByText("1/100 sticker")).toBeVisible();

    // The stored image is a small, re-encoded WebP/PNG, served from our route.
    const src = await ownTiles(trainee).locator("img").getAttribute("src");

    expect(src).toMatch(/^\/api\/chat\/stickers\/custom\/\d+$/);
    const image = await trainee.request.get(src ?? "");
    const bytes = await image.body();

    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toMatch(/^image\/(webp|png)$/);
    expect(image.headers()["cache-control"]).toContain("private");
    expect(bytes.length).toBeLessThanOrEqual(MAX_STICKER_BYTES);
    expect(bytes.length).toBeGreaterThan(0);

    await ownTiles(trainee).first().click();
    await expect(sheet(trainee)).toHaveCount(0);
    await expect(trainee.getByText("Đang gửi…")).toHaveCount(0, {
      timeout: 60_000,
    });

    // Both sides show the picture; the bubble holds only the image.
    for (const [page, options] of [
      [trainee, undefined],
      [admin, SYNC],
    ] as const) {
      const bubble = sticker(page, MINE_ALT);

      await expect(bubble).toBeVisible(options);
      const picture = bubble.getByRole("img", { name: MINE_ALT, exact: true });

      await expect(picture).toHaveAttribute("src", src ?? "");
      await expect
        .poll(() =>
          picture.evaluate((node) => (node as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      await expect(bubble.locator("p")).toHaveCount(0);
    }
    // The stored message carries the route URL, never a data URL.
    const rows = await getCustomStickerRows();

    expect(rows).toHaveLength(1);
    expect(String(rows[0].sticker_url)).toBe(src);
    expect(String(rows[0].sticker_ref)).toBe(`custom:${src?.split("/").pop()}`);

    // The PT can load it (other side of the conversation) ...
    expect((await admin.request.get(src ?? "")).status()).toBe(200);
    // ... a visitor without a session cannot.
    const stranger = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
    });

    try {
      expect((await stranger.request.get(src ?? "")).status()).toBe(401);
    } finally {
      await stranger.close();
    }
  });
});

test("the PT adds their own sticker and the trainee sees it; removing one keeps sent bubbles", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin }) => {
    await openMine(admin);
    await addPhoto(admin, makePng(300, 900));
    await expect(ownTiles(admin)).toHaveCount(1);
    // The trainee's set is separate from the PT's.
    await openMine(trainee);
    await expect(ownTiles(trainee)).toHaveCount(0);
    await trainee.keyboard.press("Escape");

    await ownTiles(admin).first().click();
    await expect(sticker(trainee, MINE_ALT)).toBeVisible(SYNC);
    await expect(sticker(trainee, MINE_ALT).getByRole("img")).toHaveJSProperty(
      "complete",
      true,
    );

    // Edit mode: delete badges; the sent bubble keeps its picture.
    await openMine(admin);
    await sheet(admin).getByRole("button", { name: "Sửa" }).click();
    await sheet(admin).getByRole("button", { name: "Xoá sticker này" }).click();
    await expect(ownTiles(admin)).toHaveCount(0);
    await expect(sheet(admin).getByText("0/100 sticker")).toBeVisible();
    await admin.keyboard.press("Escape");
    await trainee.reload();
    await expect(sticker(trainee, MINE_ALT).getByRole("img")).toHaveJSProperty(
      "complete",
      true,
    );
    await expect
      .poll(() =>
        sticker(trainee, MINE_ALT)
          .getByRole("img")
          .evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  });
});

test("a long press shows the delete badge, and a file that is not an image is refused in Vietnamese", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee }) => {
    await openMine(trainee);
    await addPhoto(trainee, Buffer.from("this is not an image"), "notes.png");
    await expect(
      sheet(trainee)
        .getByRole("alert")
        .filter({ hasText: "Không đọc được ảnh" }),
    ).toBeVisible();
    await expect(ownTiles(trainee)).toHaveCount(0);

    await addPhoto(trainee, makePng(80, 80));
    await expect(ownTiles(trainee)).toHaveCount(1);
    await expect(sheet(trainee).getByRole("alert")).toHaveCount(0);

    const box = await ownTiles(trainee).first().boundingBox();

    if (!box) {
      throw new Error("The sticker tile is not on screen");
    }
    await trainee.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await trainee.mouse.down();
    await trainee.waitForTimeout(LONG_PRESS_MS);
    await trainee.mouse.up();
    // The long press only reveals the badge; it does not send.
    await expect(
      sheet(trainee).getByRole("button", { name: "Xoá sticker này" }),
    ).toBeVisible();
    await expect(sticker(trainee, MINE_ALT)).toHaveCount(0);
    await sheet(trainee).getByRole("button", { name: "Xong" }).click();
    await expect(
      sheet(trainee).getByRole("button", { name: "Xoá sticker này" }),
    ).toHaveCount(0);
  });
});

test("the 101st personal sticker is refused with a Vietnamese message", async ({
  browser,
}) => {
  // 100 sequential uploads take longer than the default 30 s.
  test.setTimeout(120_000);
  await withScene(browser, async ({ trainee }) => {
    const png = makePng(16, 16);
    const post = () =>
      trainee.request.post("/api/chat/stickers/custom", {
        data: png,
        headers: { "Content-Type": "image/png" },
      });

    for (let count = 0; count < 100; count += 1) {
      expect((await post()).status()).toBe(201);
    }
    const refused = await post();

    expect(refused.status()).toBe(409);
    expect((await refused.json()).message).toContain("tối đa 100 sticker");

    await openMine(trainee);
    await expect(ownTiles(trainee)).toHaveCount(100);
    await expect(sheet(trainee).getByText("100/100 sticker")).toBeVisible();
    await expect(
      sheet(trainee).getByRole("button", { name: "Thêm ảnh" }),
    ).toBeDisabled();

    // Bytes that are not WebP or PNG are refused before the limit applies.
    expect(
      (
        await trainee.request.post("/api/chat/stickers/custom", {
          data: Buffer.from("GIF89a....................."),
          headers: { "Content-Type": "image/png" },
        })
      ).status(),
    ).toBe(400);
  });
});
