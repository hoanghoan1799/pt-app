# Intent: Social profiles, friends and roles

- **Author:** Hoan
- **Status:** accepted
- **KAN key:** none (Hoan, 2026-11-08: skip Jira for this feature)

## Problem

pt-app only connects a trainee with the admins. Trainees cannot share progress photos, see each other's posts or talk to each other. There is one kind of admin, so a PT cannot get their own group of trainees.

## Proposed outcome

- Every account has a Facebook-like profile page with photo posts (privacy: everyone, friends, only me), reactions and comments. Super admin sees everything.
- Trainees add each other as friends by exact email, chat one to one and see a home feed of friends' and admins' posts.
- Admin accounts (super admin and PTs) carry a verified blue tick.
- Roles: super admin (today's admin), PT, trainee. A PT works only with the trainees in their workspace and can add trainees to it.

## Affected users and systems

Admins, trainees; `admins`, `users`, new social tables; chat access and push targets; user tab bar; admin dashboard.

## Constraints

Additive, nullable schema only (incident #121). Vietnamese UI copy. Integer ids kept. Photos in the DB like chat photos. E2E skipped, Jira skipped (Hoan, 2026-11-08).

## Open questions

Tracked as assumptions in `docs/specs/social-profiles.md` and the assumptions artifact for Hoan's later review.

## Out of scope

Cover photos, multi-photo posts, video, nested comments, public (signed-out) profiles, PT billing.
