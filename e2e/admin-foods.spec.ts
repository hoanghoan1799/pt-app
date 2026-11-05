import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";

import { fillTraineeLogin } from "./auth";
import { E2E_ADMIN, E2E_DB_URL, E2E_USER_NAME } from "./config";
import { answerConfirm } from "./confirm";
import { E2E_FOODS } from "./seed";

// PT views of the food library test matrix (docs/specs/food-library.md): F4,
// F7, F8 and F11. The specs share one seeded DB and run in order; F8 ends with
// "Phở bò" archived.
const PHO = "Phở bò";
const PHO_EDITED = "Phở bò tái";

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

const countFoods = async (where: string, value: string) => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    const result = await client.execute({
      sql: `SELECT COUNT(*) AS total FROM foods WHERE ${where} AND archived_at IS NULL`,
      args: [value],
    });

    return Number(result.rows[0].total);
  } finally {
    client.close();
  }
};

const getFoodLink = (page: Page, name: string) =>
  page.getByRole("link", { name: new RegExp(name) });

const fillFood = async (
  page: Page,
  food: Record<"name" | "kcal" | "protein" | "carbs" | "fat", string>,
) => {
  await page.getByLabel("Tên món", { exact: true }).fill(food.name);
  await page.getByLabel("Calo", { exact: true }).fill(food.kcal);
  await page.getByLabel("Protein", { exact: true }).fill(food.protein);
  await page.getByLabel("Carb", { exact: true }).fill(food.carbs);
  await page.getByLabel("Fat", { exact: true }).fill(food.fat);
};

// Opens a second browser as the trainee and returns the names it lists.
const traineeSees = async (
  browser: import("@playwright/test").Browser,
  name: string,
) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await fillTraineeLogin(page, E2E_USER_NAME);
    await expect(page).toHaveURL(/\/workouts/);
    await page.goto("/foods");
    await expect(
      page.getByRole("heading", { name: "Thư viện thực phẩm" }),
    ).toBeVisible();

    return await getFoodLink(page, name).count();
  } finally {
    await context.close();
  }
};

test.beforeEach(async ({ page }) => {
  await logInAsAdmin(page);
});

test("F8: the PT adds, edits and deletes Phở bò, and the trainee list follows", async ({
  page,
  browser,
}) => {
  // Entry point: the Thực phẩm button in the admin home header.
  await page.getByRole("link", { name: "Thực phẩm" }).click();
  await expect(page).toHaveURL(/\/admin\/foods$/);
  await expect(getFoodLink(page, PHO)).toHaveCount(0);

  // Add, with a serving of 1 tô = 500 g.
  await page.getByRole("link", { name: "Thêm món" }).click();
  await expect(page).toHaveURL(/\/admin\/foods\/new$/);
  await fillFood(page, {
    name: PHO,
    kcal: "60",
    protein: "4",
    carbs: "8",
    fat: "1.2",
  });
  await page.getByLabel("Nhóm").selectOption("dish");
  await page.getByLabel("Tên khẩu phần").fill("1 tô");
  await page.getByLabel("Khối lượng khẩu phần").fill("500");
  // 4×4 + 8×4 + 1.2×9 = 58.8 kcal is within 10 % of 60: no warning.
  await expect(page.getByText(/khớp với calo đã nhập/)).toBeVisible();
  await page.getByRole("button", { name: "Thêm món" }).click();

  await expect(page).toHaveURL(/\/admin\/foods$/);
  await expect(getFoodLink(page, PHO)).toBeVisible();
  await expect(getFoodLink(page, PHO)).toContainText("Món chế biến");
  await expect(getFoodLink(page, PHO)).toContainText("60 kcal");
  expect(await traineeSees(browser, PHO)).toBe(1);

  // Detail: 1.5 bowls of 500 g = 750 g = 450 kcal, P 30, C 60, F 9.
  await getFoodLink(page, PHO).click();
  await page.getByRole("button", { name: /Khẩu phần \(1 tô\)/ }).click();
  await page.getByLabel("Số khẩu phần").fill("1,5");
  await expect(page.getByText("= 750 g")).toBeVisible();

  const result = page.locator('dl[aria-live="polite"]');

  await expect(result).toContainText("450 kcal");
  await expect(result).toContainText("30 g");
  await expect(result).toContainText("60 g");
  await expect(result).toContainText("9 g");

  // Edit: rename and raise fat to 2 g and kcal to 63 (4×4+8×4+2×9 = 66).
  await page.getByLabel("Tên món", { exact: true }).fill(PHO_EDITED);
  await page.getByLabel("Calo", { exact: true }).fill("63");
  await page.getByLabel("Fat", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Đã lưu thay đổi")).toBeVisible();

  await page.goto("/admin/foods");
  await expect(getFoodLink(page, PHO_EDITED)).toContainText("63 kcal");
  await expect(getFoodLink(page, PHO_EDITED)).toContainText("F 2");
  expect(await traineeSees(browser, PHO_EDITED)).toBe(1);

  // Delete: dismissing keeps it, accepting archives it from both lists.
  await getFoodLink(page, PHO_EDITED).click();

  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await answerConfirm(page, "Hủy", "Xóa món này?");
  await expect(page).toHaveURL(/\/admin\/foods\/\d+$/);

  // Esc cancels too, and no native dialog is involved.
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Xóa món này?" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/foods\/\d+$/);

  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await answerConfirm(page, "Xóa", "Xóa món này?");
  await expect(page).toHaveURL(/\/admin\/foods$/);
  await expect(getFoodLink(page, PHO_EDITED)).toHaveCount(0);
  expect(await traineeSees(browser, PHO_EDITED)).toBe(0);

  // The row is kept, only archived.
  const client = createClient({ url: E2E_DB_URL });

  try {
    const result = await client.execute({
      sql: "SELECT archived_at, kcal FROM foods WHERE name = ?",
      args: [PHO_EDITED],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].archived_at).not.toBeNull();
    expect(Number(result.rows[0].kcal)).toBe(63);
  } finally {
    client.close();
  }
});

test("F4: a kcal far from the macros is refused until the PT ticks the check box", async ({
  page,
}) => {
  const NAME = "Thử kcal lệch";

  await page.goto("/admin/foods/new");
  // Macros 31/0/3.6 give 156 kcal; 65 kcal is 141 % off.
  await fillFood(page, {
    name: NAME,
    kcal: "65",
    protein: "31",
    carbs: "0",
    fat: "3.6",
  });
  await expect(
    page.getByText(/Calo nhập 65 lệch 141% so với 156 kcal/),
  ).toBeVisible();

  const confirmBox = page.getByLabel("Tôi đã kiểm tra số liệu");

  await expect(confirmBox).not.toBeChecked();

  // Unticked: the server refuses, we stay on the form and nothing is saved.
  await page.getByRole("button", { name: "Thêm món" }).click();
  await expect(page.getByText("Vui lòng kiểm tra lại thông tin")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/foods\/new$/);
  expect(await countFoods("name = ?", NAME)).toBe(0);

  // A kcal within 10 % hides the warning and the box.
  await page.getByLabel("Calo", { exact: true }).fill("165");
  await expect(page.getByText(/Calo nhập/)).toHaveCount(0);
  await expect(confirmBox).toHaveCount(0);
  await page.getByLabel("Calo", { exact: true }).fill("65");

  // The tick covers the numbers it was given: editing one clears it.
  await confirmBox.check();
  await page.getByLabel("Calo", { exact: true }).fill("66");
  await expect(confirmBox).not.toBeChecked();
  await page.getByLabel("Fat", { exact: true }).fill("3.5");
  await page.getByLabel("Fat", { exact: true }).fill("3.6");
  await page.getByLabel("Calo", { exact: true }).fill("65");

  // Ticked: the same numbers are saved as typed.
  await page.getByLabel("Tôi đã kiểm tra số liệu").check();
  await page.getByRole("button", { name: "Thêm món" }).click();
  await expect(page).toHaveURL(/\/admin\/foods$/);
  await expect(getFoodLink(page, NAME)).toContainText("65 kcal");
  expect(await countFoods("name = ?", NAME)).toBe(1);
});

test("F7: a second active food with the same name is refused", async ({
  page,
}) => {
  await page.goto("/admin/foods/new");
  // Same name key as "Ức gà (chín)": no accents, upper case.
  await fillFood(page, {
    name: "UC GA (CHIN)",
    kcal: "165",
    protein: "31",
    carbs: "0",
    fat: "3.6",
  });
  await page.getByRole("button", { name: "Thêm món" }).click();

  await expect(
    page
      .getByRole("main")
      .getByText(
        "Đã có món trùng tên. Thêm trạng thái (sống/chín) để phân biệt.",
      ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/foods\/new$/);
  expect(await countFoods("name_key = ?", "uc ga (chin)")).toBe(1);

  // The raw version is a different food.
  await page.getByLabel("Tên món", { exact: true }).fill("Ức gà (nướng)");
  await page.getByRole("button", { name: "Thêm món" }).click();
  await expect(page).toHaveURL(/\/admin\/foods$/);
  await expect(getFoodLink(page, "Ức gà \\(nướng\\)")).toBeVisible();
  expect(await countFoods("name_key = ?", "uc ga (chin)")).toBe(1);
});

test("F11: search ignores accents and the group chips narrow the list", async ({
  page,
}) => {
  await page.goto("/admin/foods");

  // "uc ga" finds both chicken breasts and nothing else.
  await page.getByLabel("Tìm món").fill("uc ga");
  await expect(
    getFoodLink(page, E2E_FOODS.CHICKEN.replace(/[()]/g, "\\$&")),
  ).toBeVisible();
  await expect(getFoodLink(page, "Ức gà \\(sống\\)")).toBeVisible();
  await expect(getFoodLink(page, "Cơm trắng")).toHaveCount(0);
  await expect(getFoodLink(page, "Cá hồi")).toHaveCount(0);

  // More words narrow it to one.
  await page.getByLabel("Tìm món").fill("uc ga chin");
  await expect(getFoodLink(page, "Ức gà \\(chín\\)")).toBeVisible();
  await expect(getFoodLink(page, "Ức gà \\(sống\\)")).toHaveCount(0);

  // Group chip: seafood shows only the salmon.
  await page.getByLabel("Tìm món").fill("");
  await page.getByRole("button", { name: "Cá & hải sản" }).click();
  await expect(getFoodLink(page, "Cá hồi")).toBeVisible();
  await expect(getFoodLink(page, "Ức gà")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cá & hải sản" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Query and group combine: no chicken in the seafood group.
  await page.getByLabel("Tìm món").fill("uc ga");
  await expect(page.getByText("Không tìm thấy món nào")).toBeVisible();

  // Back to all.
  await page.getByRole("button", { name: "Tất cả" }).click();
  await expect(getFoodLink(page, "Ức gà \\(sống\\)")).toBeVisible();
});
