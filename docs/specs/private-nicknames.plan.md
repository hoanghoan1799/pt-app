# Plan: Private nicknames

Replaces the shared nicknames of KAN-141. Built in one branch (`feat/private-nicknames`, from `origin/main`).

## Source

- Intent: none (request came from Hoan in chat, 2026-11-10)
- Spec: `docs/specs/private-nicknames.md`
- KAN key: none (Hoan said skip Jira)

## Files that change

Schema and data:

- `db/schema.ts`: new `contactAliases` table; `chatNicknames` marked Legacy.
- `features/contact-aliases/services/legacy-nicknames-migration.ts` (new) and `scripts/setup-database.ts`: one-time copy of `chat_nicknames` into `contact_aliases`, then empty the legacy table.
- `features/members/services/member-actions.ts`: deleting a trainee also removes the aliases they set and received.

New feature `features/contact-aliases/`:

- `utils/alias-rules.ts`: keys, Zod schemas, `checkAliasTarget`, `overlayName`, `aliasesToConversationNicknames`, `mapLegacyNickname`.
- `services/contact-aliases.ts`: `loadAliases`, `loadAllAliases`, `loadTraineeAliases`, `loadAliasesForOwners`, `setAlias`.
- `services/alias-access.ts`: may this owner see this target.
- `services/contact-alias-actions.ts`: `setContactAliasAction`, `adminSetContactAliasAction`.
- `components/AliasField` (the editor extracted from `ChatCustomizePanel`, on `components/common/Input`) and `components/AliasEditor` (profile button + `BottomSheet`, `IconButton`).
- `constants/messages.ts`, `types/contact-aliases.ts`.

Chat:

- `features/chat/services/chat-profile.ts`: `loadChatProfile(conversationId, viewerKey)` returns the viewer's aliases translated to the conversation keys; `setConversationNickname` removed. `chat-profile-actions.ts`: nickname actions removed.
- Callers pass the viewer key: `chat-thread.ts`, `app/api/admin/chat/[conversationId]/messages/route.ts`, the admin and trainee messages, info and search pages.
- `features/chat/services/chat-queries.ts`: inbox, `getTraineeDisplayName(adminId, user)` read the viewing admin's aliases; the cursor is no longer bumped for nicknames. Same for `chat-hidden.ts`, `members/services/member-queries.ts`, `dashboard/services/dashboard-queries.ts` and the four admin trainee pages.
- `features/chat/services/chat-push.ts` and `chat-mutations.ts`: the push title uses each recipient's own nickname (devices grouped by resulting name); the reaction push carries the reactor key.
- `features/chat/utils/chat-rules.ts`, `chat-settings.ts`, `display-name.ts`: constants re-exported from the alias rules, `settingsTargets` offers only the other side.
- `features/chat/components/ChatCustomizePanel`, `ChatInfo`: private nickname for the other side only, helper text, not disabled by the lock.

Social:

- `features/social/services/account-lookup.ts`: `loadAccounts(keys, viewerKey?)` with `realName`. Callers: `engagement-queries.ts`, `social-notifications.ts` (list and push).
- `post-queries.ts`, `dm-reply-post.ts`, `dm-queries.ts`, `friend-queries.ts`, `profile-queries.ts`: overlay the viewer's aliases. `dm-notify.ts`: DM push title.
- `features/social/components/ProfileView` and the two profile pages: nickname as title, real name underneath, "Đặt biệt danh" button.

Strings and tests:

- `messages/{vi,en,zh}/common.json` (`alias`), `errors.json` (`alias`), `chat.json` (`customize`), `social.json` (`profile.realName`).
- Tests listed in the spec's test matrix; `e2e/chat-settings.spec.ts` follows the new behaviour.

## Order of work

1. Schema: `contact_aliases` (additive), Legacy note on `chat_nicknames`.
2. Pure rules and their tests (including the migration mapping).
3. Services, access check and server actions, with tests.
4. Migration function and its hook in `scripts/setup-database.ts`.
5. Chat: profile loader, queries, hidden list, member list, dashboard, admin pages, push; update the chat tests.
6. Social: `loadAccounts` and each surface; new `social-aliases.test.ts`.
7. UI: `AliasField`, `AliasEditor`, `ChatCustomizePanel`, `ProfileView`; strings in vi, en and zh.
8. Docs, e2e update, `pnpm verify`, `pnpm build`.

## Risks

- Behaviour change on release: shared nicknames become private to whoever set them. A trainee loses sight of the nickname the PT gave them. Intended, but worth a line in the release notes.
- The migration empties `chat_nicknames` on the first Vercel build after the merge. A rollback to the previous build finds no nicknames (they live in `contact_aliases`); roll forward instead, or copy back by hand.
- Several extra small queries (one per list) to load aliases; each is a single indexed lookup by owner and targets. The chat thread payload loads the viewer's aliases once per poll, which is one more query on the hot path; it is only a full payload (not the 204 fast path).
- A nickname change does not wake the owner's other tabs (by design, P9); they catch up on the next full payload.
- A surface that still reads a real name directly would leak nothing, but would show the real name to the owner; the admin moderation screens are left as they are on purpose (P8).

## Proof

- `pnpm verify` (tests, lint, typecheck) and `pnpm build`.
- New and updated tests: see the spec's test matrix.
- Browser (`browser-proof`) for the two UI changes: the chat info "Tuỳ chỉnh" panel (one field, helper text, still editable when locked) and the profile "Đặt biệt danh" sheet. Not run in this session; `e2e/chat-settings.spec.ts` was updated but not executed.

## Deviations

- None so far.
