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
- `features/members/components/MemberLoginCard` (new) on `app/admin/(protected)/users/[id]/page.tsx`: set login / change email / reset password with confirm.
- Admin member list: "Chưa có đăng nhập" badge.

PR 3, KAN-85 [FE trainee]:

- `features/auth/components/UserLoginForm`: email + password, forgot-password hint.
- `app/(user)/(protected)/account/password/page.tsx` + `features/auth/components/ChangePasswordForm` (new); link from the user header/menu.
- Remove `loginUserAction`, `RememberUser`, `use-remembered-name`, `utils/remembered-name.ts`, `REMEMBERED_NAME_KEY`, old messages; README update.

PR 4, KAN-86 [QA]: e2e specs for the matrix in the spec, browser proof at 390 px.

## Order of work

1. PR 1: schema (additive) first, then pure utils with tests, then services and actions. `pnpm verify`.
2. PR 2: admin UI. After deploy Hoan sets a login for each existing trainee.
3. PR 3: trainee login switch, merged only after Hoan confirms step 2 is done.
4. PR 4: e2e + browser proof (can start in parallel with PR 3 locally).

## Risks

- Lockout at release: avoided by D10 ordering; PR 3 waits for Hoan's go.
- Generated password leaking: returned only in the action result, never logged; `action-errors` logging does not include form values (checked in PR 1).
- Turso push: only nullable columns and a new table; unique index on a nullable column is allowed in SQLite (multiple NULLs).
- Limiter as a lockout weapon: someone can lock a trainee for 15 min by typing their email wrong 5 times. Accepted for a small gym app; the admin's reset does not clear the lock, the 15 minutes do.

## Proof

- Unit: `utils/__tests__/email.test.ts`, `utils/__tests__/login-limiter-rules.test.ts`, `utils/__tests__/session-staleness.test.ts`, `services/__tests__/password.test.ts` (generator).
- e2e per the spec matrix; `pnpm verify` before each PR.
- Browser proof (390 px): create member + password panel, reset, trainee login, change password, lock message.

## Deviations

None yet.
