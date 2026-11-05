import { expect, type Page } from "@playwright/test";

import { formatFullDay } from "@/utils/week";

// A day of the copy sheet's month grid, going to the right month first.
export const getCopyDay = async (page: Page, date: string) => {
  const dialog = page.getByRole("dialog");
  const [year, month] = date.split("-").map(Number);
  const label = `Tháng ${month}, ${year}`;

  for (let step = 0; step < 12; step += 1) {
    if (await dialog.getByText(label, { exact: true }).isVisible()) {
      break;
    }
    await dialog.getByRole("button", { name: "Tháng sau" }).click();
  }
  await expect(dialog.getByText(label, { exact: true })).toBeVisible();

  return dialog.getByRole("button", {
    name: new RegExp(`^${formatFullDay(date)}(,|$)`),
  });
};

// Picks a day of the grid by touch/click.
export const pickCopyDay = async (page: Page, date: string) => {
  const day = await getCopyDay(page, date);

  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
};
