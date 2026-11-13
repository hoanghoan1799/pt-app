# Claude Code setup: what is in the repo, what you do on your machine

The repo already carries the team setup (dojo Day 01-10, Jira epic KAN-9). This page lists what it does and the steps each developer runs locally, because they need your own login, secrets or machine.

## What the repo gives you

| Path                                             | What it does                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE.md`                                      | Team rules loaded into every session: commands, layout, conventions, never-do list.                                                        |
| `.claude/settings.json`                          | Permissions (allow / ask / deny) and the two hooks below.                                                                                  |
| `.claude/hooks/block-forbidden.mjs`              | Before each Bash command: blocks push to `main` and `stag`, force-push, `--no-verify`, Claude trailers in commits, shell access to `.env`. |
| `.claude/hooks/format-on-edit.mjs`               | After each Edit/Write: `eslint --fix` on JS/TS files, then Prettier, using the repo's own config.                                          |
| `.claude/agents/bug-investigator.md`             | Read-only subagent that reproduces a bug and reports the root cause with `file:line`.                                                      |
| `.claude/skills/review-checklist/`               | Team review checklist, used by `/code-review` style reviews and before merging.                                                            |
| `.claude/skills/grill-me/`, `actionable-ticket/` | Intake interview before planning; KAN tickets and PR descriptions a stranger can act on.                                                   |
| `.claude/skills/honest-commit-push/`             | Commit from the diff with the KAN key, run checks, push; never force-push.                                                                 |
| `.claude/skills/browser-proof/`                  | Prove a UI change with the Playwright MCP on a local DB and report it in an artifact.                                                      |
| `.claude/skills/ai-work-queue/`                  | Claim a KAN ticket, plan, fix, verify, move it across the board or release it.                                                             |
| `.claude/skills/advisor-delegate/`               | Main session plans and reviews; Sonnet subagents build, Haiku runs checks.                                                                 |
| `.claude/skills/project-map-refresh/`            | Keep CLAUDE.md true when a convention changes.                                                                                             |
| `docs/hoan-dev-skills.md`                        | hoan-dev-skills: the working standards, guardrails and checklists the skills follow.                                                       |
| `.claude/commands/standup.md`                    | `/standup [since]`: drafts a standup from your commits and KAN tickets (see below).                                                        |
| `scripts/cloud-session-setup.sh`                 | `SessionStart` hook for cloud sessions: install, build contracts, local `.env.local`.                                                      |
| `.mcp.json`                                      | Playwright MCP to open and check the app on http://localhost:3000; output goes to the ignored `.playwright-mcp/`.                          |
| `docs/review-false-positives.md`                 | Review findings that are by design; add rows during Day 10 and the retro.                                                                  |
| `.github/workflows/claude.yml`                   | GitHub Action: runs Claude when an issue or PR comment mentions `@claude`.                                                                 |
| `.github/workflows/claude-code-review.yml`       | GitHub Action: reviews every opened or updated PR with the `code-review` plugin and posts inline comments.                                 |

Use Node.js 24 (the app's `engines`, also what Vercel builds with) and pnpm (`corepack enable` once picks the version in `packageManager`). After pulling, run `pnpm install --frozen-lockfile` (installs exactly the lock file; `pnpm install` may rewrite it), then restart Claude Code so it loads the new settings.

## `/standup`

`/standup` (or `/standup last friday`) reads `git log` for commits by your git email since the given day (default: yesterday), groups them by KAN key, and, when the Atlassian connector is on, adds the status of those tickets and your In Progress tickets. It prints three short sections, **Done**, **Today** and **Blockers**, to read aloud. It only reads; it never posts anywhere. Edit `.claude/commands/standup.md` to change the format.

## Cloud sessions (your machine can be off)

Claude Code on the web (claude.ai/code, project threads, routines) clones the repo into a fresh cloud container, so work on pt-app does not need your Windows or Mac machine, Remote Control or the local clone. On the first start of a cloud session, the `SessionStart` hook runs `scripts/cloud-session-setup.sh`, which:

1. switches the session to Node 24;
1. runs `pnpm install --frozen-lockfile` and builds `packages/contracts`;
1. creates `apps/web/.env.local` from `.env.example` when it is missing (it only points the web at the local API, `API_URL` and `NEXT_PUBLIC_API_URL`).

There is no local SQLite any more: the data lives in PostgreSQL behind the API. A cloud container usually has no Docker, so the script does not start a database; unit tests, lint and typecheck do not need one. Where Docker exists, start PostgreSQL and the API with `docker compose up -d --build db api` (or `pnpm dev:all`, which also starts the web), then run the one-time steps against the local database: `pnpm db:migrate`, `pnpm admin:create` (needs `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` in `apps/api/.env`), `pnpm db:seed-foods`, and optionally `pnpm db:seed-demo` (a local-only demo trainee).

The script does nothing outside cloud sessions (`CLAUDE_CODE_REMOTE` is not `true`), so it never touches production. After it runs, `pnpm test`, `pnpm lint` and `pnpm typecheck` work in the container.

What still lives elsewhere:

- The live app runs on Vercel (auto-deploys `main`; the API and its PostgreSQL run separately); it never depended on your machine. Task PRs go to `stag`; `main` changes only at release (`docs/release.md`).
- CI, `@claude` and PR review run in GitHub Actions; Jira sync too.
- Cloud containers ship a newer Chromium than the repo's Playwright pin, so for `pnpm test:e2e` in a cloud session use a temporary config with `launchOptions.executablePath: "/opt/pw-browsers/chromium"` (never `playwright install`, never commit that config). CI runs e2e with the pinned browser.
- The cloud image defaults to Node 22 but ships Node 24 in `/opt/node24`; the script puts it first on `PATH` for the whole session (through `CLAUDE_ENV_FILE`), so `node -v` is 24 like Vercel and CI.

## Steps to do on your machine

### 0. Install the command-line tools (once)

Steps 3 and 4 run `claude` and `gh` in a terminal, so both must be on your `PATH`.

1. Claude Code CLI. The `claude.exe` bundled with Claude Desktop lives in a versioned folder that changes on every app update, so install the standalone CLI instead:
   - Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`
   - macOS: `curl -fsSL https://claude.ai/install.sh | bash`
2. GitHub CLI, used by `/install-github-app` to add the repo secret and open the workflow PR:
   - Windows: `winget install --id GitHub.cli`
   - macOS: `brew install gh`
3. Open a new terminal, run `gh auth login` (GitHub.com, HTTPS, log in with a web browser) with the account that owns the repo.
4. Check with `claude --version` and `gh auth status`.

### 1. Approve the project settings (once)

1. Open the repo in Claude Code (Desktop Code tab or `claude` in a terminal).
2. Accept the prompt to trust the project and enable the `playwright` MCP server.
3. Check with `/hooks` (both hooks listed), `/mcp` (playwright connected) and `/agents` (bug-investigator listed).

### 2. Notify-on-finish (personal, per machine)

Create `.claude/settings.local.json` (gitignored) with a `Stop` hook for your OS.

macOS:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude is done\" with title \"pt-app\"'"
          }
        ]
      }
    ]
  }
}
```

Windows (PowerShell):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -NoProfile -Command \"[console]::beep(800,300)\""
          }
        ]
      }
    ]
  }
}
```

Restart the session and finish any prompt to test it.

### 3. GitHub connector (Day 08)

GitHub's MCP endpoint does not support the automatic OAuth sign-in (`/mcp` shows "does not support dynamic client registration"), so use a personal access token.

1. On GitHub: Settings > Developer settings > Fine-grained tokens > Generate. Repository access: only `pt-app`; permissions: Contents read, Pull requests read and write, Issues read and write. Copy the token; never paste it into a chat or a repo file.
2. Store it as a user environment variable `GITHUB_PAT` (Windows: System Properties > Environment Variables; macOS: `export GITHUB_PAT=...` in `~/.zshrc`), then open a new terminal.
3. Add the server at user scope, so the repo's `.mcp.json` stays unchanged. If an earlier attempt added it, run `claude mcp remove github -s user` first.
   `claude mcp add --scope user --transport http github https://api.githubcopilot.com/mcp/ --header "Authorization: Bearer $GITHUB_PAT"` (PowerShell: `$env:GITHUB_PAT`)
4. `claude mcp list` should show `github: ✓ Connected`.
5. Test it: ask Claude to list open PRs in `hoanhoang-agilityio/pt-app` and comment on one.

### 4. `@claude` in GitHub Actions (Day 09)

Already done for this repo (PR #4): both workflows above are on `main` and use the `CLAUDE_CODE_OAUTH_TOKEN` repo secret. Repeat these steps only for a new repo or to rotate the secret.

1. Make sure step 0 is done (`gh auth status` shows you logged in); otherwise `/install-github-app` warns that GitHub CLI is missing.
2. In Claude Code inside this repo, run `/install-github-app`.
3. Pick the workflows: **@Claude Code** (on mention) and **Claude Code Review** (auto review on every PR).
4. Install the Claude GitHub App on the repo and let it add the secret: sign in with your Claude account (OAuth token) on a Pro/Max plan, or use an API key. Never paste the key or token into a file or chat.
5. Merge the workflow PR it opens.
6. Test it: comment `@claude review this PR` on a PR, or open an issue that mentions `@claude`, and evaluate the result in the Actions tab.

Auto review runs on every push to every PR and uses your Claude quota. To limit it, uncomment the `paths:` filter in `claude-code-review.yml` or delete that file.

### 5. Hands-on exercises (no repo change needed)

| Day | Exercise                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| D04 | Cycle permission modes with Shift+Tab (Windows: Alt+M); run one KAN ticket through plan mode to PR.              |
| D05 | `/memory`, `/compact` on a long session, Esc Esc to `/rewind` a bad edit; compare a fresh vs a warmed session.   |
| D06 | `/loop 15m` on your PR, `/rc` and steer from the phone, two tickets in parallel with `claude --worktree <name>`. |
| D07 | `/plugin`, install one plugin (e.g. a TypeScript LSP), write down an honest verdict.                             |
| D09 | `/goal` on a bounded task; a Local routine in Desktop (Code tab > Routines > New routine > Local).               |
| D10 | `/code-review` on a real branch, `/code-review ultra` on a seeded-bug branch, `/security-review` before commit.  |

### 6. Playwright e2e (KAN-36)

`pnpm test:e2e` runs `e2e/trainee-sets.spec.ts` (set-logging matrix rows A1, B1-B3, B5, B6, B9, B12) in a 390 px Chromium against `next dev` on port 3100.

- Browser: `pnpm exec playwright install chromium` once (cloud sessions already have it under `PLAYWRIGHT_BROWSERS_PATH`; `@playwright/test` is pinned to the matching version, so bump both together).
- Database: the suite runs the built API on its own throwaway PostgreSQL 17 (a Docker container on `E2E_PG_PORT`, or the database in `E2E_DATABASE_URL`; its name must contain "e2e"). `e2e/api-server.mjs` empties it, runs the migrations and creates the e2e admin; `e2e/global-setup.ts` then creates the trainees, workouts and nutrition data through the API's own endpoints. Your `.env.local` is never used for the suite.
- Seed dates are relative to the run date (today, one week ago, tomorrow), so no clock mocking is needed.
- Record a video of every test: `E2E_VIDEO=1 pnpm test:e2e`; the `.webm` files land in `e2e/.tmp/results`.
- CI: the separate `e2e` job in `ci-web.yml` runs only when web app, e2e or contracts files change (always on the release PR into `main`) and is not a required check yet. If it goes over 3 minutes, remove it and keep this local command.
