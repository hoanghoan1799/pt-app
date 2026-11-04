# Plan: Realtime chat between trainees and PTs (phase 1)

Status: **approved by Hoan 2026-11-04** (with the wireframe: https://claude.ai/artifact/SJqexQQge8AcWUwYE2H3Ej). Phases 2-3 get their own plan update after phase 1 ships.

## Source

- Intent: `intent/2026-11-04-realtime-chat.md`
- Spec: `docs/specs/realtime-chat.md` (decisions D1-D12)
- KAN key: KAN-96 (phase 1: KAN-97, KAN-98, KAN-99 BE; KAN-100, KAN-101 FE; KAN-102 QA; phase 2: KAN-103..105; phase 3: KAN-106..108)

## Files that change

PR 1, KAN-97 [BE] schema + permission (no visible change):

- `db/schema.ts`: tables `chat_conversations`, `chat_messages`, `chat_reads`, `rate_limits`; `users.chat_enabled`, `chat_enabled_changed_at`, `chat_enabled_by_admin_id`.
- `features/chat/services/chat-permission.ts`: `setChatEnabled(userId, enabled, adminId)`, `isChatEnabled(user)`.
- `features/chat/services/chat-admin-actions.ts`: `setChatEnabledAction` (`requireAdmin()` + Zod).
- `features/members/services/member-actions.ts`: delete chat reads, messages, conversation before the user row.

PR 2, KAN-98 [BE] services + API:

- `services/auth-guard.ts`: `getApiUser()`, `getApiAdmin()` (null, no redirect).
- `features/chat/utils/chat-rules.ts` (+ test): body schema, reader keys, unread rules, page size.
- `features/chat/services/chat-queries.ts`: get-or-create conversation, list (`after` / `before` cursor, 30 per page), unread counts, admin inbox.
- `features/chat/services/chat-actions.ts`: `sendMessageAction`, `markReadAction` (trainee and admin variants; idempotent `clientId`; D6 lock check).
- `app/api/chat/messages/route.ts`, `app/api/chat/unread/route.ts`, `app/api/admin/chat/[conversationId]/messages/route.ts`: GET handlers, `dynamic`, 401 JSON, 204 fast path.
- `features/chat/constants/messages.ts`: Vietnamese errors ("PT đã tạm khoá nhắn tin", invalid message).

PR 3, KAN-99 [BE] Ably:

- `package.json`: `ably` dependency.
- `services/env.ts`, `.env.example`: optional `ABLY_API_KEY`.
- `features/chat/utils/ably-capabilities.ts` (+ test): channel names and capability per role.
- `features/chat/services/chat-realtime.ts`: `publishChatEvent()` (REST, swallow and log errors).
- `app/api/chat/ably-token/route.ts`: token request, 403 for locked trainee, 204 when no key (client falls back to polling).
- Hook publish into send, read and lock actions. Events: `message`, `inbox` (no body), `read`, `chat-status` (`CHAT_EVENTS`); `publishNewMessage(conversationId, message)` takes the id because `ChatMessage` has none.

PR 4, KAN-100 [FE] trainee:

- `constants/routes.ts`: `MESSAGES`; `proxy.ts` matcher adds `/messages/:path*`.
- `app/(user)/(protected)/messages/page.tsx`: redirects to `/workouts` when chat is off and no history.
- `components/layout/UserTabBar`: 4th tab, unread badge, shown only when allowed or history exists (layout passes the flag).
- `features/chat/hooks/use-chat-transport.ts`: Ably client + polling fallback, gap fill on reconnect.
- `features/chat/hooks/use-chat-messages.ts`, `use-chat-unread.ts`.
- `features/chat/components/{ChatThread,MessageBubble,Composer,UnreadBadge,LockedBanner,NewMessagesChip}/index.tsx`.

PR 5, KAN-101 [FE] admin:

- `app/admin/(protected)/messages/page.tsx`: inbox.
- `features/chat/components/{ChatInboxList,ChatLockSwitch}/index.tsx`.
- `app/admin/(protected)/users/[id]/page.tsx`: "Nhắn tin" section + lock switch.
- `app/admin/(protected)/page.tsx` + `features/dashboard`: unread tile and header link.

PR 6, KAN-102 [QA]:

- `e2e/chat.spec.ts`, `e2e/seed.ts` (chat-enabled and locked trainees), `playwright.config.ts` env for a 500 ms poll interval.
- Browser proof artifact (trainee 390/320 px, admin 390 px + desktop).
- README: "Nhắn tin với PT" section and the per-trainee switch.

## Order of work

1. PR 1 schema + flag (additive; deploy is safe, nothing visible).
2. PR 2 services + API, unit-tested, polling only.
3. PR 3 Ably (works without a key, so it can merge before Hoan adds `ABLY_API_KEY`).
4. PR 4 trainee UI, PR 5 admin UI (can run in parallel worktrees after PR 2).
5. PR 6 e2e + browser proof, then Hoan enables chat for one test trainee in production.

Each PR: own branch `feat/KAN-<n>-...`, ticket In Progress at start, In Review when the PR opens, Done on merge; `/code-review` before asking Hoan. Builder model: Sonnet for services/UI, Haiku for tests scaffolding and mechanical edits; Opus reviews.

## Risks

- `drizzle-kit push` on Turso: only new tables and nullable columns, checked in the PR 1 diff.
- Ably free plan or outage: Turso is the source of truth; polling fallback keeps chat working.
- iOS keyboard covers the composer: `visualViewport` handling, checked in the browser proof.
- Tab bar with 4 labels at 320 px: checked in the browser proof; shorten labels if needed.
- Orphan rows on member delete (no FK cascade): unit test in PR 1.

## Proof

- Unit: `features/chat/utils/__tests__/chat-rules.test.ts`, `features/chat/utils/__tests__/ably-capabilities.test.ts`, member delete cleanup test.
- e2e: `e2e/chat.spec.ts` covering spec section 14 rows.
- `pnpm verify` green on every PR; e2e job under 3 minutes.
- Manual on the Vercel preview with `ABLY_API_KEY`: message appears on the other device in under 1 s.

## Phase 2 (KAN-103..105): Web Push

Spec sections 4, 6, 7, 10, 12; D11 (no quiet hours). Push is skipped, never failed, when the VAPID env vars are missing, so each PR can merge before Hoan sets them.

### PR 7: KAN-103 [BE] Web Push (as built)

- `package.json`, `pnpm-lock.yaml`: `web-push`, `@types/web-push` (dev).
- `services/env.ts`: `getVapidConfig()` (null when any value is missing), `getVapidPublicKey()` (for the FE ticket); `.env.example`: four commented entries.
- `db/schema.ts`: additive table `push_subscriptions` (unique `endpoint`, index on `owner_key`, nullable `last_success_at`).
- `features/chat/utils/push-rules.ts` (+ test): owner keys, Zod subscription schema, `buildChatPushPayload` (no message body parameter; takes `traineeUserId` for the admin URL), `isGoneStatus`.
- `features/chat/services/chat-push.ts` (+ tests): `saveSubscription` (upsert on endpoint, reassigns owner), `deleteSubscription` (owner-scoped), `sendChatPush` (injectable sender, TTL 3600, urgency high, topic per conversation, deletes 404/410, stamps `last_success_at`, never throws, logs ids and counts only), `schedulePush` (uses `after()`, falls back to a floating promise).
- `app/api/push/subscribe/route.ts` (+ test): `POST` subscribe, `DELETE` unsubscribe `{ endpoint }`; `?as=admin` picks the admin session like `/api/chat/ably-token`; 401 / 400 / 204.
- `features/chat/services/chat-queries.ts`: `insertMessageOnce` (returns `created`), `insertMessage` kept as a wrapper.
- `features/chat/services/chat-actions.ts`: both send actions call `schedulePush` only for a newly inserted row, not for a retried `clientId`.
- `features/members/services/member-actions.ts` (+ test): member delete also removes `user:<id>` subscriptions in the same transaction. There is no admin delete path, so `admin:<id>` rows have nothing to clean up yet.

### PR 8: KAN-104 [FE] Push opt-in and service worker

- `public/sw.js`: `push` handler (shows title/body/tag from the payload, `data.url`) and `notificationclick` (focus an open client on the URL or open it).
- `features/chat/components/PushOptInCard/index.tsx` (+ a `use-push-subscription` hook): shown on the trainee chat page and the admin inbox; subscribes through `/api/push/subscribe` (`?as=admin` in the admin app), reads the public key from `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- iOS only offers the card in standalone mode (installed app); in a Safari tab it reuses the install hint instead.
- Remember "dismissed" and "enabled" per browser so the card shows once.

### PR 9: KAN-105 [QA] Push checks

- e2e: the opt-in card shows once (dismiss and enable states, no real push service).
- Manual device checklist for Hoan: Android Chrome and an installed iPhone each receive a push for a new message, the tap opens the right chat, lock screen shows no message body, a deleted member's device stops receiving.

### Env vars Hoan sets in Vercel (Production and Preview)

- `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: the same public key (the second is inlined into the browser bundle at build time, so redeploy after setting it).
- `VAPID_PRIVATE_KEY`: server only.
- `VAPID_SUBJECT`: `mailto:<Hoan's email>`.
- Generate the pair once with `pnpm dlx web-push generate-vapid-keys`; changing it later invalidates every stored subscription.

## Deviations

- KAN-98: no send rate limit (D13, Hoan 2026-11-04); `utils/rate-limit-rules.ts` and `services/rate-limiter.ts` were dropped and the `rate_limits` table stays unused.
