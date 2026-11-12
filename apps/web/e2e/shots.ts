import type { Locator, Page } from "@playwright/test";

// Screenshots for the browser proof; only taken when E2E_SHOTS_DIR is set.
export const shot = async (
  target: Page | Locator,
  name: string,
  options: { fullPage?: boolean } = {},
) => {
  const dir = process.env.E2E_SHOTS_DIR;

  if (!dir) {
    return;
  }
  const path = `${dir}/${name}.png`;

  if ("goto" in target) {
    await target.screenshot({ path, fullPage: options.fullPage });
  } else {
    await target.screenshot({ path });
  }
};
