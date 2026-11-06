# Notification centre and activity push

**Status: Pending.** Hoan (2026-11-06): skip notifications for everything except chat for now. Do not build until Hoan revives it.

KAN: story KAN-147; sub-tasks KAN-148 [BE], KAN-149 [FE], KAN-150 [QA]. Related: `docs/specs/chat-ux-v2.md` (reaction push, C7).

Source: Hoan, 2026-11-06: push notifications for the activity users need to know about (meal plan, new workouts, ...); a bell with the unread count; tapping it shows the 5-10 newest, each can be read on tap, "read all", and "view all" opens the full list.

## What exists

- Web Push for new chat messages only (KAN-103..105): `push_subscriptions`, `sendChatPush`, service worker push handler, opt-in card and toggle.
- Chat has its own unread badge on the "Nhắn tin" tab and the admin header.

## Decisions (defaults; grill-me round 3 pending)

- N1. One `notifications` table (additive): id, recipient_key (`user:<id>` / `admin:<id>`), type, title, body, link, dedupe_key, created_at, read_at. Index on (recipient_key, id).
- N2. Events for trainees: workout for a day assigned or changed; meal plan for a day assigned or changed; chat opened or locked by the PT; reaction on my message. New chat messages keep their own badge and push, and are not duplicated in the centre.
- N3. Events for admins: a trainee finished all exercises of a day; a trainee marked all meals of a day eaten; reaction on my message.
- N4. Coalescing: an unread notification with the same dedupe_key (e.g. `workout:<userId>:<date>`) less than 10 min old is updated instead of adding a new row, and no second push is sent. Admin edits a day five times = one notification.
- N5. Push uses the existing subscriptions and opt-in; one switch for all push types (no per-type settings yet). The push payload carries title and link only, no private details beyond what the title says.
- N6. Bell in the header of both sites, badge capped at "9+". Tap opens a sheet with the 10 newest; tap an item = mark read and open its link; "Đánh dấu đã đọc hết"; "Xem tất cả" opens `/notifications` or `/admin/notifications` (cursor pagination, same actions).
- N7. Count refresh: on focus, every 60 s while visible, and when a push arrives (service worker `postMessage`). No new realtime channel.
- N8. Retention: 60 days; older rows are removed opportunistically on write.
- N9. Old behaviour: `sendChatPush` moves into a shared `services/push` sender used by chat and notifications; the chat push itself is unchanged.

## Open questions (grill-me round 3)

See the thread; answers are recorded here when they come in.

## Test matrix

| Ticket  | Case                                                                                         | Level        |
| ------- | -------------------------------------------------------------------------------------------- | ------------ |
| KAN-148 | coalesce within 10 min, new row after 10 min or after it was read                            | unit/service |
| KAN-148 | list/count/read/read-all scoped to the caller; someone else's id -> 404                      | route        |
| KAN-148 | each event in N2/N3 creates the right type and link; push sent once per coalesced row        | service      |
| KAN-149 | badge cap, empty state, mark read on tap, read all                                           | component    |
| KAN-150 | admin assigns a workout -> trainee bell 1 -> tap opens the day, badge clears; read-all; page | e2e          |
