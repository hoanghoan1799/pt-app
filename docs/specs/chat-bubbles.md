# Floating chat bubbles (Messenger-style, in-app)

Status: approved by Hoan 2026-11-10 (thread "Add floating chat bubbles in app"). No Jira ticket (Hoan's choice for recent work).

## Goal

Any signed-in role (trainee, PT, super admin) can keep a chat as a floating round bubble that stays on screen while they move around the app, like Messenger chat heads on Android. In-app only: no OS-level overlay.

## Decisions

| # | Decision |
|---|----------|
| D1 | The bubble shows the other person's avatar; without a photo, the first two letters of the shown name (the existing `Avatar` initials). The shown name is the viewer's private nickname first (contact aliases), else the real name. |
| D2 | Tap a bubble: a chat panel opens. Tap outside the panel (the dimmed backdrop): it collapses back into the bubble. |
| D3 | A bubble can be dragged anywhere with pointer events (iPhone, Android, mouse). On release it snaps to the nearest left/right edge. Position is remembered per device (localStorage). |
| D4 | While dragging, a close target appears at the bottom center. Dropping a bubble on it closes that chat's bubble. |
| D5 | Each bubble shows an unread badge (99+ cap). |
| D6 | Several bubbles may be open (max 5, oldest dropped). They overlap in one stack (newest on top, offset 5 px, the top bubble shows the total unread). Tapping the stack lines them up in a horizontal row at the top and opens the top chat; tapping another bubble in the row switches to that person's chat; tapping the active bubble or outside the panel collapses back to the stack. Dragging a bubble out of the row onto the close target closes only that person; dragging the stack closes all. |
| D7 | Bubbles survive in-app navigation (host lives in the protected layouts) and reloads (localStorage). The bubble for the chat currently open full screen is hidden. |
| D8 | Opening a bubble, three ways (Hoan approved all three): (1) a "minimize" button in the chat header turns the current chat into a bubble and leaves the screen; (2) long-press a row in the chat inbox; (3) a new incoming message while the user is not in that chat pops its bubble (collapsed, with badge). (3) can be turned off per device in the chat info page. |
| D9 | (3) respects the existing rules: hidden chats and out-of-scope trainees never pop (server already filters unread for them); `/imlang` silent messages never pop (stored as `chat_messages.silent`, nullable, additive); trainees only have their coach chat (trainee-to-trainee DMs are disabled and get no bubble). Old read-only DMs get no bubble. |
| D10 | The panel shows the real chat screen (same components, same realtime, all features) by loading the chat route in a same-origin iframe in embed mode (`?embed=1`): no header, no tab bar, no install prompt. The panel draws its own small header (avatar, name, open full screen, collapse). Only the active (or last opened) chat keeps its iframe mounted, so at most one thread connection exists for bubbles. |
| D12 | Per-person opt-out: "Don't show chat bubble for this person" (menu in the panel, and in the long-press sheet on an inbox row; same place turns it back on). Muted people never pop a bubble; the inbox badge still counts. Stored per device in localStorage (key per role + chat key). |
| D13 | Animation A (approved by Hoan 2026-11-10): the panel scales from the active bubble (transform-origin at the bubble, ~0.3 s ease-out) and shrinks back; a new bubble slides in from the nearest edge; a closed bubble shrinks to 0. `prefers-reduced-motion` disables all of it. |
| D11 | One unread poll per tab: the tab-bar/inbox badge and the bubbles share one client store over `/api/chat/unread` (no second poller). |

## Out of scope

- OS-level bubbles outside the browser / PWA.
- Bubbles for read-only DMs and the super admin's read-only DM monitor.

## Open questions

None. iOS keyboard behaviour inside the panel needs Hoan's check on a real iPhone.

## Test matrix

| Area | Test |
|------|------|
| Store reducer | open dedupes, max 5 drops oldest, close removes and clears active, expand/collapse |
| Drag rules | tap vs drag threshold, edge snap, clamp into viewport/safe area, close-zone hit radius, position serialize/parse (bad JSON safe) |
| Incoming rules | pops only when the latest loud incoming id grows after the first poll, never for the chat on screen, never when disabled |
| Embed hrefs | trainee coach / admin trainee chat embed + full URLs |
| Unread route | trainee and admin payloads carry `latestLoudIncomingId`; silent messages excluded |
| Bubble meta route | alias name, avatar, 404 for a hidden / out-of-scope trainee, trainee gets only own coach chat |
