# Spec: Chat slash commands (/imlang silent send)

KAN-167 (story), KAN-168 [BE], KAN-169 [FE], KAN-170 [QA]. Intent: `intent/2026-11-08-chat-commands.md`.

## Decisions

- D1 One registry, `features/chat/utils/chat-commands.ts`, pure and shared by client and server. A command declares `name`, a Vietnamese `hint` and `effects` (today only `silent`). Adding a command = one entry in `CHAT_COMMANDS` plus handling any new effect where it applies.
- D2 Syntax: the message starts with `/<name>` (case-insensitive) followed by whitespace or the end of the text. The prefix and the whitespace after it are stripped; the rest is the stored body. Only the leading command counts; `/imlang` in the middle of a message is plain text.
- D3 Unknown commands (`/abc hi`, `/ hello`, a URL path) are sent unchanged as plain text.
- D4 `/imlang` with nothing after it has an empty body: a text message is rejected as invalid input (same as an empty message); a photo with only `/imlang` as caption is sent silently with no caption.
- D5 `silent`: the message is stored and published live as usual (so unread counts and badges are unchanged), only `schedulePush` is skipped. Applies to trainee and admin senders.
- D6 Stickers carry no text, so they always push. Edits never push and are not parsed (an edit to `/imlang x` stays literal).
- D7 The server parses the body; the client also parses before sending so the optimistic bubble shows the stripped text, but the server never trusts a client flag.
- D8 Composer, Messenger `/silent` style: typing `/` (start of text, letters only so far) opens a listbox above the box; each row has the command icon (lucide `BellOff` for `/imlang`, chosen by the registry's `icon` id), the bold `/name` and the muted hint, and rows filter as the user types. Tap, or Enter/Tab on desktop (ArrowUp/ArrowDown move the highlight), selects a row. Selecting a command, or typing its exact name plus a space, removes it from the text and shows it as a tinted chip with icon and a small x at the start of the composer; Backspace in an empty box or the x removes the chip. While a chip is active the placeholder is the hint ("Gửi không thông báo…"). On send the composer passes `/<name> ` + text to `onSend`, so the hook and server parse as before; sending needs non-empty text after the chip. Not shown in edit mode.

## Test matrix

| Case                                                            | Expected                                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/imlang nhắn tin sau nhé`                                      | body `nhắn tin sau nhé`, silent                                                                      |
| `/IMLANG hi`, `/imlang\nhi`                                     | body `hi`, silent                                                                                    |
| `/imlang` alone                                                 | text send rejected (invalid input)                                                                   |
| `/imlangx hi`, `/abc hi`, `hi /imlang`                          | unchanged, not silent                                                                                |
| trainee or admin sends `/imlang hi`                             | message stored + published, no push                                                                  |
| normal message                                                  | push scheduled as before                                                                             |
| photo + caption `/imlang hi`                                    | caption `hi`, no push                                                                                |
| composer types `/`, `/im`                                       | listbox with `/imlang` (icon, hint); `/x` shows none                                                 |
| composer: pick `/imlang` (tap, Enter or Tab) or type `/imlang ` | text cleared, chip shown, placeholder is the hint                                                    |
| chip active, Backspace in empty box or tap x                    | chip removed                                                                                         |
| chip + text `hi`, send                                          | `onSend("/imlang hi")`; chip with no text cannot send                                                |
| real device                                                     | admin sends `/imlang hi`: trainee phone gets no notification, opening the app shows the unread badge |
