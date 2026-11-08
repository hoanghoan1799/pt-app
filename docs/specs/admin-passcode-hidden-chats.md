# Admin passcode lock, hidden chats, header settings (KAN-160)

Sub-tasks: KAN-161 [BE] passcode + server lock, KAN-162 [FE] lock screen + passcode settings, KAN-163 [BE] hidden chats, KAN-164 [FE] hidden chats UI, KAN-165 [BE+FE] header menus + peer avatar viewer, KAN-166 [QA] e2e (Pending: skipped by Hoan 2026-11-07).
Intent: `intent/2026-11-07-admin-passcode-hidden-chats.md`.

## Goal

Signed-in admins protect the app with a 4-digit passcode, hide chats behind it, and manage avatar, account colour and presence from the header. In a chat, the other person's photo is visible and can be enlarged.

## Decisions (grill-me, Hoan, 2026-11-07)

### Passcode

- Q1 Lock when the app opens (new tab, PWA launch, reload) and when it comes back after 5 min in the background. Not on in-app navigation. See plan "Deviations" for how reload is handled.
- Q2 4 digits, numeric keypad.
- Q3 Optional. No passcode = no lock. Set / change / turn off in the header gear menu ("Mã khoá"). Hiding a chat requires a passcode first.
- Q4 Lock screen has "Quên mã khoá" (account password, then a new passcode) and "Đăng xuất".
- Q5 5 wrong passcodes in a row sign the admin out (session cookie cleared, counter reset); next login is with the account password.
- Q6 Changing needs the current passcode (or the account password via "Quên mã khoá"). Stored as a hash (same scheme as passwords), one per admin.
- Q7 Server-enforced: while locked, every admin page redirects to `/admin/lock` and every admin API answers 401. Not just a UI overlay.

### Hidden chats

- Q8 Per admin. Other admins and the trainee see no change.
- Q9 Inbox "Chọn" mode (checkboxes, "Ẩn"), plus "Ẩn cuộc trò chuyện" in the chat settings sheet.
- Q10 A hidden chat stays hidden on new messages: not in the inbox, not in that admin's unread count, no push to that admin.
- Q11 Inbox search filters by name. Typing exactly the passcode shows the hidden chats. Hidden chats never match a name search.
- Q12 Reveal is temporary (until leaving the inbox); "Bỏ ẩn" unhides for good.
- Q13 Unlocking the app does not reveal hidden chats.
- Q14 The passcode cannot be turned off while chats are hidden.

### Header and chat sheet

- Q15 Avatar menu gets "Ảnh đại diện" for admins and trainees; the own-avatar picker leaves the chat settings sheet.
- Q16 Admin account colour moves to the gear menu ("Màu tài khoản"). Per-conversation colour (admin) and "Màu tin nhắn" (trainee) stay in the chat sheet.
- Q17 Admin-only "Trạng thái hoạt động" On/Off in the gear, default On. Off: trainees see no status line and no dot for that admin; that admin is left out of the "any admin online" aggregate. The admin still sees trainees' status. Applies on the next presence refresh.
- Q18 Top of the chat settings sheet shows the other person's photo (initials when none, not enlargeable). Tap: full-screen view; tap outside or Esc closes.
- Q19 Remove from the chat sheet: own AvatarField, account colour. Admin "Đổi mật khẩu" stays as is (out of scope). Nothing else changes.
- Q20 One story, sub-tasks as above, built in that order.

### Delivery (Hoan, 2026-11-07)

- E2E skipped for now (KAN-166 Pending). Unit tests still required.
- PRs target `main` directly (not `stag`) for this story.

## Data model (additive)

- `admins.passcode_hash` text null; `admins.passcode_failed_count` integer not null default 0; `admins.presence_hidden` integer (boolean) not null default false.
- New table `chat_hidden_conversations` (`admin_id`, `conversation_id`, `hidden_at`), primary key (`admin_id`, `conversation_id`).

## Lock mechanism

- Unlock cookie `pt_admin_unlock` (httpOnly, signed like the session, payload `{ adminId, exp }`), 5-min lifetime, refreshed while the app is visible by the existing presence heartbeat (60 s).
- `getCurrentAdmin` returns `{ admin, locked }`-aware results: `requireAdmin` redirects to `/admin/lock` when locked; `getApiAdmin` returns null (401). Lock page and passcode actions use a lock-exempt guard.
- Client: on `visibilitychange` back to visible after >= 5 min hidden, navigate to `/admin/lock` (the cookie has expired anyway).

## Out of scope

Admin change-password page, trainee passcode, hiding single messages, e2e.

## Test matrix

| Area           | Case                                                                       | Kind          |
| -------------- | -------------------------------------------------------------------------- | ------------- |
| Passcode rules | 4 digits only; rejects letters, 3 or 5 digits                              | unit          |
| Verify         | right code resets counter; 5th wrong ends session                          | unit          |
| Lock           | unlock cookie expired / other admin id / missing = locked                  | unit          |
| Turn off       | refused while chats are hidden                                             | unit          |
| Reveal         | wrong code rate limited; right code returns only this admin's hidden chats | unit          |
| Inbox          | hidden chats excluded from list and unread count; other admin unaffected   | unit          |
| Push           | no push to an admin who hid the chat                                       | unit          |
| Presence       | hidden admin excluded from trainee aggregate; null when all hidden         | unit          |
| UI             | lock screen, gear/avatar menus, select-to-hide, reveal, peer avatar viewer | browser check |

## Round 2: hide the trainee everywhere (Hoan, 2026-11-07)

Hiding a chat left the trainee visible elsewhere (dashboard list, the user's Messages tab). Decisions:

- R1 Hiding hides the trainee for that admin everywhere: dashboard user list and "Hoạt động gần đây", inbox, unread counts, push.
- R2 A hidden trainee's pages (`/admin/users/[id]/...`) answer "not found" unless the admin revealed hidden trainees with the passcode in this session (reveal lasts until the app locks or signs out, at most 10 min).
- R3 A "Tìm học viên" box on the admin dashboard above the user list: name filter for visible trainees; the exact passcode lists hidden trainees with "Bỏ ẩn". The inbox search keeps working the same way.
- R4 Copy says "Ẩn học viên" / "Bỏ ẩn học viên". Hide from inbox "Chọn" mode, the chat settings sheet, and the user detail page.
- R5 Still per admin; other admins and the trainee see nothing.
- R6 Any trainee can be hidden, with or without a conversation: new table `admin_hidden_users` (admin_id, user_id, hidden_at). Rows of `chat_hidden_conversations` are moved into it by `scripts/setup-database.ts` on the next build.
- R7 Dashboard totals (user count, completion %) leave hidden trainees out.
- R8 Tapping a sticker or photo sticker in a chat bubble opens it in the full-screen viewer (`AvatarLightbox`).
- Delivery: PRs into `main`, e2e skipped, self-merge on green CI, no Jira.
- Schema lesson: new columns on existing tables must be nullable (see #121).

## Round 3: chat info page, photo gallery, message search (Hoan, 2026-11-07)

Builds after photo sending. Decisions:

- G1 Gallery lists photos sent with the photo feature (not stickers), 3-column grid, newest first, both roles.
- G2 Each tile shows the sender's small avatar (initials when none) in the bottom-right corner.
- G3 Tap opens the full-screen viewer with previous/next (swipe or arrows), "Tải xuống" (download the photo) and "Xem trong tin nhắn": opens the chat scrolled to that message, highlighted ~2 s, loading older pages until it is found.
- S1 Message search runs inside the open conversation only, 2+ characters, accent-insensitive.
- S2 Results show the matching snippet in bold and the date; tap jumps to the message as in G3.
- T1 Tapping the peer avatar/name or the gear opens a chat info page (replaces the settings sheet), laid out like Messenger's chat info: large peer photo (tap to enlarge), name, presence; a row of round buttons ("Tìm kiếm", "Tuỳ chỉnh"); a photo preview block with a "Ảnh đã gửi" row opening the full gallery page; an actions list (current sheet settings, "Ẩn học viên" for admins). Search and gallery are their own sub-pages; Back returns to the chat.
- Delivery: PRs into `main`, e2e skipped, self-merge on green CI, no Jira.
