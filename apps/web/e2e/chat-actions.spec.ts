import { createClient } from "@libsql/client";
import { type Browser, expect, type Page, test } from "@playwright/test";

import { toEmailKey } from "@/utils/email";

import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_CHAT_NAME, E2E_DB_URL, e2eEmail } from "./config";
import { answerConfirm } from "./confirm";

// Chat message actions (KAN-140, docs/specs/chat-ux-v2.md C1 to C6): double-tap
// heart, the long-press sheet, reactions, reply, edit with history, unsend and
// the locked (read-only) sheet. Two browser contexts, one trainee and one PT,
// each seeing the other's change through polling only. Every test resets the
// rows it touches first and last, so a rerun (--repeat-each) starts clean.
const LONG_PRESS_MS = 600;
const SYNC = { timeout: 20_000 };
const UNSENT = "Tin nhắn đã bị thu hồi";
const QUOTE = "Xem tin nhắn được trả lời";
const UNSEND_TITLE = "Thu hồi tin nhắn này với mọi người?";
const DB_ATTEMPTS = 5;

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

const getUserId = () =>
  withDb(async (client) => {
    const result = await client.execute({
      sql: "SELECT id FROM users WHERE email_key = ?",
      args: [toEmailKey(e2eEmail(E2E_CHAT_NAME))],
    });

    return Number(result.rows[0].id);
  });

// Back to the seeded state: no conversation, chat locked.
const resetChat = async () => {
  const userId = await getUserId();
  const conv = "(SELECT id FROM chat_conversations WHERE user_id = ?)";
  const msgs = `(SELECT id FROM chat_messages WHERE conversation_id IN ${conv})`;

  await withDb(async (client) => {
    for (const sql of [
      `DELETE FROM chat_reactions WHERE message_id IN ${msgs}`,
      `DELETE FROM chat_message_edits WHERE message_id IN ${msgs}`,
      `UPDATE chat_messages SET reply_to_message_id = NULL WHERE conversation_id IN ${conv}`,
      `DELETE FROM chat_messages WHERE conversation_id IN ${conv}`,
      `DELETE FROM chat_reads WHERE conversation_id IN ${conv}`,
      "DELETE FROM chat_conversations WHERE user_id = ?",
    ]) {
      await client.execute({ sql, args: [userId] });
    }
    await client.execute({
      sql: "UPDATE users SET chat_enabled = NULL, chat_enabled_changed_at = NULL, chat_enabled_by_admin_id = NULL WHERE id = ?",
      args: [userId],
    });
  });
};

const newSession = async (browser: Browser) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"],
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

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The bubble whose text is exactly `text`.
const bubble = (page: Page, text: string) =>
  page
    .getByRole("log")
    .locator("[data-bubble]")
    .filter({
      has: page.locator("p", {
        hasText: new RegExp(`^${escapeRegExp(text)}$`),
      }),
    });

// The whole message: bubble plus the reaction chips and the edited label that
// sit under it (the bubble's parent is the row, its grandparent the message).
const entry = (page: Page, text: string) =>
  bubble(page, text).locator("xpath=../..");

const chip = (page: Page, text: string, label: string) =>
  entry(page, text).getByRole("button", { name: label, exact: true });

const sheet = (page: Page) => page.getByRole("dialog");

const longPress = async (page: Page, text: string) => {
  const box = await bubble(page, text).boundingBox();

  if (!box) {
    throw new Error(`No bubble with the text "${text}"`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(LONG_PRESS_MS);
  await page.mouse.up();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByText("Sao chép")).toBeVisible();
};

const closeSheet = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
};

const send = async (page: Page, text: string) => {
  await page.getByLabel("Nội dung tin nhắn").fill(text);
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Đang gửi…")).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(bubble(page, text)).toBeVisible();
};

const unsend = async (page: Page, text: string) => {
  await longPress(page, text);
  await sheet(page)
    .getByRole("button", { name: "Thu hồi", exact: true })
    .click();
  await answerConfirm(page, "Thu hồi", UNSEND_TITLE);
};

interface Scene {
  trainee: Page;
  admin: Page;
  // Sent by the trainee, then by the PT; both are on both screens.
  mine: string;
  theirs: string;
}

// Chat enabled by the PT, one message each way, both threads open.
const withScene = async (
  browser: Browser,
  body: (scene: Scene) => Promise<void>,
  { isLocked = false }: { isLocked?: boolean } = {},
) => {
  test.setTimeout(180_000);
  await resetChat();
  const userId = await getUserId();
  const tag = Date.now().toString(36);
  const mine = `Em tập chân xong rồi ${tag}`;
  const theirs = `Ok, nhớ giãn cơ nhé ${tag}`;
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

    await send(trainee, mine);
    await expect(bubble(admin, mine)).toBeVisible(SYNC);
    await send(admin, theirs);
    await expect(bubble(trainee, theirs)).toBeVisible(SYNC);

    if (isLocked) {
      await setChat(admin, userId, false);
      await admin.goto(`/admin/users/${userId}/messages`);
      await trainee.reload();
    }

    await body({ trainee, admin, mine, theirs });
  } finally {
    await adminSession.context.close();
    await traineeSession.context.close();
    await resetChat();
  }
};

test("double-tap hearts a message, a second double-tap removes it, and the other side sees both after sync", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin, theirs, mine }) => {
    await bubble(trainee, theirs).dblclick();
    await expect(chip(trainee, theirs, "❤️ 1")).toBeVisible();
    await expect(chip(admin, theirs, "❤️ 1")).toBeVisible(SYNC);
    // The heart sits on the PT's own message, not on the trainee's.
    await expect(
      entry(admin, mine).getByRole("button", { name: /❤️/ }),
    ).toHaveCount(0);

    // Double-tap again takes my heart back.
    await bubble(trainee, theirs).dblclick();
    await expect(chip(trainee, theirs, "❤️ 1")).toHaveCount(0);
    await expect(chip(admin, theirs, "❤️ 1")).toHaveCount(0, SYNC);
  });
});

test("long-press opens the sheet, a sheet reaction shows up, and the reactors sheet lists who reacted", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin, mine }) => {
    // The PT hearts the trainee's message, the trainee reacts to it too.
    await bubble(admin, mine).dblclick();
    await expect(chip(trainee, mine, "❤️ 1")).toBeVisible(SYNC);

    await longPress(trainee, mine);
    await expect(sheet(trainee).getByText(/^Gửi lúc /)).toBeVisible();
    await sheet(trainee).getByRole("button", { name: "💪" }).click();
    await expect(sheet(trainee)).toHaveCount(0);
    await expect(chip(trainee, mine, "💪 1")).toBeVisible();
    await expect(chip(trainee, mine, "❤️ 1")).toBeVisible();

    // Reactors sheet on the trainee side: the PT (heart) and "Bạn" (muscle).
    await chip(trainee, mine, "💪 1").click();
    const reactors = sheet(trainee);

    await expect(reactors.getByRole("listitem")).toHaveCount(2);
    await expect(
      reactors.getByRole("listitem").filter({ hasText: "Bạn" }),
    ).toContainText("💪");
    await expect(
      reactors.getByRole("listitem").filter({ hasText: "❤️" }),
    ).not.toContainText("Bạn");
    await closeSheet(trainee);

    // The PT sees both reactions, and "Bạn" now stands for the PT's heart.
    await expect(chip(admin, mine, "💪 1")).toBeVisible(SYNC);
    await chip(admin, mine, "❤️ 1").click();
    await expect(
      sheet(admin).getByRole("listitem").filter({ hasText: "Bạn" }),
    ).toContainText("❤️");
    await expect(
      sheet(admin).getByRole("listitem").filter({ hasText: "💪" }),
    ).not.toContainText("Bạn");
    await closeSheet(admin);

    // Picking another emoji replaces mine: the muscle becomes a thumb.
    await longPress(trainee, mine);
    await expect(
      sheet(trainee).getByRole("button", { name: "💪" }),
    ).toHaveAttribute("aria-pressed", "true");
    await sheet(trainee).getByRole("button", { name: "👍" }).click();
    await expect(chip(trainee, mine, "👍 1")).toBeVisible();
    await expect(chip(trainee, mine, "💪 1")).toHaveCount(0);
    await expect(chip(admin, mine, "👍 1")).toBeVisible(SYNC);
    await expect(chip(admin, mine, "💪 1")).toHaveCount(0);

    // Picking the same emoji again removes it: only the PT's heart is left.
    await longPress(trainee, mine);
    await sheet(trainee).getByRole("button", { name: "👍" }).click();
    await expect(chip(trainee, mine, "👍 1")).toHaveCount(0);
    await expect(chip(admin, mine, "👍 1")).toHaveCount(0, SYNC);
    await expect(chip(admin, mine, "❤️ 1")).toBeVisible();
  });
});

test("reply shows the quote on both sides and tapping it jumps to the original", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin, theirs, mine }) => {
    await longPress(trainee, theirs);
    await sheet(trainee)
      .getByRole("button", { name: "Trả lời", exact: true })
      .click();
    await expect(trainee.getByText(/^Đang trả lời/)).toBeVisible();

    const reply = "Dạ em nhớ rồi ạ";

    await send(trainee, reply);
    await expect(trainee.getByText(/^Đang trả lời/)).toHaveCount(0);
    await expect(
      bubble(trainee, reply).getByRole("button", { name: QUOTE }),
    ).toContainText(theirs);
    await expect(
      bubble(admin, reply).getByRole("button", { name: QUOTE }),
    ).toContainText(theirs, SYNC);

    // Push the original off screen, then tap the quote: it scrolls back and
    // highlights exactly the quoted bubble.
    for (let i = 0; i < 6; i += 1) {
      await send(
        trainee,
        `Tin lấp chỗ ${i} ${Date.now().toString(36)} ${"giãn cơ ".repeat(60)}`.trim(),
      );
    }
    await expect(bubble(trainee, theirs)).not.toBeInViewport();
    await bubble(trainee, reply).getByRole("button", { name: QUOTE }).click();
    await expect(bubble(trainee, theirs)).toBeInViewport();
    await expect(trainee.locator("[data-bubble].ring-2")).toHaveCount(1);
    await expect(bubble(trainee, theirs)).toHaveClass(/(^| )ring-2( |$)/);
    await expect(bubble(trainee, mine)).not.toHaveClass(/(^| )ring-2( |$)/);
  });
});

test("edit shows Đã chỉnh sửa on both sides and both can open the history", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin, mine }) => {
    await longPress(trainee, mine);
    await sheet(trainee).getByRole("button", { name: "Chỉnh sửa" }).click();
    await expect(trainee.getByText("Đang chỉnh sửa")).toBeVisible();
    await expect(trainee.getByLabel("Nội dung tin nhắn")).toHaveValue(mine);

    const edited = `${mine} và đã giãn cơ`;

    await trainee.getByLabel("Nội dung tin nhắn").fill(edited);
    await trainee.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
    await expect(trainee.getByText("Đang chỉnh sửa")).toHaveCount(0);
    await expect(bubble(trainee, edited)).toBeVisible();
    await expect(bubble(trainee, mine)).toHaveCount(0);

    // PT: new text plus the label, the old text is gone from the thread.
    await expect(bubble(admin, edited)).toBeVisible(SYNC);
    await expect(bubble(admin, mine)).toHaveCount(0);
    await expect(
      entry(admin, edited).getByRole("button", { name: "Đã chỉnh sửa" }),
    ).toBeVisible();

    // History lists the previous body, opened from either side.
    for (const page of [admin, trainee]) {
      await entry(page, edited)
        .getByRole("button", { name: "Đã chỉnh sửa" })
        .click();
      await expect(sheet(page)).toBeVisible();
      await expect(sheet(page).getByText(mine, { exact: true })).toBeVisible();
      await closeSheet(page);
    }
  });
});

test("unsend asks to confirm, then both sides see Tin nhắn đã bị thu hồi and the text is gone", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin, mine }) => {
    // Cancel keeps the message.
    await longPress(trainee, mine);
    await sheet(trainee)
      .getByRole("button", { name: "Thu hồi", exact: true })
      .click();
    await answerConfirm(trainee, "Hủy", UNSEND_TITLE);
    await expect(bubble(trainee, mine)).toBeVisible();

    await unsend(trainee, mine);

    for (const [page, timeout] of [
      [trainee, 15_000],
      [admin, SYNC.timeout],
    ] as const) {
      await expect(page.getByText(UNSENT)).toHaveCount(1, { timeout });
      await expect(page.getByText(mine, { exact: true })).toHaveCount(0);
    }
  });
});

test("a reply to an unsent message quotes Tin nhắn đã bị thu hồi", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin, mine }) => {
    const reply = "Câu đầu của em rất tốt";

    await longPress(admin, mine);
    await sheet(admin)
      .getByRole("button", { name: "Trả lời", exact: true })
      .click();
    await send(admin, reply);
    await expect(bubble(trainee, reply)).toBeVisible(SYNC);

    await unsend(trainee, mine);

    await expect(
      bubble(admin, reply).getByRole("button", { name: QUOTE }),
    ).toContainText(UNSENT, SYNC);
    await expect(
      bubble(trainee, reply).getByRole("button", { name: QUOTE }),
    ).toContainText(UNSENT);
  });
});

test("someone else's message offers Copy (which copies it) but not Edit or Thu hồi", async ({
  browser,
}) => {
  await withScene(browser, async ({ trainee, admin, mine, theirs }) => {
    // The trainee on the PT's message.
    await longPress(trainee, theirs);
    await expect(
      sheet(trainee).getByRole("button", { name: "Trả lời", exact: true }),
    ).toBeVisible();
    await expect(
      sheet(trainee).getByRole("button", { name: "Chỉnh sửa" }),
    ).toHaveCount(0);
    await expect(
      sheet(trainee).getByRole("button", { name: "Thu hồi", exact: true }),
    ).toHaveCount(0);
    await closeSheet(trainee);

    // The PT on the trainee's message, then Copy puts the text on the clipboard.
    await longPress(admin, mine);
    await expect(
      sheet(admin).getByRole("button", { name: "Chỉnh sửa" }),
    ).toHaveCount(0);
    await expect(
      sheet(admin).getByRole("button", { name: "Thu hồi", exact: true }),
    ).toHaveCount(0);
    await sheet(admin).getByRole("button", { name: "Sao chép" }).click();
    await expect(admin.getByText("Đã sao chép")).toBeVisible();
    await expect(sheet(admin)).toHaveCount(0);
    expect(await admin.evaluate(() => navigator.clipboard.readText())).toBe(
      mine,
    );
  });
});

test("a locked chat offers only Sao chép, even on my own message", async ({
  browser,
}) => {
  await withScene(
    browser,
    async ({ trainee, admin, mine, theirs }) => {
      await expect(trainee.getByLabel("Nội dung tin nhắn")).toHaveCount(0);

      for (const [page, text] of [
        [trainee, mine],
        [trainee, theirs],
        [admin, mine],
      ] as const) {
        await longPress(page, text);
        await expect(sheet(page).getByRole("button")).toHaveText(["Sao chép"]);
        await expect(sheet(page).getByRole("group")).toHaveCount(0);
        await closeSheet(page);
      }

      // Double-tap does not react while locked.
      await bubble(trainee, theirs).dblclick();
      await expect(chip(trainee, theirs, "❤️ 1")).toHaveCount(0);
    },
    { isLocked: true },
  );
});
