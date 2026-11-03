# Spec: Email and password login for trainees

KAN-82 (sub-tasks KAN-83 [BE], KAN-84 [FE admin], KAN-85 [FE trainee], KAN-86 [QA]). Intent: `intent/2026-11-03-email-password-login.md`.

## Today

- `loginUserAction` looks a trainee up by `users.name_key` and starts a session. No secret.
- `RememberUser` + `use-remembered-name` keep the last name in localStorage to pre-fill the form.
- Admin login already uses username + scrypt password (`services/password.ts`), a dummy hash for unknown usernames and a fixed 600 ms delay on failure. No attempt limit anywhere.
- Sessions are stateless HS256 JWTs carrying `iat`; `getCurrentUser` re-reads the user row on every request.

## Decisions (approved by Hoan 2026-11-03)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                         | Why                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Additive columns on `users`: `email`, `email_key` (lower-cased, trimmed, **unique**), `password_hash`, `password_changed_at` (unix seconds). All nullable so existing rows stay valid.                                                                                                                                                                                                                                           | Turso push must stay additive; legacy trainees have no email yet.                                                                          |
| D2  | `name` stays required and unique as the display name the admin sees. Email is the login identifier.                                                                                                                                                                                                                                                                                                                              | No schema break; the admin list keeps working.                                                                                             |
| D3  | Generated password: 12 characters from `crypto.randomInt` over `A-Z a-z 2-9` minus look-alikes (`I l O 0 1`), with at least one upper, one lower and one digit. Hashed with the existing scrypt `hashPassword`; the plain text is returned once from the action and never stored or logged.                                                                                                                                      | Easy to read aloud or type from a screenshot; ~70 bits of entropy.                                                                         |
| D4  | Admin create member: email + name. Success shows a one-time panel with the password, a copy button and "Mật khẩu chỉ hiện một lần".                                                                                                                                                                                                                                                                                              | Hoan's rule: the system returns the password to the admin.                                                                                 |
| D5  | Admin reset: on the member page, "Đặt lại mật khẩu" → confirm → new random password shown once. Sets `password_changed_at = now`. Per trainee only (see Q1).                                                                                                                                                                                                                                                                     | Hoan: only the admin can reset; trainees contact the admin.                                                                                |
| D6  | A user session whose `iat` is older than `password_changed_at` is rejected in `getCurrentUser`, so a reset or a password change logs the trainee out on every other device. After the trainee changes their own password the current device gets a fresh session.                                                                                                                                                                | A reset must actually lock out whoever had the old password. Uses the existing `iat`, no session table.                                    |
| D7  | Trainee change password at `/account/password` (link from the account menu): current password, new password (8-128 chars, must differ from current), confirm.                                                                                                                                                                                                                                                                    | Hoan: trainees can change their own password.                                                                                              |
| D8  | Login: email + password, one generic error "Sai email hoặc mật khẩu" for unknown email, wrong password or a trainee with no password yet. Keeps the dummy-hash + delay timing defence. Hint under the form: "Quên mật khẩu? Liên hệ PT của bạn để đặt lại."                                                                                                                                                                      | No account probing; tells the trainee the only recovery path.                                                                              |
| D9  | Attempt limit (closes the gap from the rate-limit check): table `login_attempts(key PK, failed_count, window_started_at, locked_until)`. Key `user:<email_key>` or `admin:<username_key>`. 5 failures inside 15 minutes lock the key for 15 minutes; a success clears it. Locked: "Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút." Stored in the DB because Vercel functions share no memory. Applies to the admin login too. | Cheap, stops online guessing of the 12-char and user-chosen passwords. Per-IP limiting is left out (shared gym Wi-Fi would lock everyone). |
| D10 | Migration of existing trainees: PR 2 (admin UI) ships while the name login still works. The member page shows "Chưa có tài khoản đăng nhập" with a form to set email + generate a password. Hoan gives every existing trainee a login, then PR 3 switches the login page to email + password.                                                                                                                                    | Nobody is locked out at release; data stays attached to the same `users.id`.                                                               |
| D11 | Emails are validated with Zod `.email()`, max 254 chars, compared by `email_key`. An admin can change a trainee's email on the same card (keeps the password).                                                                                                                                                                                                                                                                   | Typos happen when typing emails on a phone.                                                                                                |

## Obsolete behaviour to remove (PR 3)

- `loginUserAction` (name-only), the name field of `UserLoginForm`, `AUTH_MESSAGES.NAME_REQUIRED` / `NAME_NOT_FOUND`.
- `RememberUser`, `use-remembered-name`, `features/auth/utils/remembered-name.ts`, `REMEMBERED_NAME_KEY`. Browsers' password managers now remember the email.
- README "Đăng nhập bằng tên" / "Nhớ đăng nhập" sections rewritten.
- `findUserByName` stays (used to keep display names unique).

## Open questions

1. **Bulk reset.** Hoan wrote "chỉ có admin được tự động revert mật khẩu cho toàn bộ user". Read as: the admin can reset the password of any trainee (one at a time). Is a "reset all trainees at once" button also wanted? It would log everyone out and show a list of N new passwords to hand out. **Answer (Hoan, 2026-11-03): per-trainee only.**
2. **Cut-over.** OK that the name login keeps working until Hoan has set a login for every existing trainee (D10)? (Default accepted with the plan approval, 2026-11-03.)
3. **Lock policy.** 5 failures / 15 minutes lock / 15 minutes window OK? (Default accepted with the plan approval, 2026-11-03.)

## Test matrix

| Case                                           | Level    | Expected                                                                |
| ---------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `generatePassword()` x 1000                    | unit     | length 12, only allowed chars, has upper + lower + digit, no duplicates |
| email normalisation `" An@Mail.COM "`          | unit     | key `an@mail.com`                                                       |
| limiter: 4 failures                            | unit     | not locked                                                              |
| limiter: 5th failure within 15 min             | unit     | locked until +15 min                                                    |
| limiter: failures spread over > 15 min         | unit     | window restarts, not locked                                             |
| limiter: success after failures                | unit     | record cleared                                                          |
| session `iat` < `password_changed_at`          | unit     | stale, rejected                                                         |
| session `iat` >= `password_changed_at` or null | unit     | accepted                                                                |
| admin creates member with email                | e2e      | password panel shown once; reload does not show it again                |
| duplicate email (any case)                     | e2e      | "Email này đã được dùng"                                                |
| trainee logs in with generated password        | e2e      | lands on `/workouts`                                                    |
| wrong password / unknown email                 | e2e      | same generic message                                                    |
| 5 wrong passwords                              | e2e      | lock message; correct password also refused while locked                |
| trainee changes password                       | e2e      | old password fails, new works, still signed in                          |
| admin resets password                          | e2e      | trainee's open session is sent to login; new password works             |
| legacy trainee without email                   | e2e      | cannot log in by email; admin sets login; then can                      |
| non-admin calls reset action                   | unit/e2e | `requireAdmin` redirects                                                |
