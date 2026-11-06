# Chat UX v2

KAN: bug KAN-131; stories KAN-132 (conversation screen), KAN-133 (reactions and actions), KAN-134 (names, nicknames, colour), KAN-135 (stickers). Intent: `intent/2026-11-06-chat-ux-v2.md`. Plan: `docs/specs/chat-ux-v2.plan.md`.

Source: Hoan's review of the v1.3.0 mobile UI and Figma export (2026-11-06), plus the iPhone screenshot of the Add user sheet.

## What v1.3.0 already has (do not rebuild)

- Presence: heartbeat, `last_seen_at`, `formatLastSeen`, `PresenceStatus` (green dot + text), admin inbox dot (KAN-127, `docs/specs/chat-presence.md`).
- Day separators ("Hôm nay", "Hôm qua", dd/MM) and a centred time stamp after a 15 min gap (`buildThreadItems`, `GROUP_GAP_MS`).
- `chat_messages.deleted_at` and `hidden_by_admin_id` columns (unused so far).
- `BottomSheet` (vaul) and `useConfirm`.

Gaps: the status lives in its own row under the header, not under the name; the dot is not next to the name; the trainee chat keeps the tab bar and has no Back; nothing else below exists.

## Decisions (defaults; Hoan can change any of them)

### A. Admin sheet bug (KAN-131)

- A1. Fix it once in `components/common/BottomSheet`, not in the Add user form: the scroll area gets `min-h-0` so it can shrink inside the `max-h-[94dvh]` flex column, the sheet height follows `visualViewport` while the keyboard is open (same approach as `ChatThread`), and vaul's `repositionInputs` is turned off so it stops fighting our own handling.
- A2. Prove the cause first with a failing e2e on the WebKit iPhone viewport, then fix. If the cause turns out different, the plan's Deviations section says so.

### B. Conversation screen (KAN-132)

- B1. The trainee tab bar is hidden on `/messages` (the tab bar already reads `usePathname`).
- B2. Trainee only: a new `ChatHeader` with Back (left), avatar, then the name with a green dot right after it when online, and the status text ("Đang hoạt động", "Hoạt động 5 phút trước") on the line under the name. It replaces, for the trainee, the separate presence row, the "Nhắn tin với" eyebrow and the account buttons (account actions stay on every other tab). The admin thread keeps its current header, member tabs and presence row (Hoan, Q1).
- B3. Back = `router.back()` when there is history inside the app, otherwise `/workouts`.
- B5. The "Nhắn tin" tab is always visible to trainees (Hoan, 2026-11-06). When the admin has not enabled chat, `/messages` opens read-only: old messages (if any) show, the composer is replaced by the existing locked banner, and an empty thread says the PT has not opened chat yet. Server checks on send are unchanged. This replaces the `showMessages` rule in the protected layout and the redirect to `/workouts` in the messages page.
- B4. Time break after a gap over 30 min (was 15). Day separators unchanged. The exact send time of any message also shows in the long-press sheet (B is UI only, the time comes from `createdAt`).

### C. Reactions and actions (KAN-133)

- C1. Reactions: ❤️ 😂 😮 😢 💪 👍. One reaction per person per message; picking another replaces it; picking the same removes it. Each admin reacts as themselves (the shared inbox shows who).
- C2. Double-tap a bubble toggles my ❤️. Long-press (450 ms) opens a sheet: reaction bar, send time, then Reply, Copy, Edit, Delete. Edit and Delete only on my own messages. Bubble text is not selectable (iOS callout off) so long-press is ours; Copy covers copying.
- C3. Reply: quote bar above the composer; the sent bubble shows the quoted snippet; tapping it scrolls to the original. A reply to an unsent message shows "Tin nhắn đã bị thu hồi".
- C4. Edit: own messages, no time limit (decision deferred from KAN-114). The bubble shows "Đã chỉnh sửa". Every previous body is kept in `chat_message_edits`; both people in the conversation (the trainee and every admin) can open the history from the "Đã chỉnh sửa" label (Hoan, Q2).
- C5. Delete = unsend for everyone, no time limit: soft delete (`deleted_at`), the API returns an empty body, both sides see "Tin nhắn đã bị thu hồi". Reactions on it are hidden. The row stays for history (D8 keep history).
- C6. Sync: polling today asks only for ids after the newest one, so changes to older messages would be missed. Every message mutation (edit, unsend, reaction) sets `chat_messages.updated_at` and bumps `chat_conversations.last_change_at`; the client sends `changedSince`, the server returns changed messages in `changes`, and the 204 fast path also requires `changedSince` to be current. Ably publishes `message-update` with ids only, which triggers the same fetch (no body over Ably, as today).
- C7. No push notification for reactions, edits or unsends.

### D. Names, nicknames, colour (KAN-134)

- D1. Nicknames are per conversation and visible to both sides (Messenger style). Targets: the trainee, the PT side as a whole (`pt`, shared inbox), and each admin (`admin:<id>`) for sender labels. Anyone in the conversation can set or clear any of its nicknames, including their own. Max 30 characters.
- D2. Shown name everywhere in chat (header, sender labels, inbox, typing indicator): nickname, else display name, else real name. Outside chat (workouts, admin member pages) the real name stays.
- D3. Own name: the trainee can rename `users.name` from the account menu (same uniqueness rule as when an admin creates them; email login is unaffected). Admins get a nullable `display_name`; their login `username` never changes.
- D4. Bubble colour: each account picks one of 8 palette colours (stored as a key, not a hex, on `users.chat_color` / `admins.chat_color`). An admin can also override it for one conversation (`chat_color_overrides`, Hoan Q7); the override wins in that conversation only. My bubbles use my colour on both screens; the other side's bubbles keep the neutral surface style on my screen unless they picked a colour, in which case they show in their colour. Nobody can set another person's colour. Default = the current accent orange.
- D5. Palette colours are checked for WCAG AA text contrast in light and dark themes (white or dark text chosen per colour).

### E. Stickers (KAN-135)

- E1. No TikTok assets (their stickers are copyrighted). Default: bundle a free pack from an open-licence animated emoji set (Microsoft Fluent Emoji, MIT) in `public/stickers/` with its licence file, 24+ stickers in 3 groups (Tập luyện, Ăn uống, Cảm xúc), plus "Gần đây" (localStorage). Alternative (Q4): GIPHY sticker search, needs an API key and sends search terms to a third party.
- E2. A sticker is a message with `sticker_id` and an empty body, rendered at 120 px without a bubble; reactions, reply and unsend work, edit and copy do not.
- E3. Inbox preview and push text: "đã gửi một sticker".

## Data model (all additive)

| Change                                                                                                                                                      | Story   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `chat_messages`: nullable `reply_to_message_id`, `edited_at`, `updated_at` (ms)                                                                             | KAN-133 |
| `chat_conversations`: nullable `last_change_at` (ms)                                                                                                        | KAN-133 |
| new `chat_reactions` (message_id, reactor_key, emoji, created_at; PK message_id + reactor_key)                                                              | KAN-133 |
| new `chat_message_edits` (id, message_id, previous_body, edited_at)                                                                                         | KAN-133 |
| new `chat_nicknames` (conversation_id, target_key, nickname, set_by_key, updated_at; PK conversation_id + target)                                           | KAN-134 |
| `users`: nullable `chat_color`; `admins`: nullable `display_name`, `chat_color`; new `chat_color_overrides` (conversation_id, admin_id, color; PK both ids) | KAN-134 |
| `chat_messages`: nullable `sticker_id`                                                                                                                      | KAN-135 |

`reactor_key` / `set_by_key` use the existing reader key format: `user` or `admin:<id>`.

## Older behaviour this replaces

- Hiding the "Nhắn tin" tab and redirecting `/messages` when chat is off (B5).
- Trainee chat only: the separate presence row (moves into the header), the "Nhắn tin với" eyebrow and the account buttons. The admin thread is unchanged.
- The 15 min time break (now 30 min).
- `hidden_by_admin_id` stays unused; admin moderation of trainee messages is not part of this work (Q6).

## Grill-me answers (Hoan, 2026-11-06)

- Q1: no. The admin thread keeps its current header (B2, B3).
- Q2: both people in the conversation see the edit history (C4).
- Q3: ok, ❤️ 😂 😮 😢 💪 👍 (C1).
- Q4: Hoan asked "what about doing it like TikTok": under discussion, see E.
- Q5: agreed, one nickname for "PT" plus per-admin nicknames (D1).
- Q6: agreed, nobody deletes the other side's messages in this work.
- Q7: agreed, colour per account, and an admin can override it per conversation (D4).

## Test matrix

| Ticket  | Case                                                                                                      | Level          |
| ------- | --------------------------------------------------------------------------------------------------------- | -------------- |
| KAN-131 | Add user sheet at 390x844 WebKit: email input reachable and typable, submit visible; keyboard open/closed | e2e            |
| KAN-136 | gap 30:00 no break, 30:01 break; day break unchanged                                                      | unit           |
| KAN-136 | tab bar hidden on `/messages` only; Back fallback when no history                                         | unit/component |
| KAN-137 | trainee: no tab bar, Back works, dot after the name, status under the name                                | e2e            |
| KAN-138 | react/replace/remove; edit own only; unsend own only; reply in same conversation only; 403/404 foreign    | route/service  |
| KAN-138 | change cursor: edit/reaction/unsend appear in `changes`; 204 only when `changedSince` current             | route          |
| KAN-139 | double-tap vs single tap vs long-press timing util                                                        | unit           |
| KAN-140 | two contexts, polling only: heart, reaction, reply, edit, unsend seen on the other side                   | e2e            |
| KAN-141 | nickname length, foreign conversation, duplicate trainee name, invalid colour key                         | route/service  |
| KAN-142 | shown-name resolution order; palette contrast                                                             | unit           |
| KAN-143 | nickname and colour seen on the other side; no control for the other person's colour                      | e2e            |
| KAN-144 | unknown sticker id; sticker + body rejected; preview text                                                 | unit/route     |
| KAN-146 | sticker renders on the other side; no Edit/Copy in its sheet                                              | e2e            |
