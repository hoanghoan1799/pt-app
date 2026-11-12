---
name: project-map-refresh
description: Write or refresh pt-app's CLAUDE.md as the project map (commands, layout, skills, conventions, never-do list, why log) and promote repeated explanations into it. Use on "refresh CLAUDE.md", "update the project map", or when a diff changes a convention.
---

# CLAUDE.md as the project map

Principle: put the context in the repo, not in the prompt. Every time something is explained to Claude twice, it belongs in the repo: a **fact** goes in CLAUDE.md, a **procedure** becomes a skill in `.claude/skills/`, a **rule that must always hold** becomes a hook in `.claude/hooks/`.

## Procedure

1. Read `CLAUDE.md`, the `AGENTS.md` it imports (written by `next dev`; leave its block as is), `docs/claude-code-setup.md`, `docs/hoan-dev-skills.md` and the repo layout.
2. Collect what is missing or stale, from the code (`package.json` scripts, `apps/web/app/`, `apps/web/features/`, `apps/api/`, `packages/contracts/`, `.claude/`, `.github/workflows/`) and from the conversation the user points to.
3. Make sure these sections exist and are true today:
   - **Commands**: install, dev, test, lint, typecheck, format, db scripts (all `pnpm`).
   - **Layout**: the workspaces (`apps/web`, `apps/api`, `packages/contracts`) and, in `apps/web`: `app/` routes, `features/<name>/...`, `components/`, `services/`, `db/schema.ts`, `utils/`, where tests live.
   - **Conventions**: imports, naming, auth guards, Zod, error handling, language (Vietnamese UI copy, English everything else), KAN key per branch and commit.
   - **Capstone workflow**: specs, Jira questions, one Story per worktree and PR, additive schema.
   - **Skills**: every skill in `.claude/skills/`, one line each.
   - **Never do**: trailers, `main`, force-push, `.env*`, skipping tests, production DB.
   - **Why log** (add when the first entry appears): removals and reversals with the date and what to use instead, so stale designs are not resurrected.
4. List candidate **skills**: procedures that appear more than once and have several steps. Suggest them; do not bury procedures in CLAUDE.md.
5. Keep personal preferences out (those go in memory) and secrets out entirely.
6. Keep CLAUDE.md short: one line per fact, details go to `docs/`. Mirror new `.claude/` files in the table in `docs/claude-code-setup.md`.
7. Show the diff, then commit it with `honest-commit-push`, in the same commit as the convention change when there is one.

## Rules

- Every line must be true today; a stale line is worse than a missing one.
- A rule that must hold every time should be a hook (with a test in `.claude/hooks/__tests__/`), not only a CLAUDE.md line; suggest the hook.
