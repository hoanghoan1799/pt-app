# Plan: floating chat bubbles

Spec: `docs/specs/chat-bubbles.md`. One PR into `main` (branch `feat/chat-bubbles`).

## Steps

1. **Schema + silent flag.** Nullable `silent` boolean column on `chat_messages` (additive, no `.notNull()`). `chat-actions.ts` stores it for `/imlang` sends.
2. **Unread payload.** `/api/chat/unread` adds `latestLoudIncomingId` (newest incoming non-silent message id, null if none): trainee: for the coach chat; admin: per row of `perTrainee`. Same hidden / scope filters as today.
3. **Shared unread store.** `features/chat/hooks/unread-store.ts`: one ref-counted poller per URL (same cadence, visibility, focus and `UNREAD_REFRESH_EVENT` rules as today). `useChatUnread` reads from it; the bubble host reads the full payload. Not run inside the embed iframe.
4. **Bubble meta route.** `GET /api/chat/bubbles` (trainee) and `?as=admin&ids=1,2` (admin): `{ key, userId, name, avatarSrc, href, embedHref }` per chat the viewer may open; unknown / hidden / out-of-scope ids are left out. Name follows the viewer's contact alias.
5. **Embed mode.** Head script marks `html[data-embed]` when framed; CSS hides `[data-app-chrome]`; `useIsEmbedded()` stops chrome logic (tab bar poll, install prompt, background lock, bubble host). Coach page and admin trainee chat page read `?embed=1` and drop the header (and the admin tabs/lock row). Inside the iframe, link clicks that leave the chat are posted to the parent, which navigates and collapses.
6. **Bubble feature** `features/chat-bubbles/`: pure utils (store reducer, drag/snap/close-zone, incoming detection, storage parse, hrefs) with tests; external store hook; `ChatBubbleHost` (bubbles, drag, close zone, badge, backdrop, panel with iframe + skeleton until load); mounted in both protected layouts.
7. **Openers.** Minimize button in `ChatHeader` (trainee + admin threads); long-press on inbox rows (trainee coach row, admin inbox rows) with haptic + toast; incoming pop (3) with a per-device switch on the chat info page.
8. **i18n** vi/en/zh for every new string; `pnpm verify`.

## Risks

- iOS keyboard inside an iframe panel: the panel follows the parent `visualViewport` height; Hoan checks on a device.
- Long-press vs link tap and iOS link callout: suppress click after a long-press, `-webkit-touch-callout: none` on rows.
