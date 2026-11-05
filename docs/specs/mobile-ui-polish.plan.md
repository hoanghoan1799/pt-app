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
- The admin app has no change-password page, so the admin avatar menu shows only Đăng xuất for now.

## Proof

- Unit: `use-confirm.test.ts`, `day-completion.test.ts`, `copy-calendar.test.ts`, `theme.test.ts`, `typing-rules.test.ts`, `ably-capabilities.test.ts`, `meal-plan-actions.test.ts`, the admin unread route test.
- e2e: the rows of the spec test matrix; the e2e job stays under 3 minutes.
- `pnpm verify` green on every PR; paste the tail of its output in the PR.
- Browser proof (`browser-proof` skill) in KAN-125: nutrition tab, copy plan, header menus, confirm dialog, admin dashboard and add-user sheet.

## Deviations

- KAN-115: no provider. `useConfirm` reads a module-level store and `ConfirmDialog` is mounted once in `app/layout.tsx`, so any hook can ask without wiring. The dialog is a floating card (16 px gutter) on `BottomSheet`, which gained optional `role`, `isFloating` and `onOpenAutoFocus` props. `use-copy-week` now always prevents the native submit and sends the form data after the confirm resolves. The unit test covers the store only (no DOM test setup). The copy-week and food-entry delete confirms have no e2e yet; KAN-125 adds them.
- KAN-116 (decided 2026-11-05): the admin avatar menu keeps "Đổi mật khẩu" although the admin has no password page yet. Until that page exists it shows a "Tính năng đang cập nhật" toast.
