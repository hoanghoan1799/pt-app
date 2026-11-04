---
name: review-checklist
description: Review a pt-app branch or PR against the team checklist (scope, tests, auth guards, validation, error handling, conventions). Use before opening or merging a PR, or when asked to review a diff.
---

# pt-app review checklist

Review the diff against the base branch (`git diff origin/stag...HEAD` for task branches, `origin/main...origin/stag` for a release PR, or the PR diff). Go through the sections in order and stop at the first section that fails badly: a PR without a ticket or with red tests is not worth a style review yet.

## 1. Scope

- The branch and commit subjects carry one KAN key, and the diff does only what that ticket asks.
- No unrelated refactors, renames or formatting churn mixed in.
- The PR description says what changed, why, and how it was tested.

## 2. Tests and checks

- `pnpm test && pnpm lint && pnpm typecheck` pass. Run them; do not trust the description.
- A bug fix comes with a test that fails without the fix. New pure logic in `utils/` or `features/*/utils/` has tests in the sibling `__tests__/`.
- No test was skipped, deleted or loosened to get green.

## 3. Access control

- Every new or changed admin server action calls `await requireAdmin()` before touching the database; user actions call `requireUser()`.
- A user action only reads or writes rows for the session user's own id, never an id taken from the form.
- New routes sit under the right protected route group, and `proxy.ts` still matches them.

## 4. Input and data

- Form and search-param input is parsed with Zod (`*-schemas.ts`) before use.
- Drizzle queries use the query builder or `sql` template parameters, never string-built SQL.
- Schema changes in `db/schema.ts` are additive or come with a migration plan for Turso; `scripts/setup-database.ts` still works.
- Week/day math uses `utils/week.ts` and `utils/time.ts` (plain `YYYY-MM-DD` strings, Monday to Sunday, UTC arithmetic), not ad-hoc `Date` math.

## 5. Errors and secrets

- Server actions are wrapped in `withFormErrorHandling` / `withResultErrorHandling`, so production shows only the generic message and a reference id.
- No secret, token, `.env` value or password reaches logs, responses or the client bundle.
- `redirect()` / `notFound()` are not swallowed by a `try/catch`.

## 6. Conventions

- Matches CLAUDE.md: `@/` imports, sorted import groups, braces on every block, `PascalCase/index.tsx` components, `use-*.ts` hooks.
- UI copy is Vietnamese and lives in the feature's `constants/messages.ts`; code and comments are English.
- Commits have no `Co-Authored-By` or `Claude-Session` lines.

## Output

Report findings as a list, most severe first. For each: `file:line`, what is wrong, a concrete failure scenario, and the fix. Mark each as **blocker**, **should fix** or **nit**. If a finding matches an entry in `docs/review-false-positives.md`, drop it. End with one line: ready to merge, or not and why.
