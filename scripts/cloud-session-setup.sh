#!/usr/bin/env bash
# SessionStart hook: prepares pt-app in a Claude Code cloud session (claude.ai/code,
# project threads, routines) so the work does not need Hoan's machine to be on.
#
#   1. installs dependencies from the lock file
#   2. builds packages/contracts (the apps import it from dist/)
#   3. creates apps/web/.env.local from apps/web/.env.example when it is missing, with a random
#      SESSION_SECRET and the local SQLite file (never a Turso URL)
#   4. creates the tables, the first admin and the starter foods in local.db (in apps/web)
#
# Runs only in cloud sessions (CLAUDE_CODE_REMOTE=true); local sessions keep
# their own setup. Safe to run many times: each step skips work already done.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

# The cloud image defaults to Node 22 but ships Node 24 in /opt/node24 (the
# version in package.json "engines" and on Vercel). Put it first on PATH for
# this script and, through CLAUDE_ENV_FILE, for every Bash command of the session.
node24_bin="/opt/node24/bin"
if [ -x "$node24_bin/node" ] && [ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]; then
  export PATH="$node24_bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$node24_bin:\$PATH\"" >>"$CLAUDE_ENV_FILE"
  fi
  echo "▸ pt-app cloud setup: using Node $(node -v)"
fi

echo "▸ pt-app cloud setup: installing dependencies"
pnpm install --frozen-lockfile --reporter=silent

echo "▸ pt-app cloud setup: building packages/contracts"
pnpm --silent build:contracts

env_file="apps/web/.env.local"
if [ ! -f "$env_file" ]; then
  echo "▸ pt-app cloud setup: creating $env_file from the template (local SQLite)"
  secret="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  sed -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${secret}|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=file:local.db|" \
    apps/web/.env.example >"$env_file"
fi

# Never point the setup at a remote database: apps/web/drizzle.config.ts and
# apps/web/services/env.ts prefer TURSO_DATABASE_URL, then DATABASE_URL, from the
# environment over .env.local.
for name in TURSO_DATABASE_URL DATABASE_URL; do
  value="${!name:-}"
  if [ -n "$value" ] && [[ "$value" != file:* ]]; then
    echo "⚠ pt-app cloud setup: $name points at a remote database; skipping the database step"
    exit 0
  fi
done

echo "▸ pt-app cloud setup: preparing local.db"
pnpm --silent --filter @pt/web db:setup

echo "✔ pt-app cloud setup done: pnpm verify, pnpm dev (http://localhost:3000)"
