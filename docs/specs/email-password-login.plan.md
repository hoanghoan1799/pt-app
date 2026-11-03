# Plan: Email and password login

## Source

- Intent: `intent/2026-11-03-email-password-login.md`
- Spec: `docs/specs/email-password-login.md`
- KAN key: KAN-82 (KAN-83 BE, KAN-84 FE admin, KAN-85 FE trainee, KAN-86 QA)

## Files that change

PR 1, KAN-83 [BE] (no visible change; name login untouched):

- `db/schema.ts`: `users.email`, `email_key` (unique), `password_hash`, `password_changed_at`; table `login_attempts`.
- `constants/password.ts`: generator alphabet, length 12, user password min 8 / max 128; lock constants (5, 15 min, 15 min).
- `services/password.ts`: `generatePassword()`.
- `utils/email.ts` (+ test): `toEmailKey`, Zod `emailSchema`.
- `services/login-limiter.ts` + pure `utils/login-limiter-rules.ts` (+ test): `checkLocked`, `recordFailure`, `clearAttempts`.
- `services/users.ts`: `findUserByEmail`, `setUserLogin`, `setUserPassword`.
- `services/auth-guard.ts` + `utils/session-staleness.ts` (+ test): reject sessions issued before `password_changed_at`.
- `features/auth/services/auth-actions.ts`: `loginWithEmailAction`, admin login wired to the limiter.
- `features/auth/services/password-actions.ts`: `changePasswordAction` (requireUser).
- `features/members/services/member-login-actions.ts`: `setMemberLoginAction`, `resetMemberPasswordAction` (requireAdmin, return the plain password once).
- `features/auth/constants/messages.ts`: new Vietnamese messages.

PR 2, KAN-84 [FE admin]:

- `features/members/components/CreateMemberForm`: email field; `createMemberAction` also sets email + generated password.
- `features/members/components/OneTimePassword` (new): password, copy button, warning.
- `features/members/components/MemberLoginCard` (new) on `app/admin/(protected)/users/[id]/page.tsx`: change email / reset password with confirm.
- `createMemberAction`: `requireAdmin()` then `createMemberWithLogin(name, email)` (built in PR 1).

PR 3, KAN-85 [FE trainee]:

- `features/auth/components/UserLoginForm`: email + password, forgot-password hint.
- `app/(user)/(protected)/account/password/page.tsx` + `features/auth/components/ChangePasswordForm` (new); link from the user header/menu.
- Remove `loginUserAction`, `RememberUser`, `use-remembered-name`, `utils/remembered-name.ts`, `REMEMBERED_NAME_KEY`, old messages; README update.

PR 4, KAN-86 [QA]: e2e specs for the matrix in the spec, browser proof at 390 px.

## Order of work

1. PR 1: schema (additive) first, then pure utils with tests, then services and actions. `pnpm verify`.
2. PR 2: admin UI.
3. PR 3: trainee login switch (no wait on PR 2 since existing trainees are deleted).
4. PR 4: e2e + browser proof (can start in parallel with PR 3 locally).

## Risks

- Lockout at release: none, existing trainees are deleted by Hoan (D10).
- Generated password leaking: returned only in the action result, never logged; `action-errors` logging does not include form values (checked in PR 1).
- Turso push: only nullable columns and a new table; unique index on a nullable column is allowed in SQLite (multiple NULLs).
- Limiter as a lockout weapon: someone can lock a trainee for 15 min by typing their email wrong 5 times. Accepted for a small gym app; the admin's reset does not clear the lock, the 15 minutes do.

## Proof

- Unit: `utils/__tests__/email.test.ts`, `utils/__tests__/login-limiter-rules.test.ts`, `utils/__tests__/session-staleness.test.ts`, `services/__tests__/password.test.ts` (generator).
- e2e per the spec matrix; `pnpm verify` before each PR.
- Browser proof (390 px): create member + password panel, reset, trainee login, change password, lock message.

## Deviations

- 2026-11-03, Hoan: delete all existing trainees instead of migrating them. Dropped `setMemberLoginAction`, the set-login form and the "no login yet" badge; PR 3 no longer waits on PR 2.
- PR 1: added `features/members/services/create-member-with-login.ts` (server-only helper; PR 2 calls it from `createMemberAction`) and `changeMemberEmailAction`; `setUserEmail` keeps sessions valid. The limiter also counts failures for unknown or malformed emails.
- PR 2: `FormState` gained an optional `credentials` field so `createMemberAction` can hand the generated password back once; the add-member sheet now stays open on success to show it and closes on "Xong" (`CreateMemberForm` prop `onCreated` became `onDone`). The create form shows per-field errors for name and email.
