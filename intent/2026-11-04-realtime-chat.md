# Intent: Trainees and PTs chat inside the app

- **Author:** Hoan
- **Status:** draft
- **KAN key:** KAN-96

## Problem

A trainee who has a question about today's workout or meal plan has to leave pt-app and message the PT on Zalo or Messenger. The PT then has to find the trainee's plan in the admin to answer. Questions get lost between apps, and nothing links a conversation to the trainee's data.

## Proposed outcome

- Chat is off for every trainee by default. An admin turns it on (or locks it again) per trainee at any time; only trainees the admin allowed can message the PTs (Hoan, 2026-11-04).
- An allowed trainee can send a message to their PT from inside the app and see the reply without reloading.
- PTs see every trainee conversation in the admin, with an unread count, and can answer from the member page.
- New messages show a badge in the app and, once the app is installed, a phone notification.

## Affected users and systems

Trainees (new "Nhắn tin" tab), admins (inbox page, member page, dashboard), new chat tables in Turso, the service worker (push), member delete path, README.

## Constraints

Additive schema only (the Vercel build runs `drizzle-kit push` on Turso). Vietnamese UI copy, mobile-first 390 px. Stay on Vercel Hobby + Turso free tiers if possible. The parked NestJS/admin split (PR #63) must not be started.

## Open questions

See `docs/specs/realtime-chat.md` section 13.

## Out of scope

Group chat, trainee-to-trainee chat, voice/video calls, message search, end-to-end encryption, chat with an AI bot.
