import { expect, type Page } from "@playwright/test";

// The in-app confirm dialog (components/common/ConfirmDialog): checks it is
// open (and its title), then clicks the chosen button.
export const answerConfirm = async (
  page: Page,
  choice: string,
  title?: string | RegExp,
) => {
  const dialog = page.getByRole("alertdialog", title ? { name: title } : {});

  await expect(dialog).toBeVisible();
  // The safe choice has focus when the dialog opens.
  await expect(dialog.getByRole("button", { name: "Hủy" })).toBeFocused();
  await dialog.getByRole("button", { name: choice, exact: true }).click();
  await expect(dialog).toHaveCount(0);
};
