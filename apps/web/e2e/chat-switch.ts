import { expect, type Locator, type Page } from "@playwright/test";

// The admin "Cho phép nhắn tin" switch on /admin/users/<id>/messages.
export const getChatSwitch = (page: Page) =>
  page.getByRole("switch", { name: "Cho phép nhắn tin" });

// Clicks the switch and waits until its server action has answered. The
// switch flips aria-checked at once (optimistic) and stays busy until then;
// reloading or navigating before that aborts the action's response ("The
// destination stream closed early") and can render the page before the API
// saved the change.
export const clickChatSwitch = async (lock: Locator, enabled: boolean) => {
  await lock.click();
  await expect(lock).toHaveAttribute("aria-busy", "false");
  await expect(lock).toBeEnabled();
  await expect(lock).toHaveAttribute("aria-checked", String(enabled));
};

// Opens the trainee's thread as the admin, sets the switch (only clicking
// when it is not already there) and reloads to the saved state.
export const ensureChatSwitch = async (
  admin: Page,
  userId: number,
  enabled: boolean,
) => {
  await admin.goto(`/admin/users/${userId}/messages`);
  const lock = getChatSwitch(admin);

  if ((await lock.getAttribute("aria-checked")) !== String(enabled)) {
    await clickChatSwitch(lock, enabled);
  }
  await admin.reload();
  await expect(getChatSwitch(admin)).toHaveAttribute(
    "aria-checked",
    String(enabled),
  );
};
