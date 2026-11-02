# Spec: Install pt-app as an app (PWA)

KAN-79 (sub-tasks KAN-80 [FE], KAN-81 [QA]). Intent: `intent/2026-11-02-pwa-install.md`.

## Today

- `app/manifest.ts`: name, `start_url: /workouts`, `display: standalone`, colors. **No icons.**
- `app/layout.tsx`: `appleWebApp.capable`, theme colors, `viewportFit: cover`.
- No service worker, no apple-touch icon, only `app/favicon.ico`.

Result: Chrome's installability check fails (no 192/512 icon); iOS "Add to Home Screen" works but shows a screenshot icon.

## Decisions (proposed, confirm on KAN-79)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Why                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| D1  | Icons: a simple generated mark (dumbbell on the app's dark color `#0c0c0e`, white glyph) as static PNGs 192, 512, maskable 512 and apple-touch 180 in `public/icons/`, rendered once by a script from an SVG and committed.                                                                                                                                                                                                                                                            | No design asset exists; static files avoid a runtime image route. Hoan can swap the PNGs later. |
| D2  | Manifest adds `id: "/"`, `scope: "/"`, `lang: "vi"`, `orientation: "portrait"`, `icons`; `start_url` stays `/workouts` (the protected layout already redirects a logged-out trainee to login).                                                                                                                                                                                                                                                                                         | Stable app identity; same landing page as today.                                                |
| D3  | Service worker `public/sw.js`, hand-written, no dependency. Precache `/offline`, its `/_next/static` chunks and the icons, in a cache named per build. Navigations and static chunks: network first, on a thrown fetch show `/offline` or the cached chunk. Never cache HTML pages, server actions, `/api` or any response with user data.                                                                                                                                             | Installable + friendly offline screen without risking stale or private data on a shared phone.  |
| D4  | `sw.js` served with `Cache-Control: no-cache, no-store, must-revalidate` and `Content-Type: application/javascript` via `next.config.ts` headers (Next PWA guide).                                                                                                                                                                                                                                                                                                                     | Every deploy reaches users; no stuck old worker.                                                |
| D5  | Install UI only on the trainee site (`(user)` routes), not admin. Android/Chrome: a bottom banner "Cài PT App lên màn hình chính" with **Cài đặt** (calls the saved `beforeinstallprompt`) and **Để sau**. iOS Safari: banner "Bấm Chia sẻ rồi chọn Thêm vào MH chính". Hidden when `display-mode: standalone` or `navigator.standalone`; "Để sau" hides it for 14 days (localStorage, wrapped in try/catch).                                                                          | Next's guide recommends the iOS hint; Chrome's own mini-infobar is easy to miss.                |
| D6  | In-app browsers (Zalo, Facebook, Messenger) cannot install: the banner says "Mở bằng Safari/Chrome để cài app".                                                                                                                                                                                                                                                                                                                                                                        | Many links in VN are opened from Zalo.                                                          |
| D7  | Service worker registers in production only, so `pnpm dev` keeps hot reload clean. e2e runs against the production build, so it still covers the worker.                                                                                                                                                                                                                                                                                                                               | Avoid dev cache confusion.                                                                      |
| D8  | PT admins get their own installable app: every `/admin` page links `/admin-manifest.webmanifest` (name "PT Admin", `id`/`start_url`/`scope` `/admin`, same icons) and sets the Apple web app title "PT Admin". The manifest is served outside `/admin` because `proxy.ts` guards `/admin/*` and browsers fetch manifests without cookies. Added 2026-11-02 after Hoan asked how an admin logs in from the installed iPhone app (the trainee app has no address bar and no admin link). | Admin installs open the dashboard; trainee and admin apps stay separate.                        |

## Obsolete behaviour to revisit

Nothing is removed. The README's "Nhớ đăng nhập" section stays true (the cookie is shared with the installed app on Android; on iOS the home-screen app has its own storage, so a trainee logs in once more after installing). The README gets a short "Cài app" section.

## Open questions

1. Is the generated dumbbell icon fine for now, or does Hoan have a logo? (Default: generated icon.)
2. Should admins (PTs) also get the install banner on `/admin`? (Default: no; they can still install from the browser menu.)

## Test matrix

| Case                                       | Level                | Expected                                                         |
| ------------------------------------------ | -------------------- | ---------------------------------------------------------------- |
| UA iPhone Safari, not standalone           | unit                 | platform `ios`                                                   |
| UA iPadOS 13+ (desktop Safari UA + touch)  | unit                 | `ios`                                                            |
| UA Android Chrome                          | unit                 | `android` (banner waits for `beforeinstallprompt`)               |
| UA Zalo / FBAN / Instagram in-app          | unit                 | `in-app`                                                         |
| Standalone display mode                    | unit                 | `installed`, no banner                                           |
| Dismiss timestamp < 14 days                | unit                 | hidden; >= 14 days shown again                                   |
| `/manifest.webmanifest`                    | e2e                  | has 192 and 512 PNG icons, maskable entry, `start_url /workouts` |
| Each icon URL                              | e2e                  | 200, `image/png`                                                 |
| `/sw.js`                                   | e2e                  | 200, `no-cache` header                                           |
| Worker registered, then offline navigation | e2e                  | offline page "Không có kết nối mạng"                             |
| Offline page                               | browser proof 390 px | readable, retry button                                           |
| Real phones after deploy                   | manual (Hoan)        | Android install prompt, iOS home-screen icon, opens standalone   |
