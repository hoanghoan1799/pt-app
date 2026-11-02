import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

// Renders the SVG sources in public/icons to the PNGs the manifest and iOS
// need. Run `pnpm pwa:icons` after changing an SVG, then commit the PNGs.
// icon-maskable.svg keeps the glyph inside the central 80% safe zone.
const ICON_DIR = resolve(process.cwd(), "public/icons");

const TARGETS = [
  { source: "icon.svg", file: "icon-192.png", size: 192 },
  { source: "icon.svg", file: "icon-512.png", size: 512 },
  { source: "icon-maskable.svg", file: "icon-maskable-512.png", size: 512 },
  { source: "icon.svg", file: "apple-touch-icon.png", size: 180 },
] as const;

const main = async () => {
  await mkdir(ICON_DIR, { recursive: true });
  const browser = await chromium.launch();

  try {
    for (const { source, file, size } of TARGETS) {
      const svg = await readFile(resolve(ICON_DIR, source), "utf8");
      const page = await browser.newPage({
        viewport: { width: size, height: size },
      });

      await page.setContent(
        `<html><body style="margin:0;overflow:hidden"><div style="width:${size}px;height:${size}px">${svg.replace(
          /<svg /,
          `<svg style="width:${size}px;height:${size}px;display:block" `,
        )}</div></body></html>`,
      );
      await writeFile(
        resolve(ICON_DIR, file),
        await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width: size, height: size },
        }),
      );
      await page.close();
      console.log(`wrote public/icons/${file}`);
    }
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
