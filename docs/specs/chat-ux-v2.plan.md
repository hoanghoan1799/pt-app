# Plan: Chat UX v2

Status: **draft, waiting for Hoan's approval** (no code before approval).

## Source

- Intent: `intent/2026-11-06-chat-ux-v2.md`
- Spec: `docs/specs/chat-ux-v2.md`
- KAN keys: KAN-131 (bug); KAN-132 -> KAN-136, KAN-137; KAN-133 -> KAN-138, KAN-139, KAN-140; KAN-134 -> KAN-141, KAN-142, KAN-143; KAN-135 -> KAN-144, KAN-145, KAN-146

## Order of work (one PR per ticket, base `stag`)

1. **KAN-131** [bug] Bottom sheet on iPhone. Failing e2e first, then the fix.
2. **KAN-136** [FE] Conversation header, hidden tab bar, 30 min breaks.
3. **KAN-137** [QA] e2e for the conversation screen (updates `e2e/chat-presence.spec.ts`).
4. **KAN-138** [BE] Reactions, reply, edit history, unsend, change cursor. Schema first.
5. **KAN-139** [FE] Gestures, action sheet, reply quote, edit mode.
6. **KAN-140** [QA] e2e for actions.
7. **KAN-141** [BE] Nicknames, names, colour.
8. **KAN-142** [FE] Conversation settings sheet and rename.
9. **KAN-143** [QA] e2e.
10. **KAN-144** [BE] Sticker kind. 11. **KAN-145** [FE] Sticker panel. 12. **KAN-146** [QA] e2e.

Steps 1-3 need no schema change and can ship (and be released) on their own. Stickers wait for Q4.

## Files that change

Paths checked on `origin/stag`; "new" = does not exist yet.

KAN-131:

- `components/common/BottomSheet/index.tsx`: `min-h-0` on the scroll area, viewport-aware max height, `repositionInputs={false}`.
- `features/chat/components/ChatThread/index.tsx`: move `useVisualViewport` to `hooks/use-visual-viewport.ts` (new) so both use it.
- `e2e/admin-dashboard.spec.ts`: Add user sheet case on the iPhone (WebKit) viewport; `playwright.config.ts` gets a `mobile-webkit` project (today only `mobile-chromium`, iPhone 12 device on Chromium), used by this spec in CI.

KAN-136:

- `components/layout/UserTabBar/index.tsx`: return null under `ROUTES.MESSAGES`.
- `features/chat/components/ChatHeader/index.tsx` (new): Back, avatar, name + dot, status line.
- `features/chat/components/ChatThread/index.tsx`: the presence row is rendered only for the admin viewer; the trainee header receives presence.
- `features/chat/components/TraineeChatThread/index.tsx`: use `ChatHeader`. The admin thread page is unchanged (Hoan, Q1).
- `features/chat/utils/chat-thread-rules.ts`: `GROUP_GAP_MS` 30 min; tests in `features/chat/utils/__tests__/`.

KAN-138:

- `db/schema.ts`: columns and tables from the spec's data model (KAN-133 rows).
- `features/chat/services/chat-actions.ts`, `chat-admin-actions.ts`: `reactAction`, `editMessageAction`, `unsendMessageAction`, `replyTo` on send; Zod schemas in `features/chat/utils/chat-rules.ts`.
- `features/chat/services/chat-thread.ts`, `chat-queries.ts`: `changes` + `changedSince`, reactions and reply snippet in `ChatMessage`, empty body when unsent.
- `features/chat/services/chat-realtime.ts`: `message-update` event.
- `app/api/chat/messages/route.ts`, `app/api/admin/chat/[conversationId]/messages/route.ts`: accept `changedSince`.

KAN-139:

- `features/chat/components/MessageBubble/index.tsx`: gestures, reactions row, quote, edited / unsent states.
- `features/chat/components/MessageActionsSheet/index.tsx` (new), `ReplyBar/index.tsx` (new); `Composer` edit and reply modes.
- `features/chat/hooks/use-chat-messages.ts`: merge `changes`; optimistic react/edit/unsend.
- `features/chat/utils/gesture.ts` (new, + test).

KAN-141 / KAN-142: `db/schema.ts`; `features/chat/services/chat-profile-actions.ts` (new); `features/chat/utils/chat-palette.ts` (new, + contrast test); `features/chat/utils/display-name.ts` (new, + test); `ChatSettingsSheet` (new); trainee account menu in `features/auth/components/UserHeaderActions`; admin menu.

KAN-144 / KAN-145: `db/schema.ts`; `features/chat/constants/stickers.ts` (new); `features/chat/components/StickerPanel` (new); `public/stickers/` (new, with LICENSE).

## Risks

- Polling cursor change (C6) touches the hot path: keep the old `after` behaviour for clients that do not send `changedSince` so an open tab from the previous deploy keeps working.
- Long-press vs scroll on iOS: cancel the press when the finger moves more than 10 px.
- Renaming trainees: `name_key` uniqueness; admin search uses the new name immediately.
- Sticker bundle size: lazy-load the panel, cap at 1.5 MB.

## Proof

- `pnpm verify` green per PR; listed e2e per QA ticket; `browser-proof` screenshots at 390 px light/dark for every FE ticket; real-device check of KAN-131 on Hoan's iPhone after deploy.

## Deviations

None yet.
