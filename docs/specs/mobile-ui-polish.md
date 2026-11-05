# Spec: Mobile UI/UX polish

KAN-114 (sub-tasks KAN-115..125). Intent: `intent/2026-11-05-mobile-ui-polish.md`. Plan: `docs/specs/mobile-ui-polish.plan.md`.

Status: **approved 2026-11-05** (prototype and grill-me with Hoan).

## Goal

Make the daily flows on a phone clearer and calmer for trainees and PTs: a nutrition tab that shows progress against the plan, in-app dialogs instead of browser prompts, one consistent header, live chat signals, a safer copy-plan picker, and a tidier admin dashboard. No schema change.

## Decisions

1. Mobile only. No desktop or tablet work and no new dashboard page. Lịch tập (`/workouts`) stays the default tab after login and the tab bar is unchanged.
2. Nutrition tab order is Calendar, Daily goals, Meal plan. The first-time `BodyProfileCard` prompt is unchanged. There is no "Your Stats" section because Tổng kết already has it.
3. Calendar colours: green when every planned meal of the day is marked eaten, yellow when at least one but not all are marked, grey when there is no plan or nothing is marked (past days included). The admin week tabs use the same rule. This replaces `isDayOnTarget` as the source of the colour; the macro check stays in `features/nutrition/utils/nutrition.ts` for other callers.
4. Daily goals: calories stay one line with a bar. Carbs, Protein and Fat are three rings of about 60 px in one row, percent inside, "cur / target g" and "Còn/Vượt x g" below. No caption text.
5. A meal card marked eaten gets the success-green background. Trainees cannot change the foods the PT chose.
6. Per meal, the label "Đã ăn" becomes "Đã ăn thêm ngoài plan" and the block is hidden when that meal has no extra food. The add-extra flow is unchanged (library search plus add food outside the library). The "Đã ăn cả ngày" card is removed. There is no combined extra-food section.
7. Header on both sites: one gear menu (Giao diện: Sáng, Tối, Hệ thống; Thông báo đẩy, reusing the push opt-in) and one avatar menu (Đổi mật khẩu, Đăng xuất with an in-app confirm). Items without a page are hidden: no General, Account or Admin settings and no Edit profile. The admin avatar menu has no Đổi mật khẩu until an admin password page exists. The admin keeps a messages icon with a live unread badge. The theme is stored in a cookie and applied server-side. No schema change.
8. Every `window.confirm` is replaced by a shared `ConfirmDialog` and `useConfirm`. The 11 current sites are listed in the plan.
9. Unread counts are live on both sites (admin through `/api/chat/unread?as=admin`). A typing indicator shows on both sides through Ably typing events, throttled. In polling-only mode there is no indicator.
10. Message edit, recall and delete are deferred to a later story. Recorded for that story: both sides see "(đã sửa)", "Tin nhắn đã được thu hồi" and "Tin nhắn đã bị xóa"; no time limit; keep the edit history. The poll-by-id cursor in `use-chat-transport.ts` needs an extra change event for that work.
11. Copy plan: Monday-first month picker, past days disabled in the UI and rejected on the server, today outlined and labelled "Hôm nay", tomorrow tinted and labelled "Ngày mai", multi-select, and the existing overwrite confirm kept.
12. Change password success redirects (trainee to `/workouts`, admin to `/admin`) and shows a toast. No inline success message.
13. Admin: "Thao tác" tiles (Thêm user, Thư viện món, Tin nhắn); member cards with a per-trainee unread badge; add-user sheet with visible labels and a sticky submit. After create, the sheet grows and the one-time password with "Sao chép" sits at the top, never covered. Food chips keep horizontal scroll and gain a right-edge fade and scroll-snap.
14. Schema: no changes in this story.

## Out of scope

- Desktop and tablet layouts, a new dashboard page, tab bar changes.
- Message edit, recall and delete (decision 10).
- General, Account and Admin settings pages, Edit profile, a "Your Stats" section.
- Trainees changing PT-chosen foods.
- A typing indicator when Ably is not configured.

## Open questions

None blocking. Notes for the build:

- The admin app has no change-password page today, so decision 12's admin redirect to `/admin` applies only if one is added later. This story adds no such page.
- The exact dialog copy (Vietnamese) is chosen in KAN-115 and reviewed in its PR.

## Test matrix

| Acceptance criterion                                                          | Test                                                                                                                          | Sub-task |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| No `window.confirm` remains; destructive actions ask in an in-app dialog      | unit `components/common/ConfirmDialog/__tests__/use-confirm.test.ts`; e2e `confirm dialog replaces window.confirm`            | KAN-115  |
| Day status is green, yellow or grey from marks and plan                       | unit `features/meal-plans/utils/__tests__/day-completion.test.ts` (all, some, none, no plan, past day)                        | KAN-119  |
| Status is returned for the week for trainee and admin tabs                    | unit `features/meal-plans/services/__tests__/meal-log-queries.test.ts`                                                        | KAN-119  |
| Nutrition tab order is Calendar, Daily goals, Meal plan                       | e2e `nutrition tab order`                                                                                                     | KAN-120  |
| Calendar colours follow decision 3                                            | e2e `calendar colours follow marked meals`                                                                                    | KAN-120  |
| Macro rings show percent, "cur / target g" and Còn/Vượt                       | unit `features/nutrition/utils/__tests__/progress-text.test.ts` (ring text); e2e `daily goals rings`                          | KAN-120  |
| Marked meal is green; extra-food block hidden when empty; no all-day card     | e2e `meal card states and extra food block`                                                                                   | KAN-120  |
| Server rejects copy to a past date                                            | unit `features/meal-plans/services/__tests__/meal-plan-actions.test.ts` (`copyDayAction` past date)                           | KAN-121  |
| Month picker is Monday-first, disables past days, marks today and tomorrow    | unit `features/meal-plans/utils/__tests__/copy-calendar.test.ts`; e2e `copy plan month picker`                                | KAN-122  |
| Password change redirects and toasts, no inline success message               | e2e `change password redirects with toast`                                                                                    | KAN-123  |
| Gear menu sets theme (cookie, server-applied) and offers push opt-in          | unit `utils/__tests__/theme.test.ts`; e2e `theme menu persists`                                                               | KAN-116  |
| Avatar menu logs out only after confirm; hidden items are absent              | e2e `avatar menu logout confirm`                                                                                              | KAN-116  |
| Typing events are throttled and scoped to the conversation                    | unit `features/chat/utils/__tests__/ably-capabilities.test.ts` (typing); `features/chat/utils/__tests__/typing-rules.test.ts` | KAN-117  |
| Admin unread route returns the total and per-trainee counts, 401 without auth | unit `app/api/chat/unread/__tests__/route.test.ts`                                                                            | KAN-117  |
| Unread badges update without reload; typing indicator shows and expires       | e2e `chat live badges and typing indicator` in `e2e/chat.spec.ts`                                                             | KAN-118  |
| Admin dashboard tiles, member unread badges, add-user sheet, chip fade        | e2e `admin dashboard quick actions`; e2e `add user shows one-time password at top`                                            | KAN-124  |
| Full flows pass at 390 and 320 px                                             | `pnpm verify`, e2e suite, browser proof artifact                                                                              | KAN-125  |

## Links

- Prototype: https://claude.ai/artifact/GrLoPEkZJwDmsHka4hvyd2
- Jira: KAN-114
- Related spec: `docs/specs/realtime-chat.md`
