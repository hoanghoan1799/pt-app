# Intent: Admin passcode lock, hidden chats, header settings

- **Author:** Hoan
- **Status:** accepted
- **KAN key:** KAN-160

## Problem

An admin's phone stays signed in, so anyone holding it can read every trainee chat. Some conversations should not even show in the inbox. Avatar and account colour are buried in each chat's settings sheet, and an admin cannot hide their online status. In a chat, the settings sheet shows your own avatar picker instead of the other person's photo.

## Proposed outcome

- A 4-digit passcode locks the admin app while signed in (not on the login screen).
- Admins hide chats behind the same passcode and find them again by typing it into the inbox search.
- Avatar (everyone), account colour and presence On/Off (admins) live in the header menus.
- In a chat, the other person's photo is shown and can be enlarged.

## Affected users and systems

Admins (PTs) mostly; trainees only through the moved avatar item and the hidden admin presence. Tables `admins`, new `chat_hidden_conversations`; admin auth guard; admin inbox, unread count, push; header menus; chat settings sheet.

## Constraints

Additive schema only. Vietnamese UI copy. E2E skipped for now; PRs target `main` (Hoan, 2026-11-07).

## Open questions

None left; see the decision log in `docs/specs/admin-passcode-hidden-chats.md`.

## Out of scope

Admin change-password page, passcode for trainees, hiding messages inside a conversation, e2e (KAN-166, Pending).
