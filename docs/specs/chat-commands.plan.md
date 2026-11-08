# Plan: Chat slash commands (/imlang)

## Source

- Intent: `intent/2026-11-08-chat-commands.md`
- Spec: `docs/specs/chat-commands.md`
- KAN key: KAN-167 (KAN-168 BE, KAN-169 FE, KAN-170 QA)

## Files that change

- `features/chat/utils/chat-commands.ts` (new): registry `CHAT_COMMANDS`, `parseChatCommand(text)`, `matchCommandSuggestions(text)`, `findCommandHint(text)`.
- `features/chat/utils/__tests__/chat-commands.test.ts` (new): parser and suggestion cases from the test matrix.
- `features/chat/services/chat-actions.ts`: both send actions parse `body` after Zod validation, store the stripped body, reject an empty text body, skip `schedulePush` when `silent`.
- `features/chat/services/__tests__/chat-actions.test.ts`: trainee and admin `/imlang` cases (no push, body stripped), normal message still pushes.
- `features/chat/hooks/use-chat-messages.ts`: optimistic bubble uses the parsed body.
- `features/chat/components/Composer/index.tsx`: suggestion list and hint line.

## Order of work

1. Registry + unit tests.
2. Server actions + action tests.
3. Client optimistic body + composer hint.
4. `pnpm verify`, browser check of the composer.

## Risks

- A message that legitimately starts with `/imlang` can no longer be sent literally: accepted, the command is deliberately obscure.
- No schema change, no migration.

## Proof

- `pnpm verify`; `chat-commands.test.ts`, `chat-actions.test.ts`.
- Browser: type `/` in the composer, see the suggestion; send `/imlang hi`, bubble shows `hi`.

## Deviations

- The registry hint is "Gửi không thông báo" without the 🔕 emoji, because the Composer shows a lucide `BellOff` icon instead.
- `findCommandHint` stays exported and tested but the Composer no longer uses it (the chip and placeholder replaced the hint line).
- The Composer chip and keyboard handling have no component tests (the repo has none for components); the pure helpers `extractLeadingCommand` and `composeCommandMessage` are unit tested.
