@AGENTS.md

# PT App

pnpm monorepo (`apps/web`, `apps/api`, `packages/contracts`). Weekly PT workout app: admins (PTs) assign daily workouts, users log in by name. Next.js 16 App Router + React 19, Drizzle ORM on libSQL (SQLite locally, Turso on Vercel), Tailwind 4, Zod, Vitest. Mobile-first. The README (Vietnamese) has the full feature list.

## Commands

- Install (Node 24, same as Vercel via `engines`): `pnpm install`, then `cp apps/web/.env.example apps/web/.env.local`, `pnpm db:push`, `pnpm admin:create`
- Dev: `pnpm dev` (builds `@pt/contracts`, then the web app at http://localhost:3000, admin at `/admin/login`); API: `pnpm dev:api` (http://localhost:4000/v1/health) or `docker compose up -d --build db api` (PostgreSQL 17 + API)
- Check everything: `pnpm verify` (builds `@pt/contracts`, then runs `verify` in every workspace and the `.claude` hook tests); run it before every PR. One workspace: `pnpm --filter @pt/web verify` (also `@pt/api`, `@pt/contracts`)
- Root `test`, `lint`, `typecheck` and the `db:*` / `admin:create` scripts delegate to the workspaces; `@pt/contracts` must be built (`pnpm build:contracts`) before running a workspace script directly
- Format: `pnpm format` (Prettier; a hook runs `eslint --fix` + Prettier on each file Claude edits)
- Cloud sessions set themselves up (`scripts/cloud-session-setup.sh` via `SessionStart`: install, build contracts, local `apps/web/.env.local`, local SQLite); local-only steps (GitHub app, notifications, exercises): `docs/claude-code-setup.md`

## Layout

- `apps/web/` (`@pt/web`, Next.js; the `@/` alias points here):
  - `app/`: routes only, thin; compose features. `(user)/(protected)` and `admin/(protected)` layouts guard access.
  - `features/<name>/{components,hooks,services,utils,constants,types}`: auth, members, workouts, dashboard, nutrition.
  - `components/` shared UI, `services/` session/guards/env/logger, `db/schema.ts` Drizzle schema, `utils/` pure helpers.
- `apps/api/` (`@pt/api`): NestJS 12 skeleton (ESM, `/v1` prefix, `GET /v1/health`), Zod env in `src/config/env.schema.ts`, Dockerfile; built from the repo root by `docker-compose.yml`. One-time Turso to PostgreSQL copy in `scripts/` (`pnpm --filter @pt/api data:migrate`, runbook `docs/backend/cutover-runbook.md`). Plan: `docs/backend/`.
- `packages/contracts/` (`@pt/contracts`): framework-free Zod schemas (`*-schemas.ts`), limits and the pure helpers they need; built with `tsc` to `dist/` and imported by web and API as `@pt/contracts`. No Next, Nest, React or Node-only imports here.
- Tests: `__tests__/*.test.ts` next to the code they cover (pure utils and services); `.claude/hooks` tests run from the root (`pnpm test:tools`).

## Conventions

- Import via `@/`; ESLint enforces sorted import groups and braces on every `if`/`for` body.
- UI strings go in messages/{vi,en,zh}/<namespace>.json via next-intl; vi is default; the messages test fails on missing keys.
- Components live in `PascalCase/index.tsx`; hooks are `use-kebab-case.ts`.
- Every admin server action calls `requireAdmin()` first; user actions call `requireUser()`. Validate input with Zod.
- Errors go through `services/action-errors.ts`: production shows only a generic message plus a reference id.
- UI copy is Vietnamese; code, comments, commits, PRs and Jira tickets are English.
- Branches: `stag` is the integration branch. Every task branch starts from `stag` and its PR targets `stag`; `main` is production (Vercel) and only takes the release PR `stag` -> `main`, then a tag (`docs/release.md`).
- One KAN ticket per branch, key in the branch name and commit subject, e.g. `fix(KAN-14): ...`.
- CI is one workflow per workspace, started by its own paths (`packages/contracts/**` also starts web and api): `ci-web.yml` runs only what a task PR touches (related unit tests, lint on changed files, typecheck on code changes, e2e on app/e2e changes) and the full suite plus `pnpm build` once on the release PR into `main`; `ci-api.yml` and `ci-contracts.yml` run lint, typecheck and tests. Each ends in a gate job (`checks-web`, `checks-api`, `checks-contracts`). Keep them green; `pnpm verify` locally still runs everything.
- `.github/workflows/jira-sync.yml` moves the KAN keys in a PR title or branch to In Review when the PR opens and to Done when it merges into `stag` (the release PR from `stag` moves nothing) (secrets `JIRA_EMAIL`, `JIRA_API_TOKEN`); moving a ticket to In Progress stays manual.

## Verifying your work

- Run `pnpm verify` before reporting any task done and paste the tail of its output. All green; never skip or delete a failing test.
- If a test fails, fix the code, not the test. Bug fixes: failing test first, then `.claude/fix-mode` guards the test files while you fix.
- For a fresh-context final check, use the `verifier` agent.

## Capstone workflow

- A change starts as `intent/<date>-<slug>.md` (`intent/TEMPLATE.md`), then the spec in `docs/specs/`, then the approved plan committed as `docs/specs/<feature>.plan.md` (`docs/specs/PLAN_TEMPLATE.md`) before any code. Jira stays the tracking record; each file carries the KAN key. Review policy: `REVIEW.md`.
- Specs live in `docs/specs/<feature>.md` (decisions, open questions, test matrix); the Jira ticket links to it.
- Ask every question as a comment on the Jira ticket, never in chat; update the ticket and spec when it is answered.
- One Story per worktree session and per PR, plan mode first. Run `/grill-me` before planning a feature, file tickets with `actionable-ticket`.
- Schema changes must be additive (new tables, nullable columns): the Vercel build runs `drizzle-kit push` against production.

## Skills: hoan-dev-skills (`.claude/skills/`)

Working standards and checklists for the set: `docs/hoan-dev-skills.md`.

- `grill-me`: interview in decision rounds before planning a feature bigger than a day.
- `actionable-ticket`: KAN tickets and PR descriptions a stranger can act on.
- `review-checklist`: review a branch or PR before opening or merging it.
- `honest-commit-push`: commit from the diff with the KAN key, checks, push, no force-push.
- `browser-proof`: prove a UI change with the Playwright MCP on a local DB, report in an artifact.
- `ai-work-queue`: claim a KAN ticket, plan, fix, verify, move it across the board or release it.
- `advisor-delegate`: main session plans and reviews; Sonnet builds, Haiku runs checks.
- `project-map-refresh`: keep this file true when a convention changes.

## Skills: ai-pair-workflow (`.claude/skills/pair-*`)

Per-task workflows where the human decides and Claude executes; they call the hoan-dev-skills above where the two meet. Details: `docs/hoan-dev-skills.md`.

- `pair-start`: name the project and task type, pick the workflow below.
- `pair-feature`, `pair-bugfix`, `pair-refactor`, `pair-review`: staged workflows with a verify step after each stage.
- `pair-knowledge-log`: troubleshooting entries, ADRs and saved solutions under `docs/`.
- Agents in `.claude/agents/`: `code-scout` and `first-pass-reviewer` (read-only), `safety-net-tester` (test files only), plus `bug-investigator`; `verifier` runs `pnpm verify` in fresh context (report only).
- Verify hooks in `.claude/hooks/pair/` (tests: `node --test .claude/hooks/pair/__tests__/hooks.test.mjs`). `.claude/hooks/test-guard.mjs` blocks test-file edits while `.claude/fix-mode` exists.

## Things Claude gets wrong

Two strikes: when Claude makes the same mistake twice, add it here.

- Data paths trusting their input: KAN-39, KAN-40, KAN-52 each hardened one (deleted exercise, no-op re-save, timed reps, link change). Handle missing rows and bad values at the boundary.
- Weak or duplicated test assertions: KAN-31 (duplicate test), KAN-58 (tighten weak e2e assertions). Assert the specific outcome, not just that something rendered.

## Never do

- Never add `Co-Authored-By` or `Claude-Session` lines to commits.
- Never push to `stag` or `main`, never force-push; open a PR into `stag`.
- Never read, print or commit `.env*` files (only `.env.example`) or any secret.
- Never skip, delete or `.skip` a failing test to get green; fix the cause.
- Never run `db:push`, `db:setup` or scripts against a Turso/production URL.
