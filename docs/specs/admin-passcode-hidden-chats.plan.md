# Plan: Admin passcode lock, hidden chats, header settings

## Source

- Intent: `intent/2026-11-07-admin-passcode-hidden-chats.md`
- Spec: `docs/specs/admin-passcode-hidden-chats.md`
- KAN key: KAN-160 (sub-tasks KAN-161..165; KAN-166 e2e Pending)

## Files that change

- `db/schema.ts`: `admins.passcode_hash`, `passcode_failed_count`, `presence_hidden`; table `chat_hidden_conversations`.
- `features/auth/utils/passcode-rules.ts` (new): Zod schema for 4 digits, lock-window math.
- `services/admin-lock.ts` (new): sign/verify/refresh the unlock cookie; `isAdminLocked(admin)`.
- `services/auth-guard.ts`: `requireAdmin` redirects to `/admin/lock` when locked; `getApiAdmin` returns null when locked; new `requireAdminSession` (lock-exempt) for the lock page and passcode actions.
- `features/auth/services/passcode-actions.ts` (new): set, change, turn off, verify (5 wrong = sign out), reset with account password.
- `app/api/presence/route.ts`: admin heartbeat also refreshes the unlock cookie.
- `app/admin/lock/page.tsx` + `features/auth/components/PasscodeLock`, `PasscodeKeypad` (new).
- `features/auth/hooks/use-background-lock.ts` (new): lock after 5 min hidden.
- `features/chat/services/chat-hidden.ts` (new): hide many, unhide, list hidden, reveal by passcode (limiter key `passcode-reveal:<adminId>`, 5 / 15 min).
- `features/chat/services/chat-queries.ts`: `listAdminInbox`, `countUnreadForAdmin`, `listUnreadByTraineeForAdmin` skip hidden.
- `features/chat/services/chat-push.ts`: skip admin recipients who hid the conversation.
- `features/chat/services/presence.ts`: aggregate ignores admins with `presence_hidden`.
- `features/chat/components/ChatInboxList` + new `InboxSearch`, select mode, hidden list.
- `components/layout/HeaderMenus`: avatar item (both roles), gear items for admins: Màu tài khoản, Trạng thái hoạt động, Mã khoá.
- `features/chat/components/ChatSettingsSheet`: drop AvatarField and account colour; add peer photo + `AvatarLightbox` (new, in `components/common`); add "Ẩn cuộc trò chuyện" (admin).

## Order of work (one PR per sub-task, base `main`)

1. KAN-161 [BE]: schema, rules, lock cookie, guards, passcode actions, unit tests. Ships dormant: no admin has a passcode until KAN-162.
2. KAN-162 [FE]: lock page, keypad, forgot flow, gear "Mã khoá", background lock hook.
3. KAN-163 [BE]: hidden table, actions, inbox/unread/push filters, unit tests.
4. KAN-164 [FE]: inbox search, select-to-hide, reveal list, sheet item.
5. KAN-165 [BE+FE]: presence_hidden + aggregate, header menu moves, peer avatar viewer.

## Risks

- Lock guard bug could lock every admin out: guard only acts when `passcode_hash` is set, and "Đăng xuất" + password login always works. Unit tests cover the guard.
- Production schema push on `main` deploy: all changes are additive (nullable or defaulted columns, new table).
- Hidden-chat leak through unread/push: covered by unit tests on queries and push recipients.

## Proof

- `pnpm verify` green on every PR; new unit tests named in the spec test matrix.
- Browser check on a local DB for each FE PR (lock, menus, hide/reveal, lightbox), screenshots in the PR.

## Deviations

- Q1 "reload locks": the unlock cookie lives 5 min and is refreshed while visible, so a reload within 5 min of activity does not re-prompt; after the app has been closed or hidden for 5 min it always does. A strict lock on every reload would need the unlock state in page memory only, which breaks server-side enforcement (Q7).
- PRs target `main` and e2e is skipped, on Hoan's word (2026-11-07).
