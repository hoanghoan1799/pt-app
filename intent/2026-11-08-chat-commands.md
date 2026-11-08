# Intent: Chat slash commands, starting with /imlang (silent send)

- **Author:** Hoan
- **Status:** accepted
- **KAN key:** KAN-167

## Problem

Every chat message wakes the other person with a web push. Late at night, or for a low-priority note, Hoan wants to send a message that is delivered but does not ring the recipient's phone.

## Proposed outcome

Typing `/imlang <message>` (e.g. `/imlang nhắn tin sau nhé`) sends `<message>` normally: stored, shown live, unread badge and count still go up for the recipient, but no push notification is sent. More commands can be added later by declaring one entry in a single registry (Hoan, 2026-11-08: "tạo 1 module hoặc 1 pattern để dễ thêm nhiều command hơn").

## Affected users and systems

Trainees and admins (both can send silently), the chat composer, the two send actions, web push.

## Constraints

No schema change. Vietnamese UI copy. The server decides whether a push is sent; the client cannot opt out of it any other way.

## Open questions

None blocking; decisions are recorded in `docs/specs/chat-commands.md`.

## Out of scope

Muting a whole conversation, scheduled sends, marking a message as silent in the UI after it is sent.
