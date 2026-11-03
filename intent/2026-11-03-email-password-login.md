# Intent: Trainees log in with email and password

- **Author:** Hoan
- **Status:** draft
- **KAN key:** KAN-82

## Problem

Trainees log in by typing only their name. Anyone who knows (or guesses) a trainee's name can open their workouts, meals and weight log. There is no password and no limit on login attempts.

## Proposed outcome

- The admin creates a trainee account by entering the trainee's email. The app generates a random 12-character password and shows it to the admin once; the admin passes it to the trainee.
- Trainees log in with email + password and can change their own password.
- No self-service "forgot password": the trainee contacts the admin. Only the admin can reset a trainee's password (a new random 12-character password, shown once).
- Repeated wrong passwords lock the account for a while (trainee and admin logins).

## Affected users and systems

Trainees (login page, a new change-password page), admins (create member form, member page), `users` table, a new `login_attempts` table, session guard, README.

## Constraints

Additive schema only (Vercel build runs `drizzle-kit push` on Turso). Vietnamese UI copy, mobile-first 390 px. Reuse the scrypt hashing in `services/password.ts`. No email service exists, so nothing is mailed.

## Open questions

See `docs/specs/email-password-login.md` (asked on KAN-82).

## Out of scope

Sending email, self-service reset, 2FA, changing the admin's own login.
