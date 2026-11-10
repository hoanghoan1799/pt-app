# Private nicknames

Replaces the shared per-conversation nicknames of KAN-141 (`docs/specs/chat-ux-v2.md` D1 and D2, `chat_nicknames`). Plan: `docs/specs/private-nicknames.plan.md`. No Jira ticket (Hoan, 2026-11-10: skip Jira).

Source: Hoan's request for Zalo-style nicknames. Example: the super admin chats with trainee A; A renames the super admin in A's view. Only A sees that name; the super admin still sees their own real name, and everybody else still sees the real name. It works the other way round too: an admin can nickname a trainee privately.

## Decisions

- P1. A nickname (alias) belongs to ONE person, the owner, and is only ever shown to the owner. Nobody else can read it, not the person it names, not another admin, not the super admin. Replaces KAN-141 D1 ("visible to both sides"); the shared behaviour is gone.
- P2. Keys are actor keys, `user:<id>` and `admin:<id>` (same format as social reactions and `chat_reads.reader_key`; `parseActorKey` in `features/social/utils/engagement-rules.ts`). One special target, `pt`, is allowed only for a trainee owner and means "the PT side as a whole" in the trainee's chat header (the old `PT_TARGET_KEY` meaning).
- P3. Nobody nicknames themselves: the server rejects `owner == target`, the chat panel has no field for it, and the readers never apply a stray row to the viewer's own name.
- P4. Same rules as before for the value: trimmed, whitespace collapsed, at most 30 characters counted by code points (emoji and Vietnamese diacritics count once), no control characters; an empty value clears it; saving the stored value again is a no-op.
- P5. The owner is always the signed-in account, taken from the session, never from the input. Trainee actions call `requireUser()`, admin actions call `requireAdmin()` first; input is validated with Zod; errors go through `withResultErrorHandling` (`services/action-errors.ts`).
- P6. The owner must be able to see the target, otherwise the answer is "not found" and nothing is stored (same answer for a missing and a forbidden account, so ids cannot be probed):
  - Trainee: their PT side (`pt`), any admin account, or another trainee who accepted the terms and is not blocked either way.
  - Admin: a trainee in their workspace and not hidden from them (`canAdminAccessUser`: PT scope plus the hide/passcode rules), or another admin. Admins have no `pt` target.
  - Clearing (empty alias) always works, even when the target account is gone, so a stale row can be removed.
- P7. Scope of the display. The viewer's nicknames are applied everywhere another person's name is shown to that viewer:
  - Chat: thread header, chat info page, sender labels, reply quotes and reply bar, reactors sheet, message search, admin inbox, hidden-trainee list, admin member list, dashboard, and the admin trainee pages (title/summary/preview/nutrition).
  - Social: feed and profile posts, comments, reactor lists, the notification list, profile pages (nickname as the title with "Tên thật: <real name>" under it), friends lists and friend search, DM inbox and DM thread header, the quoted post in a DM.
  - Push: the title/text names the sender (chat message, chat reaction, DM, social notification) by the RECIPIENT's nickname when they have one; every recipient is resolved separately, so one admin's nickname never reaches another admin's device.
- P8. Not covered on purpose: the admin moderation screens (reports, admins reading the DMs of trainees) keep real names, because a moderator has to see who is who; the viewer's own name is never replaced; names inside the message text are not rewritten.
- P9. Realtime. Changing a nickname affects only the owner. The action refreshes the owner's pages (`revalidatePath("/", "layout")`) and the editor updates its own screen. It does NOT bump `chat_conversations.last_change_at` and does NOT publish a realtime event, so the other side's poll keeps answering 204 and nobody is notified. The owner's other tabs pick the change up on their next full payload or refresh.
- P10. The nickname is not tied to the chat lock: it changes nobody else's view, so the settings panel keeps it editable while the chat is locked (colours stay read-only).
- P11. Where to set it: the chat info page ("Tuỳ chỉnh", the existing `ChatCustomizePanel`, only the OTHER side, labelled "Chỉ bạn nhìn thấy biệt danh này") and, outside chat, a "Đặt biệt danh" icon button on another person's social profile page (trainee and admin side). Both use the same `AliasField` editor.
- P12. Existing data is moved once (see Data model). Deleting a trainee removes the nicknames they set and the ones set for them.

## Data model (additive only)

| Change                                                                                                                                                                                                                  | Notes                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| New table `contact_aliases`: `owner_key` text not null, `target_key` text not null, `alias` text not null, `updated_at` timestamp_ms not null; primary key `(owner_key, target_key)`; index `contact_aliases_owner_key` | One row per owner and target; a cleared alias deletes the row.                               |
| `chat_nicknames`                                                                                                                                                                                                        | Kept in the schema (additive rule) and marked Legacy. App code no longer reads or writes it. |

### One-time migration (`features/contact-aliases/services/legacy-nicknames-migration.ts`, run by `scripts/setup-database.ts`)

Precedent: `features/chat/services/hidden-users-migration.ts`. For every `chat_nicknames` row (joined to its conversation for the trainee):

- owner = `set_by_key`, with `user` mapped to `user:<conversation.user_id>`; `admin:<id>` stays.
- target = `target_key`, with `user` mapped to `user:<conversation.user_id>`; `pt` and `admin:<id>` stay.
- Skipped: owner equals target (someone who named themselves), an admin owner with target `pt`, unknown keys, empty or invalid values, and rows whose conversation is gone.
- Insert or ignore, keeping `updated_at`; an alias that already exists is never overwritten.
- Then the legacy table is emptied in the same transaction. This matters: the script runs on every build, and a leftover row would bring back an alias its owner has since cleared. The cost is that a rollback to a build that still reads `chat_nicknames` finds it empty.

Consequence for users: a nickname that used to be shared now belongs to whoever set it (a nickname the PT gave a trainee is the PT's alone; the trainee sees their real name again). That is the requested behaviour.

## API

- Table: `contact_aliases` (`contactAliases` in `db/schema.ts`).
- Server actions, both in `features/contact-aliases/services/contact-alias-actions.ts`, input `{ targetKey: string; alias: string }`, result `{ status: "success"; targetKey; alias } | { status: "error"; message }`:
  - `setContactAliasAction` (trainee, `requireUser()`), targets `user:<id>`, `admin:<id>`, `pt`.
  - `adminSetContactAliasAction` (admin, `requireAdmin()`), targets `user:<id>`, `admin:<id>`.
- Services (`features/contact-aliases/services/contact-aliases.ts`): `loadAliases(ownerKey, targetKeys)`, `loadAllAliases(ownerKey)`, `loadTraineeAliases(adminId, userIds)`, `loadAliasesForOwners(ownerKeys, targetKeys)`, `setAlias(ownerKey, targetKey, alias)`.
- Pure rules (`features/contact-aliases/utils/alias-rules.ts`): `aliasValueSchema`, `setAliasInputSchema`, `checkAliasTarget`, `overlayName`, `aliasesToConversationNicknames`, `mapLegacyNickname`.
- Removed: `setNicknameAction`, `adminSetNicknameAction`, `setConversationNickname`.
- Changed signatures: `loadChatProfile(conversationId, viewerKey)`, `loadAccounts(keys, viewerKey?)` (adds `realName`), `getProfile(kind, id, viewerKey?)` (adds `realName`, `alias`), `loadPeople(ids, viewerId?)`, `getTraineeDisplayName(adminId, user)`.

## Test matrix

| Rule                                               | Test                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2, P4 key and value validation                    | `features/contact-aliases/utils/__tests__/alias-rules.test.ts`                                                                                    |
| P3 self is rejected and never applied              | `alias-rules.test.ts` (`checkAliasTarget`, `aliasesToConversationNicknames`), `contact-alias-actions.test.ts`, `social-aliases.test.ts`           |
| P5 owner from the session, Zod input               | `features/contact-aliases/services/__tests__/contact-alias-actions.test.ts`                                                                       |
| P6 target visibility, scope, hidden, blocked       | `contact-alias-actions.test.ts`, `services/__tests__/pt-workspace-guard.test.ts`                                                                  |
| P1 viewer sees the alias, target and others do not | `chat-profile.test.ts` (payload per viewer), `chat-queries.test.ts`, `chat-hidden.test.ts`, `dashboard-queries.test.ts`, `social-aliases.test.ts` |
| P7 social surfaces                                 | `features/social/services/__tests__/social-aliases.test.ts` (accounts, posts, comments, reactors, notifications, profile, people, DM inbox)       |
| P7 push, per recipient                             | `chat-push.test.ts`, `chat-reaction-push.test.ts`, `chat-message-actions.test.ts`, `social-aliases.test.ts`                                       |
| P9 no cursor bump, no event                        | `chat-profile.test.ts` ("does not move the change cursor when a nickname changes"), `contact-alias-actions.test.ts` (revalidate only on change)   |
| P12 deleting a trainee                             | `features/members/services/__tests__/member-actions.test.ts`                                                                                      |
| Migration mapping, idempotence, no resurrection    | `alias-rules.test.ts` (`mapLegacyNickname`), `legacy-nicknames-migration.test.ts`                                                                 |
| UI strings in vi, en and zh                        | `i18n/__tests__/messages.test.ts`                                                                                                                 |
| Browser flow (not run in CI here)                  | `e2e/chat-settings.spec.ts` (private nickname, no self field, lock does not disable it)                                                           |

## Open questions

- None blocking. Possible follow-ups: show nicknames on the admin moderation screens behind a toggle; let a trainee name a PT from the friends list.
