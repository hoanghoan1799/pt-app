# Company sync — 2026-11-18

Source: remote `company` (`hoanhoang-agilityio/pt-app`), fetched with `git fetch company --tags` and `git fetch origin` on 2026-11-18.
Nothing was pushed. `feat/backend` was not touched.

## 1. Branch state

| Branch | local (before) | company | origin (personal) | Result |
|---|---|---|---|---|
| `main` | `93432f2` | `8f0e085` (62 commits ahead, 0 behind) | `bde444f` | local `main` fast-forwarded to `8f0e085` |
| `stag` | `98dc33d` | `98dc33d` | `98dc33d` | already identical, nothing to do |

- **Divergence between company and origin on `main`.** `company/main` and `origin/main` share the merge-base `93432f2`. `origin/main` has 3 commits company does not have (2026-11-12, workflow-only, PR #3 "add-claude-github-actions": `claude-code-review.yml` and the Claude PR assistant workflow). Company has the 62 new commits. Local `main` now equals `company/main`, so it is 62 ahead / 3 behind `origin/main`. Do NOT push local `main` to `origin/main`: it would not be a fast-forward, and a push there deploys Vercel production.
- `stag` is 118 commits behind `company/main` (stag = last release, tag `v1.7.0` = `1c357a1`, 2026-11-09). Company has not promoted this work to `stag` yet. No new tags.
- Active company branches since the last sync are all already merged into `company/main` (PRs #199–#213); the `claude/project-thread-*` branches are bot branches, ignored.
- Worktree `.claude/worktrees/agent-a371b16362e0e7704` (`feat/cleanup-web`): status clean, not touched. Main worktree is on `feat/api-auth` with an untracked `.claude/scratch-auth.txt` (not mine, not touched).

## 2. What changed (`93432f2..8f0e085`, 62 commits, 39 non-merge, 2026-11-12 → 11-17)

336 files, +29 093 / −2 022. Old layout (flat `db/`, `features/`, `app/`), same as the old `main`. **No changes** to `package.json`, lockfile, `.github/`, `drizzle.config.ts` or other config, so no dependency or CI changes.

### Features

- **Group chat** (PRs #202–#204, spec `docs/specs/group-chat.md`): named chats of trainees + PTs + every super admin. Services, server actions, API routes, unread payload, PT-change alert hook, member-delete cleanup, admin screens (`/admin/messages/groups/...`), trainee screens (`/messages/groups/...`), unread badge. Biggest change: 16 service files in `features/chat-groups`.
- **Admin block user** (#199): `user_restrictions`, levels `restricted` / `suspended`, optional expiry, super admin only; restricted blocks chat and social writes, suspended blocks login and hides the trainee.
- **Report chat messages** (#201): report a chat or group message with a reason list; admin queue, hide, super admin push.
- **Accent color** (#206, #207): super admin picks the app color per scope (`all` / `trainee` / `pt`), per-user personal color, super admin locks per role. New `/settings/theme` and `/admin/settings/theme`.
- **Multi-photo posts** (#208) and **multi-photo chat** (#211): up to 10 photos per post or message, ordered by `position`.
- **Messenger nicknames** (#209): shared chat nicknames per conversation are live again (`chat_nicknames`), replacing private aliases inside chat. The one-time `legacy-nicknames-migration` and its setup step were removed. `contact_aliases` stays for use outside chat.
- **App icon badge** (#212): service worker `public/sw.js` sets the Badging API count from `/api/chat/unread` (`appBadge` now counts chats + groups + social notifications).

### Fixes / small

- #205 coach photo in the trainee inbox and chat header; #210 chat header shows only the name; #213 keep unsent chat content, flag only; #200 search back-state; new routes in `constants/routes.ts`, `/settings/:path*` in `proxy.ts`.
- i18n: `messages/{en,vi,zh}` gained strings for all of the above (10 files each).

### Schema / DB (`db/schema.ts`) — see section 4

### Deps / CI

None.

### Docs

12 files under `docs/specs/` (specs and plans for the features above) plus `intent/2026-11-14-group-chat.md`.

## 3. Impact on `feat/backend` (not applied, only assessed)

Nothing in `origin/feat/backend` references group chat, restrictions, theme/accent, `reason_code` or photo `position`. Its migrations `Baseline` and `DbChatSocial` also **drop** `chat_nicknames` (entities test says "chat_nicknames dropped"), which company has now revived.

| Company change | Needed on `feat/backend`? | Where |
|---|---|---|
| Group chat (7 new tables, services, routes, unread payload, system lines, PT-change alert, member-delete cleanup, push) | Yes, the largest port | New API module `apps/api/src/chat-groups` (or inside `chat`), TypeORM entities + migration, realtime/poll cursor, push; web BFF routes under `/messages/groups/*` and `/admin/messages/groups/*`; contracts Zod for group payloads |
| User restrictions (`user_restrictions`) | Yes | `users` / `admins` API module: restriction guard on chat and social writes, login block for `suspended`, hidden-from-others filter in social/search; entity + migration; admin endpoints |
| Report messages (`reason_code`, `target_kind` + `message`/`group_message`, `resolution` + `hidden`) | Yes | `social` reports endpoints and admin queue; hide action in `chat`; changes enums, so contracts + DB check/enum update |
| Accent color (`theme_settings`, `theme_locks`, `admins.accent_color`, `users.accent_color`) | Yes | New small `theme` module (or `users`/`admins`); web BFF `/settings/theme`, `/admin/settings/theme`; contracts |
| Multi-photo (`position` on `chat_photos`, `social_post_photos`, `dm_photos`, `chat_group_photos`; limit 10) | Yes | `chat`, `social`, `dm` photo services (upload, order, cover = position 0, null counts as 0); gallery query in `chat-gallery.service.ts` joins on `m.photo_id` and keeps working for the cover |
| Messenger nicknames (revive `chat_nicknames`, remove legacy migration, `alias-rules` helpers removed) | Yes, and it reverses a backend decision | Restore `chat_nicknames` in the `chat` module: need to undo the "dropped" step of `DbChatSocial`; decide whether `contact_aliases` module keeps only non-chat use |
| App icon badge (`sw.js`, `appBadge` in `/api/chat/unread`) | Yes, small | `chat` unread endpoint must return `appBadge` (chats + groups + social notifications); web BFF passes it through; `public/sw.js` copy into `apps/web/public` |
| `constants/routes.ts`, `proxy.ts` (`/settings/:path*`), i18n messages (en/vi/zh) | Yes, web only | `apps/web` (routes, middleware matcher, messages) |
| Fixes #200, #205, #210, #213 | Yes, web only (UI) | Re-apply in `apps/web`; no API change except #205 (coach avatar field in inbox/thread payload, check it exists) |

Suggested order: (1) schema decision below, (2) nicknames revival + photo `position` + report columns (small), (3) restrictions + theme, (4) group chat, (5) web BFF and i18n, (6) badge.

## 4. Schema changes and the frozen Turso DDL — action required before cutover

`apps/api/scripts/turso-schema.sql` (frozen, 44 tables) and `turso-columns.json` on `origin/feat/backend` match the `db/schema.ts` at `93432f2`. Company `db/schema.ts` has moved. Differences:

**New tables (9):** `user_restrictions`, `chat_groups`, `chat_group_members`, `chat_group_messages`, `chat_group_reactions`, `chat_group_message_edits`, `chat_group_photos`, `theme_settings`, `theme_locks`.

**New columns:** `admins.accent_color` (text, null), `users.accent_color` (text, null), `chat_photos.position`, `social_post_photos.position`, `dm_photos.position` (integer, null), `social_reports.reason_code` (text, null, enum).

**Enum widening (text columns, no DDL change but the PG side/contracts must allow them):** `social_reports.target_kind` + `message`, `group_message`; `social_reports.resolution` + `hidden`.

**Revived table:** `chat_nicknames` is live again. The backend dropped it, so the Turso→PG script must copy it again, and the PG schema must have it.

**Not an issue:** `theme_*` tables use `unixepoch()` defaults and FKs to `admins` (`ON DELETE SET NULL`); `chat_group_*` has no FKs (by design D10). No Drizzle migration folder exists on company (schema is applied with `drizzle-kit push` at build), so there is no migration SQL to import; the DDL must be regenerated from the schema.

**Decision needed (this decides whether the frozen DDL must change):**
- If production on `origin/main` (personal, Vercel + Turso) will **not** receive these company commits before cutover, the frozen DDL still matches the prod Turso and needs no update. These features would then be ported to NestJS and simply have no legacy data to copy.
- If these commits are merged into `origin/main` and `drizzle-kit push` runs on the prod Turso, the prod DB will have the new tables and columns. Then regenerate `turso-schema.sql` and `turso-columns.json` from the new `db/schema.ts` (+ the 9 tables, 6 columns, and `chat_nicknames` stays), extend the data script and `turso-columns.test.ts`, and add the matching TypeORM entities and migration before the one-time copy. Also note that "freeze" then becomes a moving target while the company keeps adding features: pick a freeze commit.

Either way the PG migration set needs the new tables/columns for the ported features.

## 5. Notes

- Company `main` also still has the `contact_aliases` feature; only the chat-specific helpers (`aliasesToConversationNicknames`, `conversationKeyToTarget`) were removed.
- `origin/main` was not changed; local `main` now diverges from it (62 ahead / 3 behind). Reconcile later by merging `origin/main`'s 3 workflow commits, or just keep personal `main` as is. Do not force anything.
