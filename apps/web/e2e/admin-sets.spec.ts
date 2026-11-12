import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";

import {
  E2E_ADMIN,
  E2E_DB_URL,
  E2E_EMPTY_NAME,
  E2E_LIFTER_NAME,
} from "./config";
import { answerConfirm } from "./confirm";
import { E2E_NEW_VIDEO_ID, E2E_PT_EXERCISES } from "./seed";

const NEW_LINK = `https://youtu.be/${E2E_NEW_VIDEO_ID}`;

// PT views of the set-logging test matrix (docs/specs/set-logging.md): C1, C3,
// C4, C8, C9, C11 and C13. The specs share one seeded DB and run in order; the
// delete test that really removes an exercise comes last.
const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

// Opens a trainee from the dashboard list and returns the member page path.
const openMember = async (page: Page, name: string) => {
  await page.goto("/admin");
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+/);

  return new URL(page.url()).pathname;
};

const getCard = (page: Page, title: string) =>
  page.locator("article").filter({ hasText: title });

const REACT_KEY_WARNING = /same key|unique "key"/i;

let consoleProblems: string[] = [];

test.beforeEach(async ({ page }) => {
  // Thumbnails come from YouTube; the suite must not depend on the network.
  await page.route(/(ytimg|youtube)\.com/, (route) => route.abort());
  consoleProblems = [];
  page.on("console", (message) => {
    if (REACT_KEY_WARNING.test(message.text())) {
      consoleProblems.push(message.text());
    }
  });
  await logInAsAdmin(page);
});

test.afterEach(() => {
  expect(consoleProblems).toEqual([]);
});

test("C1: the member page lists logged sets read-only, only where sets exist", async ({
  page,
}) => {
  await openMember(page, E2E_LIFTER_NAME);

  const squat = getCard(page, E2E_PT_EXERCISES.SQUAT);

  await expect(squat.getByText("Đã ghi:")).toBeVisible();
  await expect(squat.getByText(/55 kg × 8 · 50 kg × 10/)).toBeVisible();
  await expect(
    getCard(page, E2E_PT_EXERCISES.PRESS).getByText(/Đã ghi:.*30 kg × 10/),
  ).toBeVisible();
  // No edit control for sets (Q13): no inputs, only the PT's own buttons.
  await expect(squat.getByRole("spinbutton")).toHaveCount(0);
  await expect(squat.getByRole("textbox")).toHaveCount(0);
  await expect(squat.getByRole("button", { name: "Lưu" })).toHaveCount(0);

  // An exercise nobody logged shows no "Đã ghi" line.
  await expect(
    getCard(page, E2E_PT_EXERCISES.CURL).getByText("Đã ghi:"),
  ).toHaveCount(0);
});

test("C3: Summary lists the weekly best, the previous best and the kg change", async ({
  page,
}) => {
  const memberPath = await openMember(page, E2E_LIFTER_NAME);

  await page.goto(`${memberPath}/summary`);
  await expect(page.getByRole("heading", { name: "Tiến bộ" })).toBeVisible();

  const squat = page
    .getByRole("listitem")
    .filter({ hasText: E2E_PT_EXERCISES.SQUAT });

  await expect(squat.getByText("+5 kg")).toBeVisible();
  await expect(squat.getByText("Tốt nhất trước đó 50 kg × 10")).toBeVisible();
  await expect(squat.getByText("Tốt nhất tuần này 55 kg × 8")).toBeVisible();

  // First session ever: no previous best to compare with.
  const press = page
    .getByRole("listitem")
    .filter({ hasText: E2E_PT_EXERCISES.PRESS });

  await expect(press.getByText("Lần đầu")).toBeVisible();
  await expect(press.getByText("Tốt nhất trước đó")).toHaveCount(0);
  // No sets, no row.
  await expect(
    page.getByRole("listitem").filter({ hasText: E2E_PT_EXERCISES.CURL }),
  ).toHaveCount(0);
});

test("C4: Summary shows the Vietnamese empty state without logged sets", async ({
  page,
}) => {
  const memberPath = await openMember(page, E2E_EMPTY_NAME);

  await page.goto(`${memberPath}/summary`);
  await expect(page.getByRole("heading", { name: "Tiến bộ" })).toBeVisible();
  await expect(
    page.getByText("Chưa có bài nào được ghi tạ trong tuần này."),
  ).toBeVisible();
  await expect(page.getByText("Lần đầu")).toHaveCount(0);
});

test("C8: a personal best shows in member activity and on the dashboard", async ({
  page,
}) => {
  await openMember(page, E2E_LIFTER_NAME);

  const memberRecord = page
    .getByRole("listitem")
    .filter({ hasText: "Kỷ lục mới:" })
    .filter({ hasText: E2E_PT_EXERCISES.SQUAT });

  await expect(memberRecord).toHaveCount(1);
  await expect(memberRecord).toContainText("55 kg × 8");
  await expect(memberRecord).toContainText("trước đó 50 kg × 10");

  await page.goto("/admin");

  const dashboardRecord = page
    .getByRole("listitem")
    .filter({ hasText: `${E2E_LIFTER_NAME} lập kỷ lục` })
    .filter({ hasText: E2E_PT_EXERCISES.SQUAT });

  await expect(dashboardRecord).toHaveCount(1);
  await expect(dashboardRecord).toContainText("Kỷ lục mới: 55 kg × 8");
  // First-ever weighted set is not a record (D11).
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "lập kỷ lục" })
      .filter({ hasText: E2E_PT_EXERCISES.PRESS }),
  ).toHaveCount(0);
});

test("C11: changing the video link of an exercise with sets asks first, then wipes the sets", async ({
  page,
}) => {
  await openMember(page, E2E_LIFTER_NAME);

  const confirm = page.getByRole("alertdialog");
  const card = getCard(page, E2E_PT_EXERCISES.LINK);
  // A CSS locator: the open sheet hides the page behind it from role queries.
  const oldLink = card.locator("a", { hasText: "Mở trên YouTube" });
  const oldHref = await oldLink.getAttribute("href");

  await expect(card.getByText(/Đã ghi:.*20 kg × 12/)).toBeVisible();

  const submitNewLink = async () => {
    await page.getByLabel(/Link video YouTube/).fill(NEW_LINK);
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  };

  await card.getByRole("button", { name: "Sửa" }).click();

  // Editing only the title never asks and never touches the sets.
  await page.getByLabel(/Tên bài tập/).fill(`${E2E_PT_EXERCISES.LINK} `);
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Đã cập nhật bài tập")).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(card.getByText("Đã ghi:")).toBeVisible();

  // Dismissing the confirm keeps the sets and the old link.
  await card.getByRole("button", { name: "Sửa" }).click();
  await submitNewLink();
  await answerConfirm(
    page,
    "Hủy",
    "Học viên đã ghi số liệu cho bài này. Đổi link video sẽ xóa luôn số liệu và bắt đầu lịch sử mới. Tiếp tục?",
  );
  await expect(card.getByText("Đã ghi:")).toBeVisible();
  await expect(oldLink).toHaveAttribute("href", oldHref ?? "");

  // Accepting removes the sets and shows the new link.
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await answerConfirm(page, "Tiếp tục");
  await expect(card.getByText("Đã ghi:")).toHaveCount(0);
  await expect(oldLink).toHaveAttribute(
    "href",
    new RegExp(`${E2E_NEW_VIDEO_ID}$`),
  );
});

test("C9: deleting an exercise warns about its sets only when it has sets", async ({
  page,
}) => {
  await openMember(page, E2E_LIFTER_NAME);

  // With sets: the confirm says the sets go too; dismissing keeps the exercise.
  await getCard(page, E2E_PT_EXERCISES.SQUAT)
    .getByRole("button", { name: "Xóa", exact: true })
    .click();
  await answerConfirm(page, "Hủy", /xóa luôn số liệu/);
  await expect(getCard(page, E2E_PT_EXERCISES.SQUAT)).toBeVisible();

  // Without sets: the old message, and accepting deletes the exercise.
  await getCard(page, E2E_PT_EXERCISES.TEMP)
    .getByRole("button", { name: "Xóa", exact: true })
    .click();
  await answerConfirm(page, "Xóa", "Xóa bài tập này?");
  await expect(getCard(page, E2E_PT_EXERCISES.TEMP)).toHaveCount(0);
  await expect(getCard(page, E2E_PT_EXERCISES.SQUAT)).toBeVisible();
});

test("C13: deleting an exercise whose sets were logged after the page loaded still warns", async ({
  page,
}) => {
  await openMember(page, E2E_LIFTER_NAME);

  const card = getCard(page, E2E_PT_EXERCISES.STALE);

  // The page was loaded without sets, so the PT sees no "Đã ghi" line.
  await expect(card).toBeVisible();
  await expect(card.getByText("Đã ghi:")).toHaveCount(0);

  // The trainee logs a set after the PT's page loaded.
  const client = createClient({ url: E2E_DB_URL });

  try {
    await client.execute({
      sql: `INSERT INTO exercise_sets (exercise_id, user_id, position, weight_kg, reps)
            SELECT e.id, d.user_id, 0, 25, 10
            FROM exercises e JOIN workout_days d ON d.id = e.day_id
            WHERE e.title = ?`,
      args: [E2E_PT_EXERCISES.STALE],
    });
  } finally {
    client.close();
  }

  // The PT accepts the plain confirm, the server asks again, the PT dismisses.
  await card.getByRole("button", { name: "Xóa", exact: true }).click();
  await answerConfirm(page, "Xóa", "Xóa bài tập này?");
  await answerConfirm(page, "Hủy", /xóa luôn số liệu/);

  // Dismissing the warning keeps the exercise and its sets, and the refreshed
  // page now shows them.
  await expect(card).toBeVisible();
  await expect(card.getByText(/Đã ghi:.*25 kg × 10/)).toBeVisible();

  // The sets are in the database, not just on the refreshed client.
  await page.reload();
  await expect(getCard(page, E2E_PT_EXERCISES.STALE)).toBeVisible();
  await expect(
    getCard(page, E2E_PT_EXERCISES.STALE).getByText(/Đã ghi:.*25 kg × 10/),
  ).toBeVisible();
});
