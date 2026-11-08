# Social profiles, friends, roles and PT workspaces

Intent: `intent/2026-11-08-social-profiles.md`. Plan: `docs/specs/social-profiles.plan.md`. No KAN key (Hoan skipped Jira for this feature).

## Goal

A small social layer on top of pt-app (profiles, photo posts, reactions, comments, friends, feed, trainee-to-trainee chat, verified badge) plus roles (super admin, PT, trainee) so a PT works only with the trainees in their workspace.

## Decisions (grill-me, Hoan, 2026-11-08)

### Round 1: scope and roles

- Q1 Phases: P1 roles + workspace scope, P2 terms + profile + posts + privacy + blue tick, P3 reactions + comments + notifications, P4 friends + feed + block + report, P5 trainee chat, P6 PT adds trainees.
- Q2 `admins.role` column (`super_admin` | `pt`); null means `super_admin`, so today's admin(s) become super admin with no data step. PT is an admin account with narrower rights, no new table.
- Q3 Env renamed to `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`; the old `ADMIN_USERNAME` / `ADMIN_PASSWORD` are still read when the new ones are missing.
- Q4 Admins are default friends: super admin of every trainee, a PT of the trainees in their workspace. Trainees keep their chat with the admin side as today.
- Q5 Friend request + accept. Search only by the exact full email (trimmed, case-insensitive), never by prefix, so emails cannot be enumerated.
- Q6 Super admin can read trainee-to-trainee chats (read-only). No in-chat notice; the Terms page states it. PTs cannot read them.
- Q7 Post photos stored in the DB like chat photos (browser resize, WebP, long side <= 1600 px), served through a route that checks privacy. **One photo per post** (Hoan).

### Round 2: posts, feed, notifications

- T1 Terms page `/terms` (Vietnamese). A trainee must accept it before using social features (posting, friends, trainee chat). Acceptance stores the terms version and time; a new version requires accepting again.
- R1 A post is an optional single photo plus a caption up to 2000 characters; at least one of them.
- R2 The author edits caption and privacy (not the photo) and deletes the post (photo, reactions and comments go with it). Super admin deletes any post or comment.
- R3 Default privacy "Bạn bè"; the composer remembers each person's last choice.
- R4 Six reactions, one per person per post, long-press to pick, tap = ❤️. Same emoji set as chat (`CHAT_REACTION_EMOJIS`).
- R5 Comments are flat and text only. The author edits or deletes their comment; the post author deletes comments on their post. Anyone who can see a post can comment on it.
- R6 Home feed, newest first: own posts, friends' posts (everyone + friends), admins' posts visible to the viewer. Strangers' "everyone" posts appear only on their profile.
- R7 Push + unread dot + a "Thông báo" page for: friend request, request accepted, reaction, comment. Reaction pushes are batched (at most one per post per hour).

### Round 3: badge, PT, moderation, profile

- V1 Blue tick for super admin and PT accounts; only super admin grants or removes it. Trainees cannot request one.
- W1 Each trainee belongs to at most one PT (`users.pt_admin_id`, null = super admin only). Until P6 only super admin assigns; from P6 a PT creates trainees in their own workspace.
- W2 A PT sees and chats only with their workspace's trainees (workouts, nutrition, chat, posts with admin rights). Super admin sees everyone. The trainee chat is shared by the super admins and that trainee's PT.
- W3 Friendship is not limited by workspace.
- M1 Report (post, comment, user) and block. Reports land on an admin page for super admin. Block: the two cannot find each other, see each other's posts or comments, or chat; any friendship ends.
- P1 Profile: avatar (existing), name, bio (150 chars), friend count, post grid/list. No cover photo yet.
- O1 (a) Admin "hide trainee" stays and also hides that trainee's posts from that admin's feed. (b) "Every account sees the admin" = admins' name + tick visible to everyone; no admin email is added. (c) Admins and PTs keep username login.

### Delivery (Hoan, 2026-11-08)

- Claude picks unclear points itself and records them as assumptions (section below and the assumptions artifact) for Hoan's later review.
- Each phase is its own PR into `stag`, self-merged when CI (non-e2e) is green. Hoan reviews only the final release PR `stag` -> `main`.
- Jira and e2e skipped. Unit tests still required.

## Visibility rules (single source: `features/social/utils/visibility.ts`)

`canSeePost(viewer, post)`:
1. Super admin: always.
2. Viewer is the author: always.
3. Viewer and author block each other (either way): never.
4. `only_me`: no.
5. `everyone`: yes for any signed-in account.
6. `friends`: yes if friends, or viewer is an admin who is a default friend of the author (super admin; PT of that trainee).
A PT viewing their own trainee's post always sees it (admin rights on their workspace).
Admin posts: authors are admins; `friends` = all trainees in scope (super admin: everyone; PT: own trainees).

## Data model (additive; FKs not enforced, deletes by hand)

- `admins.role` text null (null = super_admin), `admins.verified_at` int null, `admins.bio` text null.
- `users.pt_admin_id` int null, `users.bio` text null, `users.terms_version` int null, `users.terms_accepted_at` int null, `users.post_privacy_default` text null.
- `social_posts` (id, author_kind 'user'|'admin', author_id, caption, privacy, photo_id null, created_at, updated_at, deleted_at null).
- `social_post_photos` (id, uploader_key, post_id null = pending, mime, width, height, data blob, size, created_at).
- `social_reactions` (post_id, reactor_key, emoji, created_at) PK (post_id, reactor_key).
- `social_comments` (id, post_id, author_key, body, created_at, updated_at, deleted_at).
- `social_friendships` (user_low, user_high, status 'pending'|'accepted', requested_by, created_at, accepted_at) PK (user_low, user_high).
- `social_blocks` (blocker_id, blocked_id, created_at) PK.
- `social_reports` (id, reporter_key, target_kind, target_id, reason, status 'open'|'resolved', created_at, resolved_by, resolved_at).
- `social_notifications` (id, recipient_key, kind, actor_key, post_id null, created_at, read_at null).
- `dm_conversations` (id, user_low, user_high unique pair, last_message_at, created_at), `dm_messages` (id, conversation_id, sender_id, body, photo_id null, client_id, created_at, deleted_at), `dm_reads` (conversation_id, user_id, last_read_message_id).
Keys: `user:<id>` / `admin:<id>` like chat reactor keys.

## Assumptions (Claude, for Hoan's review)

A1 Admin posts appear in every in-scope trainee's feed (super admin: all; PT: own trainees).
A2 Post photo max 400 KB after resize, WebP; same checks as chat photos.
A3 Feed and profile load 20 posts per page with a "Xem thêm" cursor; no realtime, refresh on open.
A4 Notifications kept 60 days; the page shows the latest 50.
A5 Friend requests: at most 20 sent per day per trainee (`rate_limits` table). Declining deletes the request, so it can be sent again later.
A6 Trainee chat (P5) v1: text + one photo per message, unsend, read marks, polling every 5 s (Ably if configured on channel `dm:<id>`); no stickers, edits, replies or reactions yet.
A7 Trainee chat requires both to be accepted friends and both to have accepted the terms; unfriend or block makes the chat read-only.
A8 Terms content is a Claude draft (version 1) for Hoan to edit; changing it = bump `TERMS_VERSION`.
A9 A trainee who has not accepted the terms can still use workouts, nutrition and admin chat; the Feed tab shows the terms screen.
A10 User tab bar becomes 5 tabs: Bảng tin (feed), Tập luyện, Dinh dưỡng, Tin nhắn, Tổng kết; profile and notifications are reached from the feed header.
A11 PT accounts are created by super admin on a new "Quản lý PT" admin page (username + password); a PT has no access to: PT management, reports, other PTs' trainees, food library editing (read-only), trainee chats.
A12 Deleting a trainee also deletes their posts, photos, reactions, comments, friendships, blocks, notifications and trainee chats.
A13 Hidden trainees (O1a) stay accessible to a PT only in their workspace; hiding is still per admin.
A14 Reports: super admin can resolve (keep) or delete the target; no automatic actions.
A15 Push for social events uses the existing push subscription table and VAPID; silently skipped without VAPID.

## Out of scope

Cover photos, multi-photo posts, video, nested comments, mentions, hashtags, shares, stories, post search, PT-to-PT features, signed-out profiles, e2e tests.
