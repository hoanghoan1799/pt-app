# Branches and release

KAN-109. Two long-lived branches:

| Branch | Role                                           | Who writes to it                      |
| ------ | ---------------------------------------------- | ------------------------------------- |
| `stag` | Integration. Every task PR targets it.         | Merged task PRs only (no direct push) |
| `main` | Production. Vercel deploys it to the live app. | The release PR from `stag` only       |

## Daily work

1. Start the ticket branch from `stag`: `git fetch origin stag && git checkout -b feat/KAN-NN-slug origin/stag`.
2. Open the PR with base `stag`. CI, Claude review and Jira sync run as before.
3. Merging into `stag` moves the ticket to Done (`.github/workflows/jira-sync.yml`).
4. Keep the branch current with `git merge origin/stag` or a rebase onto `origin/stag` (your own branch only; never force-push a shared one).

## Release (`stag` -> `main`)

1. Check `stag` is green on CI and works on its Vercel preview.
2. Open a PR `stag` -> `main` titled `release: vX.Y.Z` (no KAN key in the title, so Jira sync moves nothing). The body lists the merged task PRs and KAN keys since the last tag: `git log --oneline origin/main..origin/stag`.
3. Merge with a **merge commit** (not squash), so `stag` and `main` keep the same history and the next release does not show old commits again.
4. Tag the merge commit on `main` and publish a GitHub release: `vX.Y.Z` (semver; first tag after this change follows the last one, e.g. `v1.0.0` -> `v1.1.0`).
5. Vercel deploys `main` to production. Check https://pt-app-sepia.vercel.app/.

## Hotfix

A production bug that cannot wait: branch from `main`, PR into `main`, then merge `main` back into `stag` (PR `main` -> `stag`) so the fix is not lost at the next release.

## Schema changes

The Vercel build runs `drizzle-kit push` against the database of the environment it builds. Keep schema changes additive, and make sure Preview builds (including `stag`) do not point at the production Turso database (see "Vercel" below).

## Vercel (set by Hoan)

- Production Branch stays `main` (Project Settings -> Git).
- `stag` gets a stable preview URL: Project Settings -> Domains -> add a domain (e.g. `pt-app-stag.vercel.app`) and assign it to the Git branch `stag`.
- Environment variables for Preview (or a branch-specific set for `stag`) should use a separate Turso database, not production.

## Branch protection (set by Hoan in GitHub)

For both `stag` and `main` (Settings -> Branches, or Rules -> Rulesets):

- Require a pull request before merging; block force pushes and deletion.
- Require status checks: `checks` (CI). `e2e` optional until it is a required check.
- `main` only: restrict who can push/merge to Hoan, and require the PR to come from `stag` (or hotfix branches) by review.
