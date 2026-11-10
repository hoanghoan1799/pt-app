# Spec: Realtime chat between trainees and PTs

KAN-96 (sub-tasks KAN-97..102 phase 1, KAN-103..105 phase 2, KAN-106..108 phase 3; see section 12). Intent: `intent/2026-11-04-realtime-chat.md`.

Status: **approved 2026-11-04** (grill-me D1-D12, plan `docs/specs/realtime-chat.plan.md`).

## 1. Today

- Trainees and PTs talk outside the app (Zalo, Messenger). Nothing in pt-app links a question to a workout day or meal.
- One-way notes already exist and stay: `workout_days.note` (PT to trainee, per day), `nutrition_targets.note`, `meal_marks.note` (trainee to PT, per meal).
- `admins` is a flat list of PT accounts. **Trainees are not assigned to a PT**: every admin sees and manages every trainee.
- Auth: signed JWT cookies (`services/session-token.ts`), `requireUser()` / `requireAdmin()` in `services/auth-guard.ts` (both redirect; there is no variant that returns 401 for API calls). `proxy.ts` guards page routes only, not `/api/*`.
- Rate limiting: `login_attempts` table + `services/login-limiter.ts` (shared across serverless instances via Turso). Login-specific rules (fail count, lock).
- PWA: `public/sw.js` (hand-written, no push handler), trainee and admin manifests. iOS only allows web push for a home-screen app (iOS 16.4+).
- `PRAGMA foreign_keys` is never enabled, so `onDelete: cascade` does not fire; delete paths remove child rows by hand (`features/members/services/member-actions.ts`).
- Hosting: Vercel Hobby (serverless functions, no long-lived process), Turso (libSQL) free tier.

## 2. User stories and scope

| #   | Story                                                                                                                    | Phase |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----- |
| S1  | As an admin, I turn chat on or lock it for a trainee at any time; chat is off by default (Hoan, 2026-11-04).             | 1     |
| S2  | As an allowed trainee, I send a text message to my PT from a "Nhắn tin" tab and see replies appear without reloading.    | 1     |
| S3  | As an admin, I see an inbox of all trainee conversations, newest first, with unread counts, and answer from it.          | 1     |
| S4  | As an admin, I see and answer the conversation on the member page next to the trainee's plan.                            | 1     |
| S5  | As a trainee or admin, I see an unread badge on the tab / dashboard without opening the chat.                            | 1     |
| S6  | As a trainee or admin, I scroll back through the whole history (paged, 30 per page).                                     | 1     |
| S7  | As either side, I see "Đã xem" on my last message once the other side read it.                                           | 1     |
| S8  | As either side, I get a phone notification for a new message when the app is closed (installed PWA, permission granted). | 2     |
| S9  | As either side, I send a photo (e.g. of a meal or form check), max 1 image per message.                                  | 3     |
| S10 | As a sender, I delete (unsend) my own message within 15 minutes; it shows "Tin nhắn đã thu hồi".                         | 3     |
| S11 | As an admin, I hide an abusive message from a trainee and can lock chat for that trainee (moderation = S1 + hide).       | 3     |

Out of scope: group chat, trainee-to-trainee chat, calls, typing indicators, message search, reactions, editing messages, end-to-end encryption, AI replies.

### Permission rule (S1)

- New column `users.chat_enabled` (integer boolean, nullable, null = off). Every existing trainee starts **locked**.
- Locked trainee: no "Nhắn tin" tab if they never had a conversation. If they have history, the tab stays and shows it **read-only** with a banner "PT đã tạm khoá nhắn tin" (D5).
- Every send checks `chat_enabled` on the server (both directions, D6); the UI state is only a hint.
- Admin toggles it on the member page (a switch in the chat panel) and from the inbox row menu. The toggle is an admin server action with `requireAdmin()` + Zod, and it is effective on the trainee's next poll or send (no session change needed).
- Optional audit: `chat_enabled_changed_at` + `chat_enabled_by_admin_id` (nullable) so the inbox can say "Khoá bởi <admin> lúc ...".

## 3. Conversation model: shared PT inbox

Because trainees have no assigned PT, one conversation per trainee is shared by **all admins** (a team inbox). Each admin message shows the admin's username. Read state is tracked per admin, so admin A reading does not clear admin B's badge.

If Hoan wants 1:1 with a specific PT later, add a nullable `users.coach_admin_id` and filter the inbox by it; the tables below already support it.

## 4. Data model (additive only)

```ts
// One conversation per trainee (S2/S3).
chat_conversations: {
  id: integer pk autoincrement,
  user_id: integer not null unique -> users.id,
  last_message_id: integer nullable,      // denormalised for the inbox sort + preview
  last_message_at: integer timestamp_ms nullable,
  created_at
}
index (last_message_at desc)

chat_messages: {
  id: integer pk autoincrement,           // monotonic: the poll cursor
  conversation_id: integer not null -> chat_conversations.id,
  sender_role: text enum("user","admin") not null,
  sender_admin_id: integer nullable -> admins.id,   // null when sender_role = user
  body: text not null default "",         // 1..2000 chars after trim (Zod)
  attachment_url: text nullable,          // phase 3
  attachment_meta: text nullable,         // phase 3, JSON {w,h,bytes,mime}
  client_id: text not null,               // uuid from the client: idempotent retries
  deleted_at: integer timestamp nullable, // unsend (S10)
  hidden_by_admin_id: integer nullable,   // moderation (S11)
  created_at: integer timestamp_ms not null
}
unique (conversation_id, client_id)
index (conversation_id, id)

// Read cursor per reader. reader_key = "user" or "admin:<id>".
chat_reads: {
  conversation_id: integer not null,
  reader_key: text not null,
  last_read_message_id: integer not null default 0,
  updated_at
}
primary key (conversation_id, reader_key)

// Phase 2.
push_subscriptions: {
  id: integer pk,
  owner_key: text not null,               // "user:<id>" or "admin:<id>"
  endpoint: text not null unique,
  p256dh: text not null,
  auth: text not null,
  user_agent: text not null default "",
  created_at, last_success_at nullable
}
index (owner_key)

users: + chat_enabled integer(boolean) nullable,
       + chat_enabled_changed_at integer timestamp nullable,
       + chat_enabled_by_admin_id integer nullable
```

Notes:

- Unread count = `count(*) where conversation_id = ? and id > last_read_message_id and sender_role != <me>`. With the `(conversation_id, id)` index this is cheap; the inbox does it in one grouped query.
- `client_id` makes a retried send (flaky mobile network) a no-op instead of a duplicate (lesson from KAN-40/52: handle bad and repeated input at the boundary).
- Member delete must delete `chat_reads`, `chat_messages`, `chat_conversations` and the trainee's `push_subscriptions` by hand (no FK cascade, see section 1). Deleting an admin keeps their messages; the UI shows "PT (đã xoá)" when `sender_admin_id` no longer resolves.
- Retention: keep everything for now (open question Q6).

## 5. Realtime transport options

Constraint: Vercel functions are short-lived and do not share memory, so there is no in-process pub/sub, and a native WebSocket server cannot run on Vercel functions.

| Option                                              | How                                                                                                                                                     | Latency   | Cost at pt-app scale (tens of trainees)                                                                                                                    | Effort / risk                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Adaptive polling** (route handler + Turso)     | `GET /api/chat/messages?after=<id>` every 3 s while the chat is open and visible; badge poll every 30-60 s on other pages; stop when the tab is hidden. | 0-3 s     | $0: function invocations and Turso row reads stay far inside the free tiers (estimate in section 10).                                                      | Lowest. No vendor, no secret, works on every browser and in e2e. Wasted requests when idle.                                                                  |
| B. SSE from a Vercel function                       | Stream held open; the function itself polls Turso every 1-2 s and pushes new rows.                                                                      | 1-2 s     | Each open chat holds a function for up to its max duration; billed by active CPU + memory time. Still polls Turso inside.                                  | Medium. Needs reconnect logic at the duration limit; no gain over A without a pub/sub backend.                                                               |
| **C. Hosted pub/sub: Ably** / Pusher Channels       | Server action inserts the row, then publishes to channel `conversation-<id>`; clients subscribe with a token minted by our route (private channels).    | <300 ms   | Free tiers (check current limits: Ably and Pusher both offer free plans with ~100-200 concurrent connections and daily/monthly message caps) cover pt-app. | Medium. New vendor + 2 secrets, token auth route, fallback to polling when the socket drops. Lock-in limited to a thin `ChatTransport` adapter.              |
| D. Supabase Realtime                                | Broadcast channel (we would not move the DB, so no Postgres changes feed).                                                                              | <300 ms   | Free tier, but the project pauses after inactivity.                                                                                                        | Medium. A second platform account only for sockets; pausing is a real risk for a small app.                                                                  |
| E. Upstash Redis                                    | Redis pub/sub needs a long-lived subscriber; with REST you end up polling a list (= option A with another store).                                       | same as A | Free tier.                                                                                                                                                 | Adds a store without removing polling. Useful only as a rate-limit store later.                                                                              |
| F. Own WebSocket server (Fly.io / Railway / Render) | Node `ws` or Socket.IO process, verifies our JWT cookie (needs a shared `SESSION_SECRET` and a same-site domain).                                       | <100 ms   | ~$0-5/month, but free tiers sleep or are gone; second deploy target.                                                                                       | Highest. Cross-origin cookies on `*.vercel.app` do not work, so it needs a custom domain or a token handshake. Overlaps with the parked NestJS API (PR #63). |

### Recommendation (updated after D3)

**Phase 1: option C with Ably, plus a polling fallback, behind a `ChatTransport` interface. Phase 2 adds Web Push.**

Hoan requires instant delivery (D3), which rules out polling as the main path. Ably over Pusher: a larger free plan (Ably Free, checked 2026-11-04: 6M messages/month, 200 concurrent connections, 200 channels, 500 msg/s; Pusher's free plan is smaller), token auth with per-channel capabilities, connection-state recovery, and an official JS SDK for the browser and for serverless REST publish. Supabase (pauses when idle) and an own WebSocket host (second deploy target, overlaps the parked PR #63) cost more effort for no gain at this scale.

How it works:

- **Send** stays a server action: validate, check `chat_enabled`, insert into Turso (the source of truth), then publish the message to Ably channel `chat:conversation:<id>` with the REST client. If the publish fails, the message is still saved and clients catch up via the fallback.
- **Receive**: the client subscribes with a short-lived Ably token (15 min TTL) minted by our route `GET /api/chat/ably-token`, guarded by `getApiUser`/`getApiAdmin`. Capabilities: a trainee gets `subscribe` on its own conversation channel and `chat:user:<id>` only; an admin gets `subscribe` on `chat:conversation:*` and `chat:inbox`. Nobody gets `publish`: only the server publishes, so a client cannot inject or spoof messages.
- **Badges**: the server also publishes a small event to `chat:inbox` (admins) and `chat:user:<id>` (trainee), so unread badges update instantly on any page.
- **Read receipts** ("Đã xem"): the mark-read action publishes a `read` event on the conversation channel.
- **Fallback**: on connect and reconnect the client fetches `GET /api/chat/messages?after=<lastId>` to fill gaps. While Ably reports `suspended`/`failed`, the client polls every 5 s. With no `ABLY_API_KEY` (local dev, e2e) the transport is polling only (3 s), so dev and CI need no vendor account.
- **Locking (D1, D6)**: the server publishes a `locked` event, refuses new tokens for that trainee, and rejects sends in both directions; an old token only lets the trainee hear events until it expires.

Expected delivery latency: typically well under a second.

Polling details (fallback and e2e): fetch `after=<lastId>`, immediately on `focus`, `online` and after own send; the handler reads `last_message_id` first and returns `204` when nothing is newer. Route handlers for reads (server actions are POST and serialised per client); sends stay server actions.

## 6. Auth, session and rate limiting reuse

- New guards in `services/auth-guard.ts`: `getApiUser()` / `getApiAdmin()` that return `null` instead of redirecting; route handlers answer `401` JSON. Same staleness check (`passwordChangedAt`) as today.
- Every chat read/write checks ownership: a trainee only ever reaches their own conversation (looked up by `user.id`, never by an id from the client); an admin reaches any conversation.
- Sends validate with Zod: `body` trimmed 1..2000 chars, `clientId` uuid; reject when `chat_enabled` is not true (error message "PT đã tạm khoá nhắn tin").
- Errors go through `services/action-errors.ts` (generic message + reference id in production).
- No rate limit on sending messages (D13, Hoan 2026-11-04): chat is only open to trainees an admin enabled, and the admin can lock a trainee at any time. The `rate_limits` table added in KAN-97 stays unused (dropping it would not be additive). The polling client still never polls faster than 3 s.
- Push subscribe/unsubscribe endpoints use the same guards.

## 7. Security and privacy

- Messages are personal health data (food, weight, injuries). Stored in Turso like the rest; never logged (`services/logger.ts` logs ids and counts only, never `body`).
- Render bodies as plain text (React escapes; no `dangerouslySetInnerHTML`, no Markdown). Links are shown as plain text in phase 1 (D9).
- Service worker must keep **not** caching `/api/chat/*` (D3 of the PWA spec already excludes `/api`); add an e2e assert.
- Push payloads carry only "Bạn có tin nhắn mới từ PT" / "<Tên học viên> vừa nhắn tin" and the conversation URL, never the message body (lock-screen privacy on shared phones).
  - **Changed 2026-11-09 (owner request, Hoan):** the push title is now the sender name and the body a preview of the message (line breaks kept, spaces collapsed, max 500 characters; the OS shows the full text on long-press), or a kind label ("Đã gửi ảnh", "Đã gửi sticker", "Đã gửi liên kết"). The body is still never logged.
- Attachments (phase 3): images only (jpeg/png/webp/heic), max 5 MB, re-encoded/resized server-side or validated by magic bytes; stored in Vercel Blob under unguessable keys; served through our route that checks the session (no public bucket listing).
- Admin moderation: hide a message (kept for audit, shown as "Tin nhắn đã bị ẩn"), lock chat (S1). No automatic content filtering.
- Locking chat does not delete history; deleting the member deletes it (section 4).
- **Transport and DevTools (decided 2026-11-10, Hoan: keep as is).** All traffic is HTTPS, so bodies are encrypted in transit. The browser DevTools Network tab shows the signed-in user's own already-decrypted responses; that is not a leak, and encrypting the payload again in client JS would not help because the key would have to live in the same browser. Options weighed and not taken for now: AES-GCM encryption at rest for `chat_messages.body`, dropping the body from Ably events (signal only, client fetches), and end-to-end encryption (rejected: breaks super admin read access from the terms, server-side search, push previews, and loses history when a device loses its key). Revisit if the DB or a third party (Ably) becomes a concern.

## 8. UX

Reference (D12): the DM pattern of short-video apps such as TikTok, which most trainees already know. We borrow interaction patterns, not visuals or assets:

- Inbox rows: round avatar (initials, since there are no photos), name, one-line preview "Bạn: ..." for own messages, relative time ("2 phút", "Hôm qua"), bold row + accent dot when unread.
- Thread: rounded bubbles, consecutive messages from the same sender grouped with tighter spacing and the avatar only on the last bubble of a run; a centred time stamp when more than 15 minutes pass between messages.
- Status line under the last own message only: "Đã gửi", then "Đã xem" (S7).
- Composer: one pill-shaped input, send arrow appears only when there is text; phase 3 adds the photo button on the left.
- Long-press a bubble: menu "Sao chép", "Thu hồi" (own, within 15 min, phase 3), "Ẩn" (admin, phase 3). Phase 1 ships "Sao chép" only.
- New message while scrolled up: a floating "Tin nhắn mới ↓" chip instead of jumping.
- Out of scope for now (possible later): emoji reactions, typing indicator, stickers, voice notes.

Trainee (390 px first):

- Tab bar goes from 3 to 4 tabs: Lịch tập, Dinh dưỡng, **Nhắn tin**, Tổng kết. The tab and route `/messages` exist only when chat is enabled or history exists (S1). Unread count as a red dot with a number on the icon.
- Chat screen: header "PT của bạn"; bubbles (mine right, accent colour; PT left with the admin's name above the first bubble of a run); day separators ("Hôm nay", "Hôm qua", dd/MM); "Đã xem" under my last read message; composer pinned above the tab bar and the keyboard (`env(safe-area-inset-bottom)`, `visualViewport` resize); send disabled while empty; optimistic bubble with "Đang gửi…" then "Gửi lại" on failure (same `clientId`).
- Older messages load when scrolling to the top ("Xem tin cũ hơn").
- Locked state: banner "PT đã tạm khoá nhắn tin", composer hidden.
- Phase 2: a one-time card "Bật thông báo để không lỡ tin nhắn từ PT" (only in the installed app on iOS; explains the steps otherwise).

Admin:

- New page `/admin/messages`: list of conversations sorted by last message, unread bold with count, filter "Chưa đọc", trainee name, preview (first 80 chars), time, lock icon when locked. Trainees with chat enabled but no messages are listed under "Chưa có tin nhắn".
- Member page `/admin/users/[id]`: a "Nhắn tin" section with the same thread component and the **chat on/lock switch** (S1).
- Admin dashboard: a "Tin nhắn chưa đọc" stat tile linking to the inbox; admin header link with badge.
- Admin has no tab bar today; the inbox link goes in the admin page header next to existing navigation.

Shared components in `features/chat/components`: `ChatThread`, `MessageBubble`, `Composer`, `UnreadBadge`, `ChatLockSwitch`.

## 9. Existing behaviour to revisit (revise-existing-features rule)

| Existing                                          | Proposal                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workout_days.note` (PT to trainee per day)       | **Keep.** It is an instruction tied to a day, not a conversation. Later: a "Hỏi PT về buổi này" button that prefills chat with a link to the day (phase 3, optional).           |
| `meal_marks.note` (trainee to PT per meal)        | **Keep**, but surface it in the admin inbox as a system line ("Đã ghi chú bữa trưa 04/11") so the PT sees feedback in one place (phase 3, optional; not in the dashboard, D10). |
| `users.food_note` (trainee meal request)          | **Keep** (structured input for the meal plan).                                                                                                                                  |
| `RecentActivityList` on the admin dashboard       | **Keep as is** (D10): messages live in the inbox.                                                                                                                               |
| Tab bar with 3 tabs                               | **Change** to 4 (section 8). Check that labels still fit at 320 px.                                                                                                             |
| "Contact your PT on Zalo" habit (outside the app) | Nothing in the app to remove. README gets a "Nhắn tin với PT" section.                                                                                                          |

## 10. Cost estimate (Ably + polling fallback + Web Push)

Worst case if the app had to poll all the time (fallback). Assume 30 trainees, each with chat open 10 minutes a day, 3 admins with the inbox open 1 hour a day.

- Chat polling: 30 × 600 s / 3 s ≈ 6,000 requests/day; admin inbox ≈ 3 × 3,600 / 3 ≈ 3,600/day; badges ≈ 30 × 4 h × 80/h ≈ 10,000/day. Total ≈ 20k requests/day ≈ 600k/month, each a few ms of CPU and 1-3 row reads.
- Turso: ≈ 600k × ~3 rows ≈ 2M row reads/month; writes are just messages. Both well inside the free tier.
- Vercel Hobby: function invocations and active CPU well inside the included usage. pt-app is non-commercial (D2), so Hobby's terms fit.
- Web Push: free (browser push services). Library `web-push` (MIT), VAPID keys as two env vars.
- Phase 3 images: Vercel Blob free storage/transfer is small; at ~200 KB per resized image, 1,000 images ≈ 200 MB. Check the Blob quota or keep attachments out (Q5).
- Ably Free (6M messages/month, 200 concurrent connections): pt-app sends at most a few thousand messages and events a month, and 200 connections covers every trainee and admin online at once. $0. Above that the next Ably tier is paid; re-check then.
- The polling numbers above only apply while Ably is down, so they are a worst case.

Expected monthly cost: **$0** for phases 1-2.

## 11. Impact on the parked NestJS/admin split (PR #63)

Not started and not to be started by this work. Design choices that keep the split cheap later:

- All chat logic in `features/chat/services` (pure functions over `db`) and `utils/` rules, called by thin route handlers and server actions. These move into `apps/api` as a NestJS module with little change.
- The message API contract (`GET messages?after`, `GET unread`, `POST send`, `POST read`) is a plain JSON API, so the split's BFF can proxy it; Ably stays the realtime layer after the split (the API publishes instead of the server action); a NestJS WebSocket gateway is optional then.
- The `ChatTransport` client interface hides polling vs socket, so moving transports touches one adapter.

## 12. Phased Jira breakdown (filed 2026-11-04 under KAN-96)

Parent Story: **"Trainees and PTs chat in the app"** (user stories S1-S11, link to this spec). Sub-tasks:

Phase 1: instant text chat with permission and badges (~5-6 days)

- **[BE] Chat schema and permission flag** – tables `chat_conversations`, `chat_messages`, `chat_reads`, `rate_limits`; `users.chat_enabled*` columns; member delete cleans chat rows. Done: `db:push` on local SQLite, unit tests for delete path.
- **[BE] Ably realtime transport** – `ABLY_API_KEY` in `services/env.ts`, token route with per-role capabilities, publish after send/read/lock, a failed publish never fails the send. Done: unit tests for the capability builder and channel names.
- **[BE] Chat services and API** – `getApiUser/getApiAdmin`, send (Zod, `chat_enabled` check, idempotent `clientId`), list with cursor, mark read, unread counts, admin inbox query, admin toggle action. Done: unit tests per rule in section 14.
- **[FE] Trainee chat tab** – 4th tab, `/messages`, thread, composer, optimistic send/retry, `ChatTransport` (Ably + polling fallback), unread badge, locked state.
- **[FE] Admin inbox, member chat panel and lock switch** – `/admin/messages`, member page section, dashboard tile, header badge.
- **[QA] Chat e2e and browser proof** – Playwright specs (section 14), browser proof at 390 px for trainee and admin, artifact.

Phase 2: notifications (~2-3 days)

- **[BE] Web Push** – VAPID env vars, `push_subscriptions`, subscribe/unsubscribe routes, send push after a message (fire-and-forget, drop subscriptions that return 404/410).
- **[FE] Push opt-in and service worker** – `push` + `notificationclick` handlers in `sw.js`, opt-in card, iOS install hint reuse.
- **[QA] Push checks** – unit tests for payload/cleanup; manual check on a real Android and an installed iPhone (Hoan).

Phase 3: attachments and moderation (~3 days, only if confirmed)

- **[BE] Image upload** – Vercel Blob, type/size validation, guarded download route.
- **[BE] Unsend and hide** – 15-minute unsend, admin hide.
- **[FE] Photo picker, image bubble, unsend/hide menus.**
- **[QA] Attachment and moderation e2e.**

Each sub-task: own branch `feat/KAN-<n>-...`, plan approved before code, PR per sub-task, Jira moved In Progress → In Review → Done as work goes (dojo developer flow: analyze, plan, fix, verify in tests and browser, ship, `/code-review` then human review).

## 13. Decision log (grill-me)

| #   | Decision                                                                                                                                                     | Source           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| D1  | Chat is off by default; an admin enables or locks it per trainee at any time; only allowed trainees can message admins.                                      | Hoan, 2026-11-04 |
| D2  | pt-app is non-commercial, so Vercel Hobby and free tiers are fine (Q4).                                                                                      | Hoan, 2026-11-04 |
| D3  | Delivery must be instant (Q9): phase 1 uses Ably (option C); polling is only the fallback when the socket is down, and the transport in local dev/e2e.       | Hoan, 2026-11-04 |
| D4  | Shared PT inbox: all admins see and answer every enabled trainee's chat; read state per admin (Q1).                                                          | Hoan, 2026-11-04 |
| D5  | A locked trainee keeps read-only access to old messages with the banner "PT đã tạm khoá nhắn tin" (Q2).                                                      | Hoan, 2026-11-04 |
| D6  | Locking blocks both directions: admins cannot send to a locked trainee either (Q3).                                                                          | Hoan, 2026-11-04 |
| D7  | Photo attachments come in phase 3 (Q5).                                                                                                                      | Hoan, 2026-11-04 |
| D8  | History is kept forever; it is deleted only when the member is deleted (Q6).                                                                                 | Hoan, 2026-11-04 |
| D9  | Links in messages are plain text in phase 1 (Q7).                                                                                                            | Hoan, 2026-11-04 |
| D10 | Messages and meal notes stay in the inbox; the dashboard activity list is unchanged (Q8).                                                                    | Hoan, 2026-11-04 |
| D11 | No quiet hours for push; the phone's Do Not Disturb covers it (Q10).                                                                                         | Hoan, 2026-11-04 |
| D12 | UX follows the familiar short-video-app DM pattern (Hoan cited TikTok's inbox as the reference): see section 8. Patterns only, no copied assets or branding. | Hoan, 2026-11-04 |
| D13 | No rate limit on sending chat messages; access control is the per-trainee switch (D1) and the lock (D6).                                                     | Hoan, 2026-11-04 |

Grill-me finished 2026-11-04: round 1 (Q1-Q6, Q9) and round 2 (Q7, Q8, Q10) all answered. No open questions left.

## 14. Test matrix

| Case                                                                                                                        | Level         | Expected                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| Body empty / only spaces / 2001 chars                                                                                       | unit          | rejected by Zod                                                          |
| Same `clientId` sent twice                                                                                                  | unit          | one row, second call returns the first message                           |
| Trainee with `chat_enabled` null or false sends                                                                             | unit          | rejected, "PT đã tạm khoá nhắn tin"                                      |
| Admin sends to a locked trainee (D6)                                                                                        | unit          | rejected (D6)                                                            |
| Trainee asks for another trainee's conversation id                                                                          | unit          | impossible: trainee routes take no conversation id; API returns own only |
| Unread count: own messages ignored, per-admin read cursors                                                                  | unit          | admin A reading does not clear admin B                                   |
| No send limit (D13): many messages in a row                                                                                 | unit          | all stored                                                               |
| Member delete removes conversation, messages, reads, subscriptions                                                          | unit          | no orphan rows                                                           |
| `GET messages` without session                                                                                              | e2e           | 401 JSON, no redirect                                                    |
| Admin enables chat → trainee sees tab → sends → admin inbox shows it unread → admin replies → trainee sees reply within 5 s | e2e           | exact message texts asserted, unread counts asserted                     |
| Admin locks chat → trainee composer hidden, banner shown, send via API rejected                                             | e2e           | specific banner text and 4xx status                                      |
| Trainee token: only `subscribe` on own channels; locked trainee gets 403                                                    | unit          | exact capability object asserted                                         |
| Never-enabled trainee                                                                                                       | e2e           | no "Nhắn tin" tab, `/messages` redirects to `/workouts`                  |
| Service worker does not cache `/api/chat/*`                                                                                 | e2e           | response not in Cache Storage                                            |
| Push payload has no message body                                                                                            | unit          | `push-rules.test.ts`: exact payload fields for both roles (KAN-103)      |
| Push subscription returning 404/410 is deleted, 500 kept                                                                    | unit          | `chat-push.test.ts` (KAN-103)                                            |
| Push endpoint outside FCM/Apple/WNS/Mozilla rejected (SSRF)                                                                 | unit          | `push-rules.test.ts` `isAllowedPushEndpoint` (KAN-103)                   |
| Push opt-in card shows once (trainee chat, admin inbox); iPhone tab gets the install hint                                   | e2e           | `e2e/chat.spec.ts` (KAN-104)                                             |
| Real devices                                                                                                                | manual (Hoan) | checklist below (KAN-105)                                                |

### Push: real-device checklist (KAN-105)

Run on production (or a Vercel preview) after the VAPID variables are set. Needs one trainee with chat enabled and one admin account.

| #   | Device and step                                                                                                    | Expected                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1   | Android Chrome, trainee: open the site, go to Nhắn tin, tap "Bật thông báo", allow                                 | card disappears; no error line                                                                             |
| 2   | Close Chrome (or lock the phone); admin replies from the member's chat tab                                         | notification "PT App / Bạn có tin nhắn mới từ PT" within a few seconds; no message text on the lock screen |
| 3   | Tap the notification                                                                                               | app opens on `/messages` with the reply visible                                                            |
| 4   | iPhone (iOS 16.4+) Safari tab, trainee: open Nhắn tin                                                              | card shows the "Thêm vào MH chính" steps, no enable button                                                 |
| 5   | Add to Home Screen, open the installed app, Nhắn tin, "Bật thông báo", allow                                       | card disappears                                                                                            |
| 6   | Swipe the app away; admin replies                                                                                  | notification arrives; tapping it opens the chat                                                            |
| 7   | Admin (any device, installed admin app on iPhone): Tin nhắn inbox, "Bật thông báo", allow; trainee sends a message | notification "<Tên học viên> vừa nhắn tin"; tap opens `/admin/users/<id>/messages`                         |
| 8   | iPhone Settings → Notifications → turn the app off, trainee/admin sends again                                      | no notification; the chat itself still updates when opened                                                 |

If a step fails, note the device, OS version and step number on KAN-105.

e2e runs on the existing throwaway SQLite (`e2e/.tmp`), without `ABLY_API_KEY`, so it exercises the polling transport with no vendor mock; the Ably path is covered by unit tests (token capabilities, publish payloads) and a manual check on the Vercel preview. Polling intervals are constants that e2e can shorten via an env var.

## 15. CI/CD and deployment

- CI unchanged (test, lint, typecheck, e2e). New e2e specs must keep the e2e job under 3 minutes (shorter poll interval in e2e).
- Schema additive only: the Vercel build's `drizzle-kit push` creates the new tables and nullable columns. Existing trainees get `chat_enabled = null` (locked), so nothing changes for them until an admin enables chat.
- Phase 1 env var: `ABLY_API_KEY` (server only, never `NEXT_PUBLIC_`), set in Vercel by Hoan; missing = polling-only transport, logged once as a warning. Not needed in CI.
- Phase 2 env vars: `VAPID_PUBLIC_KEY` (also exposed as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto). Added to `.env.example` (empty) and `services/env.ts`; set in Vercel by Hoan. Push is skipped, not failed, when they are missing.
- Rollout: phase 1 ships behind the per-trainee flag, which is itself the feature flag: Hoan enables one test trainee first.

## 16. Risks

| Risk                                                          | Mitigation                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Ably outage or free-plan limit reached                        | Turso is the source of truth; the polling fallback keeps chat working with a 5 s delay. |
| Ably key leaks                                                | Server-only env var; clients only get short-lived subscribe-only tokens.                |
| iOS push only in installed app; many trainees use Safari tabs | Install banner already exists (KAN-79); badge on next open still works.                 |
| Duplicate messages on flaky mobile networks                   | `clientId` unique per conversation.                                                     |
| Personal data on lock screens                                 | Push payload without body.                                                              |
| No FK cascade leaves orphan chat rows                         | Explicit delete in member delete path + unit test.                                      |
| Admin expects chat to be on for everyone after deploy         | Release note: chat is off by default; enable per trainee on the member page.            |
| Keyboard covering the composer on iOS                         | `visualViewport` handling + browser proof at 390 px.                                    |
| Vercel Hobby limits/terms change                              | Non-commercial (D2); re-check limits yearly.                                            |
