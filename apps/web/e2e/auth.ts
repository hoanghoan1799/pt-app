import type { Page } from "@playwright/test";

import { E2E_USER_PASSWORD, e2eEmail } from "./config";
import { answerConfirm } from "./confirm";

// Fills the trainee login form at "/" (email + password) and submits it.
export const fillTraineeLogin = async (
  page: Page,
  name: string,
  password: string = E2E_USER_PASSWORD,
) => {
  await page.getByLabel("Email").fill(e2eEmail(name));
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Vào tập" }).click();
};

// Logs out through the header avatar menu and answers the confirm dialog.
export const logOutViaMenu = async (page: Page) => {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Tài khoản" })
    .click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await answerConfirm(page, "Đăng xuất", "Đăng xuất khỏi thiết bị này?");
};
