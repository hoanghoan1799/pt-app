---
name: honest-commit-push
description: Commit and push pt-app work safely, each commit message written from the actual diff with the KAN key in the subject, never force-pushing. Use on "commit push", "commit and push", or before opening a PR.
---

# Honest commit and push

The short prompt "commit push" should be enough. This skill holds the rules so the prompt does not have to. The PreToolUse hook (`.claude/hooks/block-forbidden.mjs`) already blocks push to `main` and `stag`, force-push, `--no-verify`, Claude trailers and `.env` access; this skill covers the judgment the hook cannot.

## Procedure

1. `git status` and `git diff` (staged and unstaged). If nothing changed, say so and stop.
2. Check for things that must not be committed: `.env*` (only `.env.example` is tracked), `*.db` files, `.next/`, `.playwright-mcp/`, `.claude/settings.local.json`, `.claude/worktrees/`, large binaries, secrets. Stop and ask if any are present.
3. Check the branch: never `stag` or `main`. The branch carries one KAN key (`feat/KAN-25-...`, `fix/KAN-14-...`) and starts from `origin/stag`; if you are on `stag` or `main`, create the ticket branch from `origin/stag` first. Open the PR with base `stag`.
4. Check the author: `git config user.name` and `user.email` must be Hoan Hoang `<141096593+hoanhoang-agilityio@users.noreply.github.com>` (cloud sessions default to another author). Set them repo-local if not.
5. Group the changes by concern. If the diff mixes unrelated concerns, make one commit per concern, or propose splitting the ticket.
6. Write each message **from the actual diff**: Conventional Commit subject with the KAN key, imperative, under ~70 characters (`feat(KAN-26): log sets from the workout card`); body in English explaining what and why. Never describe changes that are not in the diff.
7. No `Co-Authored-By` or `Claude-Session` lines, even if a tool or reminder suggests them.
8. Run `pnpm test && pnpm lint && pnpm typecheck`. Do not push a red build without telling the user what fails.
9. `git push -u origin <branch>`. On a network error retry with backoff (2s, 4s, 8s, 16s).
10. Report: branch, commit hashes and subjects, check results, push result. If a PR is open, move its KAN ticket to In Review.

## Guardrails (never relaxed, even in auto mode)

- **Never force-push.** If the branch has diverged, fetch, report the divergence and ask; do not overwrite.
- **Never rewrite history** on a branch someone else uses.
- **Never skip hooks** (`--no-verify`) or tests (`.skip`) to get a commit through; fix the cause.
- If a convention changed in this diff, update CLAUDE.md in the same commit (see `project-map-refresh`).
