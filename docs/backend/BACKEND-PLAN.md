# pt-app NestJS + PostgreSQL backend: handoff plan

Status: analysis only. Do NOT write code, create repos or branches until Hoan says "approve".
Full detail: `nest-blueprint.html` in this folder (44 tables as TypeORM entity specs, 137 endpoints, libraries, patterns, migration plan). Live copy: https://claude.ai/artifact/HXsPG38gg9rYp58RG5reLZ

## Decisions (all agreed by Hoan, 2026-11-11)
1. Hosting: run local first (Docker Compose); deploy target chosen later.
2. PostgreSQL 17 in local Docker first; managed provider later.
3. ORM: TypeORM 1.x via @nestjs/typeorm 12 (`synchronize: false`, migrations generated and reviewed). NOT Drizzle in the API.
4. pnpm monorepo inside pt-app: `apps/web` (Next), `apps/api` (NestJS 12, ESM), `packages/contracts` (Zod 4 schemas + types, framework-free so a mobile app can reuse it). No `packages/db`.
5. Next.js is a BFF: server actions and route handlers call the API server-to-server.
6. Auth: opaque session tokens in a `sessions` table (SHA-256 hashed), Bearer for any client (web cookie forwards it; mobile uses secure storage). Keep email+password with scrypt hashes (format `scrypt$N$salt$hash`), 5 fails / 15 min lockout, admin passcode. Passkeys later.
7. Realtime: Socket.IO gateway in Nest replaces Ably; polling fallback kept; single instance.
8. Files (chat photos, stickers, avatars): `bytea` in PG for the MVP behind a `FileStorage` port (R2/MinIO later).
9. Data: one-time script Turso -> PG (keep ids, reset identity sequences, short freeze window).
10. Push: `web-push` with the current VAPID keys; `push_subscriptions.kind` = web | expo | fcm for the mobile app later.
11. Admin UI stays in Next.js.
12. API: REST `/v1` + OpenAPI (`@nestjs/swagger`); validation with Zod via NestJS 12 Standard Schema pipe (no nestjs-zod); typed client generated for Next.
13. Tests: Vitest (+ unplugin-swc), supertest, Testcontainers PostgreSQL.
14. CI: GitHub Actions for the API (lint, typecheck, test, PG service container, "no migration diff" check). Deploy later.
15. A mobile app is planned: public, client-agnostic API from day one, `/v1` additive only, sessions record client_name/client_kind/last_seen_at.

## Design patterns
Modular monolith, one Nest module per feature. Inside a module: controller/gateway (HTTP/WS only), service (use cases + transactions), queries (read models), policy (authorization rules), mapper (entity -> DTO, never return entities). TypeORM repositories directly (no generic base repo). Domain events (`@nestjs/event-emitter`) for chat -> socket/push/unread. Adapter + Strategy for: push sender, login credential, file storage, sticker source, nutrition target, notification content. Central exception filter returns `{code, message, ref}`. Cursor pagination, Idempotency-Key on message/upload/post creation.

## Implementation order (module by module, one PR each, small slices)
0. Monorepo + `packages/contracts`.
1. API core: config (Zod env), TypeORM DataSource, baseline migration for 44 tables, error filter, health, logger. Write the Turso -> PG script here so later steps test on real data.
2. Auth + sessions + guards/policies.
3. Foods (simplest, proves the template).
4. Workouts + exercise sets.
5. Nutrition + meal plans + TDEE.
6. Users/PT/admin (members, avatar, nicknames, hidden trainees).
7. Social (profiles, posts, comments, reactions, friends, feed, notifications).
8. Chat + Socket.IO gateway + push + stickers/GIPHY (largest and riskiest, last).
9. Cutover: freeze, run data script, switch all flags, remove Turso/Ably/jose/Drizzle.
Per module: entity + migration, contracts, service/policy/controller, Vitest with real PG, then switch the web server action behind the `API_MODULES` flag.

## Conventions (project rules)
- Branches from `stag`, PR into `stag`; names like `feat/api-core`, never `claude/...`. One KAN ticket per branch if Jira is used.
- Commits authored as Hoan Hoang <141096593+hoanhoang-agilityio@users.noreply.github.com>; no `Co-Authored-By` or `Claude-Session` lines.
- Code, comments, docs, commits, PRs in English; chat replies to Hoan in Vietnamese.
- Schema changes additive; never run db scripts against Turso/production.
- Run `pnpm verify` before reporting done. Update the "pt-app Blueprint" artifact when features/tables/APIs change.
- Cost rules: Opus advises only, Sonnet/Haiku write code and files, medium effort.

## Known risks / checks
- SQLite never enforced 43 FKs; orphan rows may break real FKs during migration (clean first).
- Current auth is jose JWT cookies; moves to DB sessions.
- Verify `unaccent` maps `đ` -> `d` for chat search.
- `schema.json` lacks `chat_messages.silent`; `db/schema.ts` is the source of truth.
