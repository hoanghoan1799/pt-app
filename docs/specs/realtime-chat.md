# Spec: Realtime chat between trainees and PTs

KAN-TBD (parent story + [BE]/[FE]/[QA] sub-tasks filed after this spec is approved, see section 12). Intent: `intent/2026-11-04-realtime-chat.md`.

Status: **analysis, not approved**. No code until Hoan approves this spec and the plan (`docs/specs/realtime-chat.plan.md`, written after approval).

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
- Locked trainee: no "Nhắn tin" tab if they never had a conversation. If they have history, the tab stays and shows it **read-only** with a banner "PT đã tạm khoá nhắn tin" (open question Q2).
- Every send checks `chat_enabled` on the server (both directions, see Q3); the UI state is only a hint.
- Admin toggles it on the member page (a switch in the chat panel) and from the inbox row menu. The toggle is an admin server action with `requireAdmin()` + Zod, and it is effective on the trainee's next poll or send (no session change needed).
- Optional audit: `chat_enabled_changed_at` + `chat_enabled_by_admin_id` (nullable) so the inbox can say "Khoá bởi <admin> lúc ...".

## 3. Conversation model: shared PT inbox

Because trainees have no assigned PT, one conversation per trainee is shared by **all admins** (a team inbox). Each admin message shows the admin's username. Read state is tracked per admin, so admin A reading does not clear admin B's badge.

If Hoan wants 1:1 with a specific PT later, add a nullable `users.coach_admin_id` and filter the inbox by it; the tables below already support it (open question Q1).

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
| C. Hosted pub/sub: Ably / Pusher Channels           | Server action inserts the row, then publishes to channel `conversation-<id>`; clients subscribe with a token minted by our route (private channels).    | <300 ms   | Free tiers (check current limits: Ably and Pusher both offer free plans with ~100-200 concurrent connections and daily/monthly message caps) cover pt-app. | Medium. New vendor + 2 secrets, token auth route, fallback to polling when the socket drops. Lock-in limited to a thin `ChatTransport` adapter.              |
| D. Supabase Realtime                                | Broadcast channel (we would not move the DB, so no Postgres changes feed).                                                                              | <300 ms   | Free tier, but the project pauses after inactivity.                                                                                                        | Medium. A second platform account only for sockets; pausing is a real risk for a small app.                                                                  |
| E. Upstash Redis                                    | Redis pub/sub needs a long-lived subscriber; with REST you end up polling a list (= option A with another store).                                       | same as A | Free tier.                                                                                                                                                 | Adds a store without removing polling. Useful only as a rate-limit store later.                                                                              |
| F. Own WebSocket server (Fly.io / Railway / Render) | Node `ws` or Socket.IO process, verifies our JWT cookie (needs a shared `SESSION_SECRET` and a same-site domain).                                       | <100 ms   | ~$0-5/month, but free tiers sleep or are gone; second deploy target.                                                                                       | Highest. Cross-origin cookies on `*.vercel.app` do not work, so it needs a custom domain or a token handshake. Overlaps with the parked NestJS API (PR #63). |

### Recommendation

**Phase 1: option A (adaptive polling), behind a `ChatTransport` interface. Phase 2 adds Web Push. Move to option C (Ably, Pusher as the fallback choice) only if measured need appears** (e.g. more than ~50 active trainees, or Hoan wants sub-second delivery).

Why: chat between a PT and a trainee is not a live game; a 0-3 s delay feels instant in practice. Polling costs nothing, adds no vendor or secret, keeps e2e deterministic, and every piece (route handler, cursor by message id, unread query) is reused if we switch to C later: only the "how do I learn there is something new" part changes. Push notifications (phase 2) cover the case the app is closed, which no socket covers anyway on iOS.

Polling details:

- Client hook `use-chat-messages.ts`: fetch `after=<lastId>` every 3 s while `document.visibilityState === "visible"` and the chat is mounted; back off to 10 s after 2 minutes with no new message; immediately poll on `focus`, `online` and after own send.
- Badge hook `use-chat-unread.ts`: one call every 45 s on any page, paused when hidden; also refreshed on navigation.
- Cheap empty responses: the handler first reads `last_message_id` (one row) and returns `204` when nothing is newer than the cursor and the read cursor did not move.
- Route handlers, not server actions, for reads (server actions are POST and serialised per client). Sends stay server actions.

## 6. Auth, session and rate limiting reuse

- New guards in `services/auth-guard.ts`: `getApiUser()` / `getApiAdmin()` that return `null` instead of redirecting; route handlers answer `401` JSON. Same staleness check (`passwordChangedAt`) as today.
- Every chat read/write checks ownership: a trainee only ever reaches their own conversation (looked up by `user.id`, never by an id from the client); an admin reaches any conversation.
- Sends validate with Zod: `body` trimmed 1..2000 chars, `clientId` uuid; reject when `chat_enabled` is not true (error message "PT đã tạm khoá nhắn tin").
- Errors go through `services/action-errors.ts` (generic message + reference id in production).
- Rate limit: generalise the limiter into a fixed-window counter. Add a table `rate_limits(key pk, count, window_started_at)` (additive; `login_attempts` keeps its lock semantics) and rules in `utils/rate-limit-rules.ts` (pure, unit-tested). Limits: trainee 20 messages/min and 300/day; admin 60/min; poll endpoints not limited per request (they are cheap and authenticated) but the client never polls faster than 3 s.
- Push subscribe/unsubscribe endpoints use the same guards.

## 7. Security and privacy

- Messages are personal health data (food, weight, injuries). Stored in Turso like the rest; never logged (`services/logger.ts` logs ids and counts only, never `body`).
- Render bodies as plain text (React escapes; no `dangerouslySetInnerHTML`, no Markdown). Links are shown as text in phase 1 (open question Q7: auto-link).
- Service worker must keep **not** caching `/api/chat/*` (D3 of the PWA spec already excludes `/api`); add an e2e assert.
- Push payloads carry only "Bạn có tin nhắn mới từ PT" / "<Tên học viên> vừa nhắn tin" and the conversation URL, never the message body (lock-screen privacy on shared phones).
- Attachments (phase 3): images only (jpeg/png/webp/heic), max 5 MB, re-encoded/resized server-side or validated by magic bytes; stored in Vercel Blob under unguessable keys; served through our route that checks the session (no public bucket listing).
- Admin moderation: hide a message (kept for audit, shown as "Tin nhắn đã bị ẩn"), lock chat (S1). No automatic content filtering.
- Locking chat does not delete history; deleting the member deletes it (section 4).

## 8. UX

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

| Existing                                          | Proposal                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workout_days.note` (PT to trainee per day)       | **Keep.** It is an instruction tied to a day, not a conversation. Later: a "Hỏi PT về buổi này" button that prefills chat with a link to the day (phase 3, optional). |
| `meal_marks.note` (trainee to PT per meal)        | **Keep**, but surface it in the admin inbox as a system line ("Đã ghi chú bữa trưa 04/11") so the PT sees feedback in one place (phase 3, optional; Q8).              |
| `users.food_note` (trainee meal request)          | **Keep** (structured input for the meal plan).                                                                                                                        |
| `RecentActivityList` on the admin dashboard       | **Change**: add "Tin nhắn mới" entries, or leave messages to the inbox only (Q8).                                                                                     |
| Tab bar with 3 tabs                               | **Change** to 4 (section 8). Check that labels still fit at 320 px.                                                                                                   |
| "Contact your PT on Zalo" habit (outside the app) | Nothing in the app to remove. README gets a "Nhắn tin với PT" section.                                                                                                |

## 10. Cost estimate (option A + Web Push)

Assume 30 trainees, each with chat open 10 minutes a day, 3 admins with the inbox open 1 hour a day.

- Chat polling: 30 × 600 s / 3 s ≈ 6,000 requests/day; admin inbox ≈ 3 × 3,600 / 3 ≈ 3,600/day; badges ≈ 30 × 4 h × 80/h ≈ 10,000/day. Total ≈ 20k requests/day ≈ 600k/month, each a few ms of CPU and 1-3 row reads.
- Turso: ≈ 600k × ~3 rows ≈ 2M row reads/month; writes are just messages. Both well inside the free tier.
- Vercel Hobby: function invocations and active CPU well inside the included usage. **Check the current Hobby limits before approval** (they have changed several times) and Hobby's non-commercial terms (same question as PR #63, Q4).
- Web Push: free (browser push services). Library `web-push` (MIT), VAPID keys as two env vars.
- Phase 3 images: Vercel Blob free storage/transfer is small; at ~200 KB per resized image, 1,000 images ≈ 200 MB. Check the Blob quota or keep attachments out (Q5).
- Option C later: Ably/Pusher free plan, $0 until ~100+ concurrent users.

Expected monthly cost: **$0** for phases 1-2.

## 11. Impact on the parked NestJS/admin split (PR #63)

Not started and not to be started by this work. Design choices that keep the split cheap later:

- All chat logic in `features/chat/services` (pure functions over `db`) and `utils/` rules, called by thin route handlers and server actions. These move into `apps/api` as a NestJS module with little change.
- The polling contract (`GET messages?after`, `GET unread`, `POST send`, `POST read`) is a plain JSON API, so the split's BFF can proxy it; a NestJS gateway (WebSocket) becomes an easy option F then, because the split already adds a long-lived API host.
- The `ChatTransport` client interface hides polling vs socket, so moving transports touches one adapter.

## 12. Phased Jira breakdown (to file after approval)

Parent Story: **"Trainees and PTs chat in the app"** (user stories S1-S11, link to this spec). Sub-tasks:

Phase 1: text chat with permission and badges (~4-5 days)

- **[BE] Chat schema and permission flag** – tables `chat_conversations`, `chat_messages`, `chat_reads`, `rate_limits`; `users.chat_enabled*` columns; member delete cleans chat rows. Done: `db:push` on local SQLite, unit tests for delete path.
- **[BE] Chat services and API** – `getApiUser/getApiAdmin`, send (Zod, `chat_enabled` check, idempotent `clientId`, rate limit), list with cursor, mark read, unread counts, admin inbox query, admin toggle action. Done: unit tests per rule in section 14.
- **[FE] Trainee chat tab** – 4th tab, `/messages`, thread, composer, optimistic send/retry, polling hook, unread badge, locked state.
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

| #   | Decision                                                                                                                | Source           |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| D1  | Chat is off by default; an admin enables or locks it per trainee at any time; only allowed trainees can message admins. | Hoan, 2026-11-04 |

Grill-me round 1 = Q1-Q7 below (asked 2026-11-04); Q8-Q10 come in round 2. Answers move into the table above.

### Open questions

1. **Q1** Shared PT inbox (all admins see all chats) or one assigned PT per trainee? Default: shared inbox.
2. **Q2** When chat is locked, can the trainee still read old messages? Default: yes, read-only with a banner.
3. **Q3** When chat is locked, can the admin still send to that trainee (e.g. announcements)? Default: no, locked means both directions.
4. **Q4** Is pt-app commercial (Vercel Hobby is for non-commercial use)? Affects whether a paid tier is needed anyway.
5. **Q5** Are photo attachments needed, and in which phase? Default: phase 3, after Hoan confirms.
6. **Q6** Retention: keep history forever, or delete after N months? Default: forever.
7. **Q7** Should links in messages be clickable? Default: no in phase 1.
8. **Q8** Should meal notes and messages appear in the admin dashboard activity list? Default: inbox only.
9. **Q9** Is a 0-3 s delay acceptable for phase 1, or is instant delivery a requirement (then start with Ably)? Default: polling.
10. **Q10** Quiet hours for push (e.g. no notifications 22:00-07:00 VN)? Default: none, the phone's own Do Not Disturb.

## 14. Test matrix

| Case                                                                                                                        | Level         | Expected                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| Body empty / only spaces / 2001 chars                                                                                       | unit          | rejected by Zod                                                          |
| Same `clientId` sent twice                                                                                                  | unit          | one row, second call returns the first message                           |
| Trainee with `chat_enabled` null or false sends                                                                             | unit          | rejected, "PT đã tạm khoá nhắn tin"                                      |
| Admin sends to a locked trainee                                                                                             | unit          | rejected (per Q3 default)                                                |
| Trainee asks for another trainee's conversation id                                                                          | unit          | impossible: trainee routes take no conversation id; API returns own only |
| Unread count: own messages ignored, per-admin read cursors                                                                  | unit          | admin A reading does not clear admin B                                   |
| Rate limit window: 20 in a minute ok, 21st rejected, next window ok                                                         | unit          | pure rule test                                                           |
| Member delete removes conversation, messages, reads, subscriptions                                                          | unit          | no orphan rows                                                           |
| `GET messages` without session                                                                                              | e2e           | 401 JSON, no redirect                                                    |
| Admin enables chat → trainee sees tab → sends → admin inbox shows it unread → admin replies → trainee sees reply within 5 s | e2e           | exact message texts asserted, unread counts asserted                     |
| Admin locks chat → trainee composer hidden, banner shown, send via API rejected                                             | e2e           | specific banner text and 4xx status                                      |
| Never-enabled trainee                                                                                                       | e2e           | no "Nhắn tin" tab, `/messages` redirects to `/workouts`                  |
| Service worker does not cache `/api/chat/*`                                                                                 | e2e           | response not in Cache Storage                                            |
| Push payload has no message body                                                                                            | unit          | phase 2                                                                  |
| Push subscription returning 410 is deleted                                                                                  | unit          | phase 2                                                                  |
| Real devices                                                                                                                | manual (Hoan) | Android Chrome + installed iPhone receive push, tap opens chat           |

e2e runs on the existing throwaway SQLite (`e2e/.tmp`), so polling works there with no vendor mock. Polling intervals are constants that e2e can shorten via an env var.

## 15. CI/CD and deployment

- CI unchanged (test, lint, typecheck, e2e). New e2e specs must keep the e2e job under 3 minutes (shorter poll interval in e2e).
- Schema additive only: the Vercel build's `drizzle-kit push` creates the new tables and nullable columns. Existing trainees get `chat_enabled = null` (locked), so nothing changes for them until an admin enables chat.
- Phase 2 env vars: `VAPID_PUBLIC_KEY` (also exposed as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto). Added to `.env.example` (empty) and `services/env.ts`; set in Vercel by Hoan. Push is skipped, not failed, when they are missing.
- Rollout: phase 1 ships behind the per-trainee flag, which is itself the feature flag: Hoan enables one test trainee first.

## 16. Risks

| Risk                                                          | Mitigation                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Polling costs grow with users                                 | Visibility pause, back-off, 204 fast path; switch to option C behind `ChatTransport`. |
| iOS push only in installed app; many trainees use Safari tabs | Install banner already exists (KAN-79); badge on next open still works.               |
| Duplicate messages on flaky mobile networks                   | `clientId` unique per conversation.                                                   |
| Personal data on lock screens                                 | Push payload without body.                                                            |
| No FK cascade leaves orphan chat rows                         | Explicit delete in member delete path + unit test.                                    |
| Admin expects chat to be on for everyone after deploy         | Release note: chat is off by default; enable per trainee on the member page.          |
| Keyboard covering the composer on iOS                         | `visualViewport` handling + browser proof at 390 px.                                  |
| Vercel Hobby limits/terms change                              | Re-check before approval (Q4); option A has no other vendor to renegotiate.           |
