# Plan: Social profiles, friends, roles and PT workspaces

## Source

- Intent: `intent/2026-11-08-social-profiles.md`
- Spec: `docs/specs/social-profiles.md`
- KAN key: none (Jira skipped by Hoan)

## Delivery

One PR per phase into `stag` (branch from `origin/stag`), self-merged when the `checks` gate is green (e2e ignored). Final release PR `stag` -> `main` for Hoan. Every phase: additive nullable schema, unit tests for rules and services (`createTestDb`), `pnpm verify` green.

## Order of work

### P1 Roles and workspace scope
- Schema: `admins.role`, `admins.verified_at`, `users.pt_admin_id`.
- `services/env.ts`: `getSuperAdminCredentials()` reads `SUPER_ADMIN_*`, falls back to `ADMIN_*`; `scripts/setup-database.ts` and `scripts/create-admin.ts` use it.
- `services/admins.ts` / `auth-guard.ts`: admin object gets `role` (null -> `super_admin`) and `verified`; `requireSuperAdmin()`.
- `services/hidden-users.ts` `canAdminAccessUser`: PT only for `users.pt_admin_id = adminId`. Admin user lists, dashboard, inbox, unread and push targets (`chat-push.ts loadTargets`) filtered by scope via one helper `adminScopeFilter(admin)`.
- New page `/admin/pts` (super admin): create PT (username + password), toggle tick, assign trainees (select on trainee detail page).
- `VerifiedBadge` component, shown next to admin names in chat header/inbox.

### P2 Terms, profile, posts, privacy
- Schema: `users.bio/terms_*/post_privacy_default`, `admins.bio`, `social_posts`, `social_post_photos`.
- `features/social/`: `utils/visibility.ts` (pure, fully tested), `services/post-*.ts`, `services/terms.ts`.
- Routes: `/terms`, `/feed` (own + visible posts for now), `/u/[kind]/[id]` profile, `/admin/social` (admin feed + profiles). Photo upload `POST /api/social/photos`, serve `GET /api/social/photos/[id]` with `canSeePost`.
- Tab bar gets "Bảng tin". Composer reuses `encode-photo.ts`.

### P3 Reactions, comments, notifications
- Schema: `social_reactions`, `social_comments`, `social_notifications`.
- Actions for react/comment/edit/delete; notifications page + unread dot; push via existing `sendPush` plumbing with hourly batching for reactions.

### P4 Friends, feed, block, report
- Schema: `social_friendships`, `social_blocks`, `social_reports`.
- Exact-email search, request/accept/decline/unfriend, block/unblock, report; feed query = own + friends + in-scope admins, minus blocks/hidden; `/admin/reports` for super admin.

### P5 Trainee-to-trainee chat
- Schema: `dm_conversations`, `dm_messages`, `dm_reads`, photos reuse `social_post_photos`-style table `dm_photos`.
- `/friends/[id]/chat` text + photo, unsend, read marks, polling; Messages tab lists the admin chat first, then friend chats. Super admin read-only viewer `/admin/social/chats`.

### P6 PT workspace
- PT can create trainees (assigned to self) via existing create-member flow; PT dashboard shows only own trainees; super admin dashboard filter by PT.

### Release
- PR `stag` -> `main` with the phase summary and Hoan's manual steps (Vercel env `SUPER_ADMIN_USERNAME`/`SUPER_ADMIN_PASSWORD`, review terms copy, assumptions artifact).

## Risks

- Scope leak (PT seeing other trainees, private posts leaking): one visibility helper + one scope helper, tested per rule; photo routes 404 on any doubt.
- Schema push on Vercel: nullable columns only, new tables only.
- DB size from photos: one photo per post, 400 KB cap.
- Big UI surface: mobile-first, reuse chat components.

## Proof

- `pnpm verify` per phase; tests in `features/social/**/__tests__`, `services/__tests__`.
- Browser check of main flows on a local DB per phase where the cloud session allows.

## Deviations

(updated per phase)

- P2: profile route is `/profile/[kind]/[id]` (not `/u/...`), admin side `/admin/social/profile/[kind]/[id]`. A PT sees all posts (any privacy) of their own trainees; staff see each other's non-private admin posts. Deleted posts are soft-deleted (photo bytes dropped); member delete removes posts hard. Post photo cache is `private, max-age=3600` (not immutable) because visibility can change.
- P3: post page is `/post/[id]` (admin `/admin/social/post/[id]`), notifications `/notifications` (admin `/admin/social/notifications`). `social_notifications.pushed_at` added (throttle). Every reaction/comment read and write goes through `loadVisiblePost` = `canSeePost` plus the admin scope/hidden-trainee check, so a PT or hidden-trainee case behaves like the admin pages. Removing a reaction also deletes its notification; a changed reaction refreshes the same notification (new time, unread). Each comment makes its own notification. Deleted comments stay as an emptied tombstone (`deleted_at`) and are hard-deleted with the post. The chat emoji picker is inline in `MessageActionsSheet`, so social has its own small `ReactionPicker` (same emoji and look). Long-press uses a plain timer, not the chat double-tap tracker. The bell shows a count (server-rendered) in the feed and admin social headers only. Notifications are marked read when the page loads (after listing them). `chat-push.ts` now exports `deliver`, `getVapid` and `sendWithWebPush` for reuse. Comment pushes carry a 60-char preview; the text is never stored on the notification. `social-actions.ts` actor helpers moved to `actor-guard.ts`.
