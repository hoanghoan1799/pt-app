import { type Browser, expect, type Page, test } from "@playwright/test";

import { E2E_USER_NAME } from "./config";
import { shot } from "./shots";

// PWA install test matrix (docs/specs/pwa-install.md): manifest, icons, the
// service worker script and the offline fallback.
interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

test("the manifest has the start page, standalone display and 192, 512 and maskable PNG icons", async ({
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");

  expect(response.status()).toBe(200);
  const manifest = await response.json();

  expect(manifest.start_url).toBe("/workouts");
  expect(manifest.display).toBe("standalone");
  expect(manifest.id).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.lang).toBe("vi");

  const icons: ManifestIcon[] = manifest.icons;
  const find = (sizes: string, purpose: string) =>
    icons.find(
      (icon) => icon.sizes === sizes && (icon.purpose ?? "any") === purpose,
    );

  expect(find("192x192", "any")?.type).toBe("image/png");
  expect(find("512x512", "any")?.type).toBe("image/png");
  expect(find("512x512", "maskable")?.type).toBe("image/png");

  for (const icon of icons) {
    const iconResponse = await request.get(icon.src);

    expect(iconResponse.status(), icon.src).toBe(200);
    expect(iconResponse.headers()["content-type"], icon.src).toContain(
      "image/png",
    );
  }
});

test("admin pages link the PT Admin manifest, which opens on the dashboard", async ({
  page,
  request,
}) => {
  // Logged out, /admin redirects to the admin login, which is still under the
  // admin layout and must point "Add to Home Screen" at the admin app.
  await page.goto("/admin/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/admin-manifest.webmanifest",
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute("content", "PT Admin");

  // Fetched without a session, like a browser does: not redirected by proxy.ts.
  const response = await request.get("/admin-manifest.webmanifest", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await response.json();

  expect(manifest.name).toBe("PT Admin");
  expect(manifest.id).toBe("/admin");
  expect(manifest.start_url).toBe("/admin");
  expect(manifest.scope).toBe("/admin");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon: ManifestIcon) => icon.src).sort()).toEqual([
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
  ]);
});

test("trainee pages keep the PT App manifest", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute("content", "PT App");
});

test("the apple touch icon is linked and served as a PNG", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const href = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");

  expect(href).toBe("/icons/apple-touch-icon.png");
  const response = await request.get(href ?? "");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});

test("sw.js is served as JavaScript and is never cached", async ({
  request,
}) => {
  const response = await request.get("/sw.js");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-cache");
  expect(response.headers()["content-type"]).toContain(
    "application/javascript",
  );
});

test("the offline page renders without logging in", async ({ page }) => {
  await page.goto("/offline");
  await expect(page).toHaveURL(/\/offline$/);
  await expect(
    page.getByRole("heading", { name: "Không có kết nối mạng" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
  await shot(page, "04-offline-page");
});

test("once the worker controls the page, an offline navigation shows the offline page", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker claims clients on activate; wait until this page is controlled.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Page-level offline emulation does not reach fetches made by the worker
  // itself; with PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS (set in
  // playwright.config.ts) context.route does, so every request is aborted and
  // whatever renders must come from the worker's cache.
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
  try {
    await page.goto("/summary");
    await expect(
      page.getByRole("heading", { name: "Không có kết nối mạng" }),
    ).toBeVisible();
    // The fallback replaces the failed page: no login form, no tab bar.
    await expect(page.getByLabel("Tên của bạn")).toHaveCount(0);
    // Its CSS came from the cache too, so the page is styled, not bare HTML.
    const hasStyles = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return sheet.cssRules.length > 0;
        } catch {
          return false;
        }
      }),
    );
    expect(hasStyles).toBe(true);
  } finally {
    await context.unroute("**/*");
  }

  // Back online the real app loads again: the worker did not cache the fallback.
  await page.goto("/");
  await expect(page.getByLabel("Tên của bạn")).toBeVisible();
});

// The install banner.
test.describe("install banner", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const ZALO_ANDROID =
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 Zalo/24.05.01";

  const logIn = async (page: Page) => {
    await page.goto("/");
    await page.getByLabel("Tên của bạn").fill(E2E_USER_NAME);
    await page.getByRole("button", { name: "Vào tập" }).click();
    await expect(page).toHaveURL(/\/workouts/);
  };

  const banner = (page: Page) =>
    page.getByRole("region", { name: "Cài ứng dụng" });

  test("iPhone Safari gets the Share hint, and Để sau hides it across reloads", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: IPHONE_SAFARI,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();

    await logIn(page);
    await expect(banner(page)).toContainText(
      'Để cài app: bấm nút Chia sẻ rồi chọn "Thêm vào MH chính"',
    );
    await expect(
      banner(page).getByRole("button", { name: "Cài đặt" }),
    ).toHaveCount(0);
    await shot(page, "02-ios-hint");

    await banner(page).getByRole("button", { name: "Để sau" }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "Chuyển mục" }),
    ).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await context.close();
  });

  test("an in-app browser (Zalo) is told to open Safari or Chrome", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: ZALO_ANDROID,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();

    await logIn(page);
    await expect(banner(page)).toHaveText(
      /Mở trang này bằng Safari hoặc Chrome để cài app/,
    );
    await shot(page, "03-in-app-hint");
    await context.close();
  });

  const dispatchInstallPrompt = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { promptCalls: number };
      const event = new Event("beforeinstallprompt", { cancelable: true });

      w.promptCalls = 0;
      Object.assign(event, {
        prompt: async () => {
          w.promptCalls += 1;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });

  const promptCalls = (page: Page) =>
    page.evaluate(
      () => (window as unknown as { promptCalls: number }).promptCalls,
    );

  const androidContext = (browser: Browser) =>
    browser.newContext({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });

  test("Android: an install prompt fired on the login page still shows the banner after login, and Cài đặt removes it", async ({
    browser,
  }) => {
    const context = await androidContext(browser);
    const page = await context.newPage();

    // Chrome fires the event once, on the first page, before the trainee logs in.
    await page.goto("/");
    await expect(page.getByLabel("Tên của bạn")).toBeVisible();
    await dispatchInstallPrompt(page);
    await page.getByLabel("Tên của bạn").fill(E2E_USER_NAME);
    await page.getByRole("button", { name: "Vào tập" }).click();
    await expect(page).toHaveURL(/\/workouts/);

    await expect(banner(page)).toContainText(
      "Cài PT App lên màn hình chính để mở nhanh hơn",
    );
    await shot(page, "01-android-banner");

    await banner(page).getByRole("button", { name: "Cài đặt" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(await promptCalls(page)).toBe(1);
    await context.close();
  });

  test("Android: no banner without an install prompt, and a double tap on Cài đặt calls prompt() once", async ({
    browser,
  }) => {
    const context = await androidContext(browser);
    const page = await context.newPage();

    await logIn(page);
    await expect(
      page.getByRole("navigation", { name: "Chuyển mục" }),
    ).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await dispatchInstallPrompt(page);
    await expect(banner(page)).toBeVisible();
    // Two taps in the same task, before React removes the banner.
    await page.evaluate(() => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Cài ứng dụng"] button',
        ),
      ].find((el) => el.textContent === "Cài đặt");

      button?.click();
      button?.click();
    });
    await expect(banner(page)).toHaveCount(0);
    expect(await promptCalls(page)).toBe(1);
    await context.close();
  });

  test("the banner never covers the last content of the workouts page", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: IPHONE_SAFARI,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();

    await logIn(page);
    await expect(banner(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bannerTop = await banner(page).evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    const contentBottom = await page.evaluate(() => {
      // Last visible block of the page content, not the fixed chrome.
      const main = document.querySelector("main") ?? document.body;
      let bottom = 0;

      for (const child of main.querySelectorAll("*")) {
        const rect = child.getBoundingClientRect();

        if (rect.height > 0 && rect.bottom > bottom) {
          bottom = rect.bottom;
        }
      }
      return bottom;
    });

    expect(contentBottom).toBeLessThanOrEqual(bannerTop);
    await shot(page, "06-workouts-bottom-with-banner");
    await context.close();
  });
});
