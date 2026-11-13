# Cutover runbook: Turso to PostgreSQL

Hoan runs every step of this by hand, in this order. Claude never runs the data script against Turso or any remote database; every rehearsal uses a local SQLite file.

The data script is `apps/api/scripts/migrate-from-turso.ts`. It copies all 44 tables into an empty PostgreSQL that already has the migrations, then proves the copy is complete. Its SQLite column description (`turso-columns.json`) and DDL (`turso-schema.sql`, frozen, from the retired Drizzle schema) stay in the repo until the cutover is over; the script, both files and the Turso/libSQL dev dependency are deleted afterwards (see "After the cutover").

## What the script does

1. Reads a SQLite file (`file:` URL) with `@libsql/client`. A remote source is refused unless `--allow-remote` is passed (the plan does not need it).
2. Refuses to start when the target has pending migrations. Apply them first: `DATABASE_URL=<target> pnpm --filter @pt/api migrate`. The script never changes the schema.
3. Validates every value (enum CHECK values, integer ranges, NUL characters, timestamp units, NOT NULL), then scans every foreign key for orphan rows.
4. Loads in one transaction, parents first, with `OVERRIDING SYSTEM VALUE` (ids are kept). A foreign key that closes a cycle (`chat_conversations.last_message_id`, `chat_messages.photo_id`, `chat_messages.reply_to_message_id`, the DM and social photo links) is loaded as NULL and set by an `UPDATE` after all tables are loaded. No superuser rights are needed.
5. Runs `setval` on every identity sequence (max id; an empty table gives 1 as the next value).
6. Verifies row counts and checksums on both sides before `COMMIT`. A mismatch rolls the whole load back.

`--reset` truncates the 44 tables and `sessions` in the same transaction. Without it, a target that has any row is refused.

## Before the day: rehearse on a local copy (as often as needed)

```sh
turso db shell <db> .dump > turso.sql          # read-only export of production
sqlite3 turso-copy.db < turso.sql              # local file, never the Turso URL
docker compose up -d db                        # PostgreSQL 17
DATABASE_URL=postgres://pt:pt_local_only@localhost:5432/ptapp pnpm --filter @pt/api migrate

pnpm --filter @pt/api data:migrate -- \
  --source file:./turso-copy.db \
  --target postgres://pt:pt_local_only@localhost:5432/ptapp \
  --dry-run --report rehearsal-dryrun.json
```

`--dry-run` reads, validates and prints the orphan report without writing. A libSQL file copied from a Turso replica works the same way as the `.dump` import.

Read the orphan report and decide. SQLite never enforced its foreign keys, so some rows may point at deleted parents. The report lists table, column, count and sample ids. Default is to abort.

- `--orphans=skip`: do not copy those rows (and, repeatedly, rows that pointed at a skipped row). Every skipped row id goes in the JSON report.
- `--orphans=null`: set the FK column to NULL. Only for nullable columns; a NOT NULL column aborts.
- Pass the same `--orphans` value to `data:verify` later, so it knows what was left out.

The database also holds rules SQLite never had (migration `DbIntegrity`), and the scan reports their violations in the same table, so the dry run shows them before anything is written:

- Text keys that point at an account (`user:<id>`, `admin:<id>`, the chat form `admin:<id>`, and kind + id pairs such as `social_posts.author_kind/author_id`, `chat_custom_stickers`, `social_reports` about a user) are real foreign keys through generated columns, so a key whose account does not exist is an orphan. The report names the generated column (for example `social_comments.author_user_id`, parent `users`) and lists the row ids.
- Malformed keys: every covered text key must match its scheme (social and push `user:<id>` / `admin:<id>`; chat `user` / `admin:<id>`; alias targets also `pt`; ids at most 9 digits, no leading zero) and `author_id`, `owner_id`, `target_id` of kind + id pairs must be above 0 (format CHECKs). Rows that break this are reported with reason `malformed_key` and follow the same `skip` / `null` rule as dangling keys.
- A trainee chat message with an admin id (`chat_messages_user_has_no_admin`): reported with reason `user_message_with_admin` and parent `-`.
- The sender-scoped `client_id` unique indexes need no scan: the SQLite schema already had a stricter `UNIQUE (conversation_id, client_id)`.
- `--orphans=skip` drops those rows and, repeatedly, everything that pointed at them (a skipped message takes its reactions, edits and photos).
- `--orphans=null` cannot null a text key or repair a CHECK: for these rows it aborts before any write with "use --orphans=skip". Decision: no partial repair of text keys; skip, or fix the source and re-run.
- Generated columns are never inserted (the loader's column list comes from `turso-columns.json`, which stays unchanged).

Nothing is dropped silently: skipped and nulled values are counted and listed in the console and in the report.

Also prepare, without changing production: the API host and its production PostgreSQL (empty database, a user that can create tables), and the values for the environment list in step 4.

## Cutover day, in order

### 1. Freeze writes on production

1. Announce a short maintenance window.
2. Stop writes to Turso: put the current Vercel deployment in maintenance (for example redeploy it with a maintenance page, or pause the project) so no trainee or PT can save anything. Turso itself is never changed.
3. Export again: `turso db shell <db> .dump > turso-final.sql`, then `sqlite3 turso-final.db < turso-final.sql`. Use this file for the real run; never point the script at the live Turso database. Keep the dump safe for the rollback period.

### 2. Prepare PostgreSQL and load the data

```sh
# a. The schema (the API also applies pending migrations on start, but the data script needs them first)
DATABASE_URL="<production postgres url>" pnpm --filter @pt/api migrate

# b. The data
pnpm --filter @pt/api data:migrate -- \
  --source file:./turso-final.db \
  --target "<production postgres url>" \
  --orphans=<decision> --report cutover-report.json
```

Add `--reset` only when the target was rehearsed on and has rows. The tables print as a count and checksum table; exit code 0 means every table matched and every sequence is right. Running it twice with `--reset` gives the same checksums (idempotent). Passing the URL on the command line puts it in shell history; prefer an environment variable your shell does not log.

### 3. Verify

```sh
pnpm --filter @pt/api data:verify -- \
  --source file:./turso-final.db --target "<production postgres url>" --orphans=<decision>
```

`data:verify` writes nothing and exits 1 on any mismatch. Keep `cutover-report.json`: counts, checksums, orphans, skipped and nulled values, blob totals, duration.

What the checksum covers: for each row a SHA-256 over every column, normalized (ids, timestamps as epoch milliseconds, booleans as 0/1, numbers, text byte for byte, blobs as their SHA-256), then a SHA-256 over the sorted row hashes. Password and passcode hashes (`scrypt$N$salt$hash`) are text and are compared exactly, so every password keeps working.

### 4. Deploy the API

The image is built from the repo root with `apps/api/Dockerfile` (`node dist/migrate.js && node dist/main.js` is the start command used by `docker-compose.yml`). Run it on the chosen host with these environment variables:

| Variable                                                        | Value                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                  | the production PostgreSQL URL (required)                                                                    |
| `NODE_ENV`                                                      | `production`                                                                                                |
| `PORT`                                                          | the port the host expects (default 4000)                                                                    |
| `WEB_ORIGIN`                                                    | the production web origin, for example `https://<domain>` (CORS and the realtime socket)                    |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`        | the existing web push keys (all three, or push is off)                                                      |
| `GIPHY_API_KEY`                                                 | optional, sticker search                                                                                    |
| `LOGIN_THROTTLE_LIMIT`, `LOG_LEVEL`, `REALTIME_RECHECK_SECONDS` | optional, see `apps/api/.env.example`                                                                       |

Behind a proxy or load balancer, serve it over HTTPS on its own host name (for example `api.<domain>`). Check `GET https://<api host>/v1/health`: it must answer `ok` with `db` ok. If no admin existed in the copied data, create one once with `SUPER_ADMIN_USERNAME`/`SUPER_ADMIN_PASSWORD` set in the API's environment and `pnpm --filter @pt/api admin:create`; the copied admins already work.

### 5. Vercel settings

1. Project Settings, General: Root Directory `apps/web` (the repo is a monorepo; "Include files outside the Root Directory" stays enabled so `packages/contracts` is built). Build command `next build` comes from `apps/web/package.json` (`pnpm build` at the root also works: contracts, then web). Node 24.
2. Environment Variables (Production and Preview): add `API_URL` (the API's base URL, server only) and `NEXT_PUBLIC_API_URL` (the same host; the browser's realtime socket connects to it, and the API's `WEB_ORIGIN` must allow this web origin). Keep `HEALTH_CHECK_TOKEN` and the web push variables the web still reads (`VAPID_PUBLIC_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
3. Do NOT delete the old variables yet; first do steps 6 and 7. After the cutover is accepted, remove `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SESSION_SECRET`, `ABLY_API_KEY`, `ADMIN_USERNAME` and `ADMIN_PASSWORD`, and disconnect the Turso integration in Storage (only after the rollback period).
4. Deploy the branch that contains this step 10 (merged into `stag`, then the release PR `stag` to `main`, `docs/release.md`).

### 6. Branch protection

Required status checks on `stag` and `main` are the three gate jobs: `checks-web`, `checks-api`, `checks-contracts`. Make sure they are the only required ones (the e2e shards gate `checks-web` themselves on the release PR into `main`).

### 7. Smoke checks

- `https://<domain>/api/health?token=<HEALTH_CHECK_TOKEN>` answers `"status": "ok"` and shows the API check.
- Log in as one trainee and one admin through the web app, using their existing password (hashes are copied unchanged). Sessions are new: everyone logs in once again after cutover.
- Check the admin passcode, one chat photo, the latest chat message, a food log and a workout week.
- Send one chat message between a trainee and the PT and see it arrive live (the realtime socket needs `NEXT_PUBLIC_API_URL` and `WEB_ORIGIN` to agree).
- Log out in the web app, then try the old token against `GET /v1/auth/me`: it must answer 401.
- Lift the maintenance window.

## Rollback

Turso is never changed, so rollback is switching the front end back:

1. In Vercel, promote the previous production deployment (the last build before this one) to production again (Deployments, "Promote to Production"). It still reads Turso with its old environment variables, which is why they are removed only after the cutover is accepted.
2. Anything written to PostgreSQL after the lift of the freeze is not in Turso. If the window was short, accept the loss; otherwise copy those rows back by hand before promoting.
3. Keep the API and PostgreSQL running or stop them; nothing depends on them in the old deployment.

## If the data script fails

The load is one transaction, so a failure leaves the target as it was (after `--reset`, restored too). Fix the cause, then re-run. Orphan or validation aborts happen before any write. While this happens production is still frozen: if it takes long, lift the freeze (Turso is unchanged) and retry in another window.

## Credentials

- Never put a token on the command line. If a remote read is ever needed, export `TURSO_AUTH_TOKEN` in the shell and pass `--allow-remote`; the script prints only the host and never the token or any connection string.
- Never put production URLs in `.env.example` or in commits.

## After the cutover (once the rollback period has passed)

Delete `apps/api/scripts/` (`migrate-from-turso.ts`, `migrate/`, `turso-columns.*`, `turso-schema.*`), `apps/api/test/migrate-from-turso.e2e.test.ts`, `apps/api/test/support/turso-fixture.ts`, the `data:*` scripts and the `@libsql/client` dev dependency, remove the old Vercel variables listed in step 5, and disconnect the Turso database.
