# Plan: sticker suggestions while typing

## Source

- Spec: `docs/specs/sticker-suggestions.md`
- Prototype approved by Hoan (2026-11-10). No KAN key: Hoan asked to skip Jira for this feature.

## Files that change

- `features/chat/constants/sticker-keywords.ts`: vi/en/zh keywords and emoji for the 31 bundled stickers.
- `features/chat/utils/sticker-suggestions.ts`: normalize, eligibility, GIPHY query helper, scoring and ranking (pure).
- `features/chat/hooks/use-giphy-suggestions.ts`: debounced, abortable, cached GIPHY lookups through the existing route.
- `features/chat/utils/sticker-suggest-settings.ts`, `features/chat/hooks/use-sticker-suggest-setting.ts`: the two per-device switches.
- `features/chat/components/StickerSuggestions/index.tsx`: the row above the composer.
- `features/chat/components/Composer/index.tsx`, `ChatThread/index.tsx`, `StickerPanel/index.tsx`: wiring and the switches.
- `messages/{vi,en,zh}/chat.json`: new strings.

## Order of work

1. Keywords + pure matching with unit tests.
2. GIPHY hook and settings store.
3. Row component, Composer and ChatThread wiring, panel switches, i18n.

## Risks

- GIPHY rate limit (30/min per user): the 400 ms debounce and the cache keep typing well under it; on 429 only local stickers show.
- Composer is shared by trainee and admin chats; suggestions only render when `onSendSticker` is passed.

## Proof

- `features/chat/utils/__tests__/sticker-suggestions.test.ts`, `pnpm verify`, `pnpm build`.
- Device check by Hoan: type `cố lên` / `haha`, scroll the row, tap a tile.

## Deviations

- None from the approved prototype.
