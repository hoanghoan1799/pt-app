import { expect, type Page, test } from "@playwright/test";

import {
  acceptTermsApi,
  commentApi,
  createPostApi,
  createSocialTrainee,
  loginAsAdminApi,
  makeFriendsApi,
  reactApi,
  reportApi,
  type SocialPerson,
} from "./api-seed-social";
import { fillTraineeLogin, logInAsAdmin } from "./auth";

// The social area through the real stack: web -> API -> PostgreSQL. Data is
// made through the API (api-seed-social.ts); the UI is what the person uses.

test.describe.configure({ mode: "serial" });

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let ann: SocialPerson;
let ben: SocialPerson;
let adminToken: string;
let apiPostId: number;

const logIn = async (page: Page, person: SocialPerson) => {
  await page.goto("/");
  await fillTraineeLogin(page, person.name);
  await expect(page).toHaveURL(/\/workouts/);
};

test.beforeAll(async () => {
  adminToken = await loginAsAdminApi();
  ann = await createSocialTrainee(adminToken, "E2E Social Ann");
  ben = await createSocialTrainee(adminToken, "E2E Social Ben");
  await acceptTermsApi(ben.token);
});

test("the terms gate the feed, then a post with a photo shows up", async ({
  page,
}) => {
  await logIn(page, ann);
  await page.goto("/feed");
  await expect(
    page.getByText("Hãy đọc và đồng ý điều khoản để dùng Bảng tin."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đồng ý" }).click();

  const caption = page.getByRole("textbox", { name: "Nội dung bài viết" });

  await expect(caption).toBeVisible();
  await caption.fill("Bài đầu tiên của Ann");
  await page.locator('input[type="file"]').setInputFiles({
    name: "dot.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByAltText("Ảnh sẽ đăng")).toBeVisible();
  await page.getByRole("button", { name: "Đăng", exact: true }).click();

  const post = page.getByRole("article").filter({ hasText: "Bài đầu tiên" });

  await expect(post).toBeVisible();
  // The photo is streamed from the API through the web's own route.
  const photo = post.getByRole("img", { name: /Ảnh/ }).first();

  await expect(photo).toHaveAttribute("src", /\/api\/social\/photos\/\d+/);
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});

test("a reaction and a comment reach the author's notifications, read once", async ({
  page,
}) => {
  await makeFriendsApi(ann, ben);
  apiPostId = await createPostApi(ann.token, "Bài để Ben tương tác");
  await reactApi(ben.token, apiPostId, "💪");
  await commentApi(ben.token, apiPostId, "Giỏi lắm Ann");

  await logIn(page, ann);
  await page.goto("/feed");
  await expect(
    page.getByRole("link", { name: "Thông báo, 3 chưa đọc" }),
  ).toBeVisible();

  await page.goto("/notifications");
  const items = page
    .getByRole("listitem")
    .filter({ hasText: "E2E Social Ben" });

  await expect(items).toHaveCount(3);
  await expect(items.first().getByRole("link")).toHaveAttribute(
    "href",
    `/post/${apiPostId}`,
  );

  // Opening the list marked them read: the bell is quiet now.
  await page.goto("/feed");
  await expect(
    page.getByRole("link", { name: "Thông báo", exact: true }),
  ).toBeVisible();
});

test("a friend sees the post, comments on it and pages the feed", async ({
  page,
}) => {
  for (let n = 1; n <= 12; n++) {
    await createPostApi(
      ann.token,
      `E2E scroll post ${String(n).padStart(2, "0")}`,
    );
  }
  await logIn(page, ben);
  await page.goto("/feed");
  await expect(page.getByText("E2E scroll post 12")).toBeVisible();
  // The first page holds 10 posts: the oldest ones load on scrolling.
  await expect(page.getByText("E2E scroll post 01")).toHaveCount(0);
  await expect(async () => {
    await page.getByText("E2E scroll post 06").scrollIntoViewIfNeeded();
    await expect(page.getByText("E2E scroll post 01")).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });

  await page.goto(`/post/${apiPostId}`);
  await page
    .getByPlaceholder("Viết bình luận...")
    .fill("Bình luận từ giao diện");
  await page.getByRole("button", { name: "Gửi" }).click();
  await expect(page.getByText("Bình luận từ giao diện")).toBeVisible();
  await expect(page.getByText("Giỏi lắm Ann")).toBeVisible();
});

test("a report reaches the super admin, who keeps the post", async ({
  page,
}) => {
  await reportApi(ben.token, "post", apiPostId, "e2e-spam-reason");

  await logInAsAdmin(page);
  await page.goto("/admin/social");
  await expect(page.getByText("E2E scroll post 12")).toBeVisible();

  await page.goto("/admin/reports");
  await expect(page.getByText(/e2e-spam-reason/)).toBeVisible();
  await page.getByRole("button", { name: "Giữ" }).first().click();
  await expect(page.getByText(/e2e-spam-reason/)).toHaveCount(0);
});
