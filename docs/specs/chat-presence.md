# Chat presence: online status and last seen (KAN-127)

Sub-tasks: KAN-128 (backend, this doc), KAN-129 (client heartbeat + status UI), KAN-130 (e2e / polish).

## Goal

Show whether the other side of a chat is online, or when they were last active.
Admin sees the trainee in the thread header and inbox rows; the trainee sees the PT side.

## Decisions

- Online = the app is open and visible on any page. The client beats every 60 s while visible (`PRESENCE_HEARTBEAT_MS`).
- Online when the last heartbeat is under 2 min old (`PRESENCE_ONLINE_MS`), so one missed beat does not flicker.
- Shared inbox: the trainee sees the PT side online when ANY admin is online, otherwise the most recent admin last-seen.
- Status refreshes with the existing chat sync (polling / Ably-triggered fetch). No new realtime channel.

## Data model

Additive, nullable `last_seen_at` (integer, `timestamp` mode = whole seconds) on `users` and `admins`.

## API

- `POST /api/presence` (trainee session) and `POST /api/presence?as=admin` (admin session): one conditional UPDATE that writes only when `last_seen_at` is null or at least 60 s old. 204, `Cache-Control: no-store`; 401 without a session.
- `GET /api/presence/peer`: trainee. `{ "peerLastSeenAt": ISO | null }`, newest across all admins.
- `GET /api/presence/peer?as=admin&userId=N`: admin. Same shape for that trainee. 400 invalid `userId`, 404 unknown user, 401 without session.
- Piggybacked on existing data (non-204 responses only; the `/api/chat/messages` 204 fast path is unchanged):
  - `GET /api/chat/messages` payload (`ThreadPayload`) has `peerLastSeenAt`; the trainee page snapshot too.
  - `GET /api/admin/chat/:conversationId/messages` has `peerLastSeenAt` (trainee); the admin thread page passes it in `initial.peerLastSeenAt`.
  - Admin inbox: `InboxItem.lastSeenAt` and `InboxWithoutConversation.lastSeenAt` (`Date | null`).
- Because the 204 carries no presence, the FE refreshes status with `GET /api/presence/peer` every 60 s while visible.

## Display (`features/chat/utils/presence.ts`)

`formatLastSeen(lastSeenAt, now, timeZone)`: "Đang hoạt động" (< 2 min), "Hoạt động N phút trước" (2-59 min, same local day), "Hoạt động N giờ trước" (same local day), "Hoạt động hôm qua", "Hoạt động dd/MM", "Hoạt động dd/MM/yyyy" (other year), null when never seen (UI hides the line). Local day uses `TIME_ZONE` (Asia/Ho_Chi_Minh).

## Privacy

Only the relative text is shown, never an exact time. The API returns the raw timestamp only to the authenticated other side of a conversation (admins, or the trainee for the PT team). Trainees never see another trainee's presence.

## Test matrix

| Ticket  | Case                                                                                                           | Level          |
| ------- | -------------------------------------------------------------------------------------------------------------- | -------------- |
| KAN-128 | 119 s online, 120 s "2 phút trước"; 59/60 min; local midnight; year boundary; null                             | unit           |
| KAN-128 | POST 401/204/no-store; `as=admin` stamps admins only; 60 s write throttle                                      | route          |
| KAN-128 | peer GET: trainee gets max admin; admin gets trainee; 400/404/401                                              | route          |
| KAN-128 | messages payloads carry `peerLastSeenAt`; 204 path unchanged; inbox `lastSeenAt`                               | route/service  |
| KAN-129 | heartbeat only while visible, every 60 s, stops when hidden; header and inbox render status; peer poll refresh | unit/component |
| KAN-130 | admin heartbeat shows "Đang hoạt động" to the trainee and the reverse; last-seen text after going idle         | e2e            |
