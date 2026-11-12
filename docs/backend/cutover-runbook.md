# Cutover runbook: Turso to PostgreSQL

Hoan runs this himself. Claude never runs the script against Turso or any remote database; every rehearsal uses a local SQLite file.

The script is `apps/api/scripts/migrate-from-turso.ts`. It copies all 44 tables into an empty PostgreSQL that already has the baseline migration, then proves the copy is complete. It is removed after cutover, together with `turso-columns.json` and `generate-turso-columns.ts`.

## What it does

1. Reads a SQLite file (`file:` URL) with `@libsql/client`. A remote source is refused unless `--allow-remote` is passed (the plan does not need it).
2. Refuses to start when the target has pending migrations. Apply them first: `DATABASE_URL=<target> pnpm --filter @pt/api migrate`. The script never changes the schema.
3. Validates every value (enum CHECK values, integer ranges, NUL characters, timestamp units, NOT NULL), then scans every foreign key for orphan rows.
4. Loads in one transaction, parents first, with `OVERRIDING SYSTEM VALUE` (ids are kept). A foreign key that closes a cycle (`chat_conversations.last_message_id`, `chat_messages.photo_id`, `chat_messages.reply_to_message_id`, the DM and social photo links) is loaded as NULL and set by an `UPDATE` after all tables are loaded. No superuser rights are needed.
5. Runs `setval` on every identity sequence (max id; an empty table gives 1 as the next value).
6. Verifies row counts and checksums on both sides before `COMMIT`. A mismatch rolls the whole load back.

`--reset` truncates the 44 tables and `sessions` in the same transaction. Without it, a target that has any row is refused.

## Steps

### 1. Rehearse on a local copy (as often as needed)

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

### 2. Read the orphan report and decide

SQLite never enforced its foreign keys, so some rows may point at deleted parents. The report lists table, column, count and sample ids. Default is to abort.

- `--orphans=skip`: do not copy those rows (and, repeatedly, rows that pointed at a skipped row). Every skipped row id goes in the JSON report.
- `--orphans=null`: set the FK column to NULL. Only for nullable columns; a NOT NULL column aborts.
- Pass the same `--orphans` value to `data:verify` later, so it knows what was left out.

Nothing is dropped silently: skipped and nulled values are counted and listed in the console and in the report.

### 3. Freeze window

1. Announce a short maintenance window. Put the web app in read-only or maintenance mode so nothing writes to Turso.
2. Take the export from step 1 again (`.dump` or the libSQL file). Use this fresh copy for the real run; never point the script at the live Turso database.
3. Keep Turso untouched and read-only afterwards for the rollback period.

### 4. Run

```sh
pnpm --filter @pt/api data:migrate -- \
  --source file:./turso-final.db \
  --target "<production postgres url>" \
  --orphans=<decision> --report cutover-report.json
```

Add `--reset` only when the target was rehearsed on and has rows. The tables print as a count and checksum table; exit code 0 means every table matched and every sequence is right.

Running it twice with `--reset` gives the same checksums (idempotent).

### 5. Verify again and keep the report

```sh
pnpm --filter @pt/api data:verify -- \
  --source file:./turso-final.db --target "<production postgres url>" --orphans=<decision>
```

`data:verify` writes nothing and exits 1 on any mismatch. Keep `cutover-report.json`: counts, checksums, orphans, skipped and nulled values, blob totals, duration.

What the checksum covers: for each row a SHA-256 over every column, normalized (ids, timestamps as epoch milliseconds, booleans as 0/1, numbers, text byte for byte, blobs as their SHA-256), then a SHA-256 over the sorted row hashes. Password and passcode hashes (`scrypt$N$salt$hash`) are text and are compared exactly.

### 6. Spot-check logins

- Log in as one trainee and one admin through the web app pointed at the new API, using their existing password. Hashes are copied unchanged, so passwords still work.
- Check the admin passcode, one chat photo, the latest chat message and a food log.
- Sessions are new: everyone logs in once again after cutover.

## Credentials

- Never put a token on the command line. If a remote read is ever needed, export `TURSO_AUTH_TOKEN` in the shell and pass `--allow-remote`; the script prints only the host and never the token or any connection string.
- Never put production URLs in `.env.example` or in commits.

## If it fails

The load is one transaction, so a failure leaves the target as it was (after `--reset`, restored too). Fix the cause, then re-run. Orphan or validation aborts happen before any write.
