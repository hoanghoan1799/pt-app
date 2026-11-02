# Plan: Install pt-app as an app (PWA)

## Source

- Intent: `intent/2026-11-02-pwa-install.md`
- Spec: `docs/specs/pwa-install.md`
- KAN key: KAN-79 (KAN-80 [FE], KAN-81 [QA])

## Files that change

- `scripts/generate-pwa-icons.ts` (new): renders `public/icons/icon.svg` to PNGs with the pre-installed Playwright Chromium. Run once; PNGs are committed.
- `public/icons/` (new): `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.
- `app/manifest.ts`: `id`, `scope`, `lang`, `orientation`, `icons`.
- `app/layout.tsx`: `icons.apple` metadata.
- `public/sw.js` (new): install (precache `/offline` + icons), activate (drop old caches), fetch (navigation network-first with offline fallback; precached icons cache-first; everything else untouched).
- `app/offline/page.tsx` (new): static Vietnamese offline page with "Thử lại".
- `next.config.ts`: headers for `/sw.js`.
- `features/pwa/utils/detect-install-platform.ts` + `__tests__/` (new): pure UA/standalone detection and dismissal window.
- `features/pwa/hooks/use-install-prompt.ts` (new): captures `beforeinstallprompt`, reads/writes dismissal.
- `features/pwa/components/ServiceWorkerRegister/index.tsx`, `InstallPrompt/index.tsx` (new).
- `app/(user)/(protected)/layout.tsx`: render `InstallPrompt`; root layout renders `ServiceWorkerRegister`.
- `e2e/pwa.spec.ts` (new): manifest, icons, sw headers, offline fallback.
- `README.md`: "Cài app" section.

## Order of work

1. Icons + manifest + apple icon. Verify: manifest e2e and icon URLs.
2. Offline page + `sw.js` + headers + register. Verify: e2e offline navigation.
3. Detection util with unit tests, then hook + `InstallPrompt`. Verify: unit tests, browser proof at 390 px with emulated iPhone and Android UAs.
4. README, `pnpm verify`, e2e, `/code-review`, PR with walkthrough artifact.

## Risks

- A buggy worker can keep serving an old page. Contained by: no HTML caching, `no-cache` on `sw.js`, `skipWaiting` + `clients.claim`, cache name versioned.
- iOS home-screen app has its own cookie jar: trainee logs in once more. Documented in README.
- Offline fallback could hide a real server error: only network failures (fetch throws) show `/offline`; HTTP errors pass through.

## Proof

- Unit: `features/pwa/utils/__tests__/detect-install-platform.test.ts`.
- e2e: `e2e/pwa.spec.ts`. Commands: `pnpm verify`, `pnpm test:e2e`.
- Browser proof screenshots (banner Android/iOS, offline page) at 390 px; real-phone check by Hoan after the Vercel deploy.

## Deviations

- D7 changed: the worker registers in production or when `NEXT_PUBLIC_ENABLE_SW=1`, because e2e runs against `next dev`. `e2e/config.ts` sets the flag in `E2E_ENV`.
- Icon sources: besides `icon.svg` there is `icon-maskable.svg` (glyph scaled to 72% for the safe zone); `pnpm pwa:icons` renders both. The script imports `chromium` from `@playwright/test` (already a dependency).
- Offline e2e: Playwright's `setOffline` does not affect fetches made by the worker, so `playwright.config.ts` sets `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` and the spec aborts the `/summary` request with `context.route`. The worker then falls back to `/offline`.
- Added `features/pwa/components/OfflineRetryButton` (client button for the static offline page) and `features/pwa/constants/index.ts`.
- `/sw.js` also gets a `Content-Security-Policy: default-src 'self'; script-src 'self'` header, as in the Next PWA guide.
- e2e default storage state: the iPhone preset's user agent makes the install banner appear above the tab bar and cover taps (F8, F9, B17 timed out on first run). `playwright.config.ts` now starts every spec with the dismissal key set; the banner specs in `e2e/pwa.spec.ts` use an empty storage state.
