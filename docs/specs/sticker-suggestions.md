# Sticker suggestions while typing

Plan: `docs/specs/sticker-suggestions.plan.md`. No Jira ticket (Hoan, 2026-11-10: skip Jira for this feature). Prototype approved by Hoan on 2026-11-10 before any code: https://claude.ai/artifact/4ZNP1wPUMM8qHvMzMVMSks

Source: Hoan asked for Zalo/Telegram-style suggestions: while typing in the chat input, show matching stickers right above it; no match means nothing is shown; tapping a suggestion sends it at once.

## Decisions

- S1. The row shows ALL matches (no cap) in one horizontally scrollable row above the composer (Hoan: "Tất cả sticker match text và có thể scroll ngang").
- S2. Sources: bundled Fluent stickers, matched on the device, and GIPHY GIFs through the existing `/api/chat/stickers/giphy` route, appended after the local ones with a "GIF" badge and a "Powered by GIPHY" label. GIPHY is queried for every eligible short text, even when no local sticker matches (option A, Hoan 2026-11-10).
- S3. Custom ("Của tôi") stickers are not suggested (Hoan: "Không cần gợi ý sticker của tôi"). No schema or API change.
- S4. Tapping a suggestion sends the sticker (reply-to kept), adds it to recent stickers and clears the typed text (Hoan: decision 1 ok).
- S5. Only short text is eligible: at most 4 words and 30 characters, or emoji only (Hoan: decision 3 ok). GIPHY needs at least 2 normalized characters and is not queried for emoji-only text.
- S6. Matching ignores case, diacritics and punctuation (`cố lên` = `co len`, `đ` = `d`). Keywords per locale (vi, en, zh) plus emoji live in `features/chat/constants/sticker-keywords.ts`; vi and zh viewers also match the en keywords. Score: whole text equals a keyword 3, keyword phrase inside the text 2, last word (3+ characters) is a prefix of a one-word keyword 1, emoji contained 3; recently used stickers get a boost below one score step. zh keywords match as substrings.
- S7. Hidden while editing, while a `/` command or `/imlang` chip is active, while a photo is attached, after "Ẩn" or Escape for that exact text, or when the per-device switch is off.
- S8. Two per-device switches in the sticker panel, both on by default: sticker suggestions and GIF suggestions (localStorage).
- S9. Local matching is debounced ~120 ms; GIPHY ~400 ms with the previous request aborted and a per-tab cache. Any GIPHY failure, rate limit or missing key silently leaves only the local stickers.

## Test matrix

| Case                       | Expected                                   |
| -------------------------- | ------------------------------------------ |
| `cố lên` / `co len`        | same stickers (flexed biceps first)        |
| `💪` only                  | flexed biceps, no GIPHY call               |
| 5+ words or 31+ characters | no row                                     |
| text starting with `/`     | no row                                     |
| `xyz` with GIPHY off       | no row                                     |
| tap a tile                 | sticker sent, text cleared, recent updated |
