# hoan-dev-skills: Claude Code skills and working standards for pt-app

How we work with Claude Code on this repo. `hoan-dev-skills` is the name of the skill set in `.claude/skills/` plus this page: CLAUDE.md holds the project facts, this page holds the working habits, and each skill holds one procedure.

The one idea: **put the context in the repo, not in the prompt.** A short prompt ("commit push", "take the next ticket") works because CLAUDE.md, the skills and the hooks carry the rest.

## Standards

### Context

- **Talk like a teammate.** Say what you want and let Claude work out how; ask its opinion; correct plainly.
- **Explained twice, write it down.** A project fact goes in CLAUDE.md, a procedure becomes a skill, a personal preference goes in memory, a rule that must always hold becomes a hook in `.claude/hooks/` (with a test in `.claude/hooks/__tests__/`). Skill: `project-map-refresh`.
- **CLAUDE.md is the project map.** Commands, layout, every skill, conventions, never-do list, and why things were removed. Update it in the same commit that changes a convention.
- **Drafts, not sends.** Claude prepares Slack messages, emails and Jira comments addressed to other people; a human sends anything outward-facing.

### Workflow

- **Grill before you plan** for anything bigger than a day: `grill-me`, decisions recorded in `docs/specs/<feature>.md`.
- **One plan, synced both ways.** The spec in `docs/specs/` owns scope, sequence and decisions; Jira KAN owns status. When one changes, update the other.
- **Design every state before building UI.** The spec lists loading, empty, error and success states; check them in the browser before merging.
- **Plan first, then let it run.** Plan mode (plan approved, for capstone tickets as a Jira comment) before code changes; auto mode for reads, edits and checks.
- **Advisor decides, cheaper models run** when subagents are used: `advisor-delegate`.
- **One workstream, one checkout.** One Story per worktree session and per PR; retire the worktree once the PR is merged.
- **Send the searching to subagents.** Explore for read-only sweeps, `bug-investigator` for a failing test; ask for a conclusion, not a transcript.
- **Board as the work queue**: claim, plan, fix, verify, close or release: `ai-work-queue`.
- **Tickets and PRs a stranger can act on**: `actionable-ticket`.

### Reach

- **Share across sessions through channels**, not one session's head: CLAUDE.md (facts, via git), memory (preferences), Jira (tasks and claims), artifacts (reports and reviews).
- **Capture long output as an artifact**: review reports, before/after screenshots, demo videos.
- **Prove UI in a real browser** before a UI PR: `browser-proof`.

## Guardrails (never relaxed, even in auto mode)

| Rule                        | In pt-app                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Never force-push            | Blocked by the PreToolUse hook; a diverged branch is reported, not overwritten.         |
| Never push to `stag`/`main` | Blocked by the hook; every task goes through a PR into `stag` with green CI.            |
| Honest commits              | Each message is written from the diff, with the KAN key: `honest-commit-push`.          |
| Verify, then close          | A ticket moves to Done only after its PR is merged with test, lint and typecheck green. |
| Write down why              | Removals and reversals are recorded in CLAUDE.md or the spec, with the date.            |
| Production is off limits    | No db scripts against Turso; schema changes stay additive.                              |

## Checklists

### New feature (bigger than a day)

- [ ] `grill-me` done; every decision in `docs/specs/<feature>.md` or written down as an assumption
- [ ] Tickets filed with `actionable-ticket`, split into [BE]/[FE]/[QA] sub-tasks
- [ ] Plan approved before code; ticket moved to In Progress
- [ ] Tests for new logic in the sibling `__tests__/`; `pnpm test && pnpm lint && pnpm typecheck` green
- [ ] `browser-proof` for UI changes, artifact linked in the PR
- [ ] Reviewed with `review-checklist`
- [ ] PR: what and why, how verified with output, screenshots, Jira key, one concern; ticket moved to In Review
- [ ] CLAUDE.md updated in the same commit if a convention changed

### Before commit and push

- [ ] Diff read; no `.env*`, `*.db`, `.next/`, `.playwright-mcp/` or secrets
- [ ] On the ticket branch (cut from `stag`), not `stag` or `main`; author is Hoan Hoang
- [ ] One commit per concern; message written from the diff with the KAN key
- [ ] No `Co-Authored-By` or `Claude-Session` lines
- [ ] Checks run; no force-push, no `--no-verify`

### Filing a ticket

- [ ] Duplicate search in KAN done
- [ ] Symptom title, where, repro, expected vs actual
- [ ] Testable acceptance criteria
- [ ] Labels: area (and `ai` if Claude may pick it up)

### Closing a ticket

- [ ] PR merged and CI green
- [ ] Ticket moved to Done; parent moved to Done when all sub-tasks are
- [ ] Unfinished work released to To Do with notes, never closed

### When you correct Claude

- [ ] Will it recur? Save it to memory (personal) or CLAUDE.md (project)
- [ ] Must it hold every time? Make it a hook with a test
- [ ] Explained the same procedure twice? Make it a skill

## ai-pair-workflow

A second set that stacks on top of hoan-dev-skills: per-task workflows with an explicit human/Claude split. Where the two sets meet, the pair-\* skill calls the hoan-dev-skills one instead of repeating it.

| Piece                       | Use when                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pair-start`                | Start of any task: name the project and task type, pick the workflow                                              |
| `pair-feature`              | New feature: requirement (`grill-me` if bigger than a day), study code, plan, build in layers, test               |
| `pair-bugfix`               | Bug or error: facts, locate (`bug-investigator`), root cause, smallest fix with a regression test                 |
| `pair-refactor`             | Cleanup: goal, plan and risk, characterization tests first, small verified steps                                  |
| `pair-review`               | Review a diff or PR: Claude does the mechanical pass (plus `review-checklist`), the human gets judgment questions |
| `pair-knowledge-log`        | Troubleshooting entries, ADRs, saved solutions under `docs/`; CLAUDE.md updates go through `project-map-refresh`  |
| `code-scout` agent          | Read-only map of existing code before a change                                                                    |
| `first-pass-reviewer` agent | Read-only mechanical review with `file:line` findings                                                             |
| `safety-net-tester` agent   | Writes and runs tests only                                                                                        |

Verify hooks (`.claude/hooks/pair/`, Node, no dependencies, tests in `__tests__/`):

- `verify-tracker` (PostToolUse on Edit, Write, Bash): after 3 code files edited since the last test/lint/typecheck run (`PAIR_VERIFY_THRESHOLD`), tells Claude to verify before editing more.
- `stop-verify-gate` (Stop): blocks finishing once while edits are unverified; never loops.
- `vague-prompt-hint` (UserPromptSubmit): a short "fix it" prompt reminds Claude to collect the error, location, repro and expected result first.

## Known gaps to watch

- Corrections that are not saved come back; say "remember this".
- A rule that only lives in CLAUDE.md can be skipped; hooks cannot.
- Skills whose output is checked by eye still need automated tests (e.g. Playwright for flows proven by hand).
- Prune merged branches and worktrees.
