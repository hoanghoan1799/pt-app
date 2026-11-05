# Plan: Mobile UI/UX polish

Status: **approved by Hoan 2026-11-05** (with the prototype: https://claude.ai/artifact/GrLoPEkZJwDmsHka4hvyd2).

## Source

- Intent: `intent/2026-11-05-mobile-ui-polish.md`
- Spec: `docs/specs/mobile-ui-polish.md` (decisions 1-14)
- KAN key: KAN-114 (sub-tasks KAN-115..125)

## Files that change

Every path below was checked with `ls` on `origin/stag`; files marked "new" do not exist yet.

PR 1, KAN-115 [FE] confirm dialog (decision 8):

- `components/common/ConfirmDialog/index.tsx` (new) and `components/common/ConfirmDialog/use-confirm.ts` (new, + test): promise-based `useConfirm`, built like the alertdialog in `features/meal-plans/components/CopyDaySheet`, on top of `components/common/BottomSheet`.
- Replace `window.confirm` in these 11 sites: `features/nutrition/hooks/use-food-log.ts`, `features/workouts/hooks/use-copy-week.ts`, `features/workouts/hooks/use-exercise-item-actions.ts` (two calls), `features/workouts/hooks/use-exercise-form.ts`, `features/meal-plans/hooks/use-trainee-meal-card.ts`, `features/foods/components/DeleteFoodButton`, `features/meal-plans/components/MealCard`, `features/meal-plans/components/MealPlanDay`, `features/members/hooks/use-member-login.ts`, `features/members/components/DeleteMemberButton`.
- Existing e2e specs that accept a native dialog (`e2e/*.spec.ts`) switch to clicking the in-app button.

PR 2, KAN-119 [BE] per-day plan completion status (decision 3):

- `features/meal-plans/utils/day-completion.ts` (new, + test): `green | yellow | grey` from planned meals and marked meals.
- `features/meal-plans/services/meal-log-queries.ts`: week query returning planned and marked meal counts per date.
- `features/meal-plans/services/meal-plan-queries.ts`: expose the status per date next to `getMealPlanWeek`.
- `features/nutrition/utils/nutrition.ts`: `isDayOnTarget` stays; only its use for the colour moves.

PR 3, KAN-120 [FE] nutrition tab (decisions 2, 4, 5, 6):

- `app/(user)/(protected)/nutrition/page.tsx`: pass the status map; order stays `BodyProfileCard` first, then `NutritionWeek`.
- `features/nutrition/components/NutritionWeek/index.tsx`: order Calendar, Daily goals, Meal plan; stop calling `isDayOnTarget` for the marker.
- `components/common/WeekDayTabs/index.tsx`: green, yellow and grey markers from the new status (shared with the admin week tabs).
- `features/nutrition/components/NutritionDayView/index.tsx`, `MacroProgressList/index.tsx`, `CaloriesProgressRow/index.tsx`, `MacroProgressRow/index.tsx`: calories line plus three rings; new `features/nutrition/components/MacroRing/index.tsx` (new).
- `features/meal-plans/components/TraineeMealPlan/index.tsx`: remove the "Đã ăn cả ngày" card.
- `features/meal-plans/components/TraineeMealCard/index.tsx`, `MealLogList/index.tsx`: success-green background when eaten; "Đã ăn thêm ngoài plan" block hidden when empty.

PR 4, KAN-121 [BE] copy plan rejects past dates (decision 11):

- `features/meal-plans/services/meal-plan-schemas.ts` (`copyDaySchema`) and `features/meal-plans/services/meal-plan-actions.ts` (`copyDayAction`): reject any target date before today with a Vietnamese error.
- `features/meal-plans/services/__tests__/meal-plan-actions.test.ts`: past-date case.

PR 5, KAN-122 [FE] copy plan month picker (decision 11):

- `features/meal-plans/components/CopyDaySheet/index.tsx`: replace the checkbox list with the month grid; keep the overwrite confirm.
- `features/meal-plans/utils/copy-calendar.ts` (new, + test): Monday-first grid, disabled past days, today and tomorrow flags.
- `features/meal-plans/hooks/use-copy-day.ts`: selection state for the grid.
- `app/admin/(protected)/users/[id]/nutrition/page.tsx`: stop building the date list; the sheet derives the month.

PR 6, KAN-123 [FE] change password redirect (decision 12):

- `features/auth/components/ChangePasswordForm/index.tsx`: on success `router.replace` to `/workouts` and toast through `components/common/AppToaster`; drop the inline green message.
- `app/(user)/(protected)/account/password/page.tsx`: no change expected, listed to confirm the route.

PR 7, KAN-116 [FE] header menus and theme (decision 7):

- `components/layout/AppHeader/index.tsx`: gear and avatar slots.
- `components/layout/HeaderMenus/index.tsx` (new): gear menu (Giao diện, Thông báo đẩy) and avatar menu (Đổi mật khẩu, Đăng xuất).
- `features/auth/components/UserHeaderActions` and `features/auth/components/LogoutButton`: use the avatar menu and `useConfirm`.
- `features/chat/components/PushOptInCard` and `features/chat/hooks/use-push-subscription.ts`: reuse the opt-in from the gear menu.
- `app/admin/(protected)/page.tsx`: header actions become messages icon with badge, gear, avatar.
- `app/layout.tsx`, `app/globals.css`: read the theme cookie on the server, set the root theme attribute, keep `prefers-color-scheme` for "Hệ thống".
- `utils/theme.ts` (new, + test) and a small server action or route to write the cookie (new).

PR 8, KAN-117 [BE] typing events and admin unread route (decision 9):

- `features/chat/utils/ably-capabilities.ts` (+ test): allow publishing the typing event on the conversation channel for each role.
- `features/chat/utils/typing-rules.ts` (new, + test): throttle and expiry constants.
- `features/chat/services/chat-realtime.ts`: typing event name added to the event list.
- `app/api/chat/unread/route.ts` (+ new test): `?as=admin` returns the total and per-trainee counts, 401 without an admin session.
- `features/chat/services/chat-queries.ts`: per-trainee unread counts for the admin.

PR 9, KAN-118 [FE] typing indicator and live badges (decision 9):

- `features/chat/hooks/use-chat-transport.ts`: send and receive typing events; none in polling-only mode.
- `features/chat/hooks/use-chat-unread.ts`: admin variant polling `?as=admin`.
- `features/chat/components/Composer/index.tsx`, `ChatThread/index.tsx`, `TraineeChatThread/index.tsx`: indicator row and throttled typing signal.
- `features/chat/components/UnreadBadge/index.tsx`, `InboxLiveRefresh/index.tsx`: live admin badge on the dashboard and header.

PR 10, KAN-124 [FE] admin dashboard, add user, chips (decision 13):

- `app/admin/(protected)/page.tsx`: "Thao tác" tiles (Thêm user, Thư viện món, Tin nhắn).
- `features/dashboard/components/MemberProgressList/index.tsx`, `features/members/services/progress-queries.ts`: per-trainee unread badge.
- `features/members/components/CreateMemberForm/index.tsx`, `AddMemberButton/index.tsx`, `OneTimePassword/index.tsx`: visible labels, sticky submit, sheet grows after create with the password and "Sao chép" on top.
- `features/foods/components/FoodList/index.tsx`: right-edge fade and scroll-snap on the chips.

PR 11, KAN-125 [QA] e2e and browser proof:

- `e2e/` specs named in the spec test matrix (`e2e/chat.spec.ts` extended; new `e2e/nutrition-tab.spec.ts`, `e2e/header-menus.spec.ts`, `e2e/admin-dashboard.spec.ts`), seed data in `e2e/seed.ts`.
- Browser proof artifact (390 and 320 px, light and dark, trainee and admin).
- README: update the Vietnamese feature list for the new header and nutrition tab.

## Order of work

One PR per sub-task, each from `stag`, in this order:

1. KAN-115 confirm dialog (other PRs reuse `useConfirm`).
2. KAN-119 completion status (BE first so the UI has data).
3. KAN-120 nutrition tab.
4. KAN-121 copy plan server check.
5. KAN-122 copy plan month picker.
6. KAN-123 change password redirect.
7. KAN-116 header menus and theme.
8. KAN-117 typing events and admin unread route.
9. KAN-118 typing indicator and live badges.
10. KAN-124 admin dashboard, add user, chips.
11. KAN-125 e2e and browser proof.

Each PR: branch `feat/KAN-<n>-...`, ticket In Progress at start, In Review when the PR opens, Done on merge. No schema change in any PR.

## Risks

- Replacing `window.confirm` changes a synchronous call into an async one; hooks that read state after the confirm must not use stale values. Covered by the `useConfirm` unit test and the updated e2e specs.
- Calendar colour semantics change for existing users (macros on target to meals eaten). The spec records it; the old helper stays so nothing else breaks.
- Theme cookie read in the root layout makes more routes dynamic; check that `/offline` and the service worker still work (`e2e/pwa.spec.ts`).
- Typing events add Ably publishes; throttling keeps usage inside the free tier. Polling-only mode must show no indicator and no errors.
- Month picker date maths near month and week edges and time zones: tests use fixed dates and the server check uses the same today helper as the rest of meal plans.
- 320 px width for three rings, gear and avatar next to the title: checked in the browser proof.
- The admin app has no change-password page, so the admin avatar menu keeps Đổi mật khẩu and shows a "Tính năng đang cập nhật" toast until that page exists (KAN-116 deviation).

## Proof

- Unit: `use-confirm.test.ts`, `day-completion.test.ts`, `copy-calendar.test.ts`, `theme.test.ts`, `typing-rules.test.ts`, `ably-capabilities.test.ts`, `meal-plan-actions.test.ts`, the admin unread route test.
- e2e: the rows of the spec test matrix; the e2e job stays under 3 minutes.
- `pnpm verify` green on every PR; paste the tail of its output in the PR.
- Browser proof (`browser-proof` skill) in KAN-125: nutrition tab, copy plan, header menus, confirm dialog, admin dashboard and add-user sheet.

## Deviations

- KAN-115: no provider. `useConfirm` reads a module-level store and `ConfirmDialog` is mounted once in `app/layout.tsx`, so any hook can ask without wiring. The dialog is a floating card (16 px gutter) on `BottomSheet`, which gained optional `role`, `isFloating` and `onOpenAutoFocus` props. `use-copy-week` now always prevents the native submit and sends the form data after the confirm resolves. The unit test covers the store only (no DOM test setup). The copy-week and food-entry delete confirms have no e2e yet; KAN-125 adds them.
- KAN-116 (decided 2026-11-05): the admin avatar menu keeps "Đổi mật khẩu" although the admin has no password page yet. Until that page exists it shows a "Tính năng đang cập nhật" toast.
- KAN-119: a meal counts as eaten only when its mark has `achieved = true` (the "Đạt" tick); note-only marks and extra food do not count, and marks for meals no longer in the plan are ignored. Statuses are `complete | partial | none` (KAN-120 maps them to green, yellow, grey). `getWeekCompletion(userId, weekStart)` lives in `meal-log-queries.ts` (not `meal-plan-queries.ts`) and uses one joined query; the counting is in the pure util.
- KAN-121: the past-date check lives in `copyDayAction`, not `copyDaySchema`, because the shared Zod `read()` helper hides specific messages behind a generic error. Any past date in the list rejects the whole request ("Không thể sao chép sang ngày đã qua."). `e2e/meal-plans.spec.ts` now copies within next week so its targets never fall in the past.
- KAN-122: the page only loads plans and logs for two weeks, so the sheet could not mark days in other months. New admin-guarded, Zod-validated `getCopyMonthInfoAction({ userId, from, to })` in `meal-plan-actions.ts` (range at most 42 days) returns the plan dates and the dates with logs; `use-copy-day` reads it for the month shown each time the sheet opens (the page's own dates show until it answers) and keeps "Sao chép" disabled meanwhile, so an overwrite is never missed. The page now passes `today` (from `getTodayDate(TIME_ZONE)`) instead of `copyDates`. Selecting a day uses `aria-pressed`; past and source days use `aria-disabled`. The "Đã có plan, sẽ ghi đè" hint is always visible as the legend, so e2e checks the dot through the day's accessible name ("đã có plan"). The two new e2e grid specs run after R2 because R2 counts plans from next Monday on.
- KAN-123: the admin app has no change-password route, so only the trainee redirect (`/workouts`) is implemented; the admin `/admin` redirect applies when that page exists. The toast text is a new `AUTH_MESSAGES.PASSWORD_CHANGED_TOAST`; `PASSWORD_CHANGED` stays as the action's state message. The form fires the toast and `router.replace` from an effect on the success state, and the toaster in the root layout keeps it across the navigation. Each password field got a show/hide button (`aria-label` "Hiện mật khẩu" / "Ẩn mật khẩu", `aria-pressed`). The existing change e2e in `e2e/auth-login.spec.ts` now asserts the redirect and toast, and a new spec covers the inline wrong-password error and the toggle.
- KAN-116 (implementation): the admin header loses the Thực phẩm link and Thêm user button (header is messages, gear, avatar). Until the "Thao tác" tiles of KAN-124 land, both sit in a small action row at the top of the dashboard so they stay reachable.
- KAN-116: the avatar shows a person icon, not initials, because the chat thread header has no user name to pass. The theme cookie is `theme` (light | dark | system, one year, SameSite=Lax, httpOnly); `<html data-theme>` always carries the value, and `generateViewport` sets `theme-color` from it. The precached `/offline` page keeps the theme it was cached with.
- KAN-116: `LogoutButton` is deleted; `usePushSubscription` gained `disable()` (DELETE `/api/push/subscribe`) and availability flags for the gear menu.
- KAN-117: typing is published by the server, not by the browser. The plan said to allow publishing the typing event in `ably-capabilities.ts`, but Ably capabilities grant publish per channel, not per event name, so a client with publish on `chat:conversation:<id>` could also forge `message`, `read` and `chat-status` events. Capabilities stay subscribe-only (the test still asserts no publish). New `POST /api/chat/typing` (trainee session; `?as=admin` with `{ conversationId }` for the admin) checks the session, the Zod-validated conversation and the chat lock (403 `chat_locked` for a locked trainee, in both directions; a trainee always uses their own conversation) and calls `publishTyping`, which is a no-op without an Ably key. The route answers 204 so the FE can fire and forget. Event payload is `{ role, senderKey }`, no text. No server-side throttle: the FE throttles with `typing-rules.ts` (`TYPING_THROTTLE_MS` 2500, `TYPING_EXPIRY_MS` 5000). `/api/chat/unread?as=admin` returns `{ count, perTrainee: [{ userId, conversationId, unread }] }` (only trainees with unread), from the new `listUnreadByTraineeForAdmin`; its tests live in `chat-routes.test.ts` and the typing route tests in `typing-route.test.ts`, next to the other chat route tests.
- KAN-118: the admin inbox row has no "đang nhập…" preview. The inbox is a server-rendered list refreshed by `InboxLiveRefresh`, which only subscribes to the inbox channel; typing events travel on the conversation channels, so there is no live per-row typing data. Skipped rather than adding a second Ably subscription per row. The indicator is in the thread only (admin and trainee). It hides 5 s (`TYPING_EXPIRY_MS`, not 4 s) after the last typing event, or when the peer's next message arrives. Typing is sent only while the Ably connection is `connected`; polling-only mode sends and shows nothing. The live admin badge is `AdminUnreadBadge` (in `UnreadBadge/index.tsx`) on the dashboard header messages icon: it polls `?as=admin` every 15 s and refetches at once on the `chat:unread-refresh` window event that `InboxLiveRefresh` fires after each inbox event or tick (so on the inbox page itself and wherever both are mounted). `useChatUnread` gained `role` and `initialCount` arguments. Pure helpers `parseTypingEvent` and `isPeerTyping` are in `typing-rules.ts`. No e2e added; KAN-125 covers it (the indicator needs Ably).
