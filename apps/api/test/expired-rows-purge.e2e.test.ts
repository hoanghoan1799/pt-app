import { LOGIN_LOCK_MS, LOGIN_WINDOW_MS } from "@pt/contracts";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Clock } from "../src/common/clock.js";
import {
  ExpiredRowsPurge,
  RATE_LIMIT_RETENTION_MS,
} from "../src/housekeeping/expired-rows-purge.service.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

const NOW = new Date("2030-01-10T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

describe("ExpiredRowsPurge", () => {
  let db: TestDatabase;
  let purge: ExpiredRowsPurge;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);
  const keys = async (table: string) =>
    (
      (await query(`SELECT key FROM ${table} ORDER BY key`)) as {
        key: string;
      }[]
    ).map((row) => row.key);
  const attempt = (
    key: string,
    windowStartedAt: Date,
    lockedUntil: Date | null,
  ) =>
    query(
      `INSERT INTO login_attempts (key, failed_count, window_started_at, locked_until) VALUES ($1, 3, $2, $3)`,
      [key, windowStartedAt, lockedUntil],
    );
  const limit = (key: string, windowStartedAt: Date) =>
    query(
      `INSERT INTO rate_limits (key, count, window_started_at) VALUES ($1, 1, $2)`,
      [key, windowStartedAt],
    );

  beforeAll(async () => {
    db = await createTestDatabase();
    const clock = { now: () => NOW } as Clock;

    purge = new ExpiredRowsPurge(db.dataSource, clock, {
      NODE_ENV: "test",
      PURGE_INTERVAL_MINUTES: 60,
    });
  });

  beforeEach(async () => {
    await query(`DELETE FROM login_attempts`);
    await query(`DELETE FROM rate_limits`);
  });

  afterAll(async () => {
    await db.drop();
  });

  it("removes expired login_attempts and keeps live windows and locks", async () => {
    await attempt("user:old-window", ago(LOGIN_WINDOW_MS), null);
    await attempt("user:unknown-name", ago(LOGIN_WINDOW_MS + 1), null);
    await attempt("user:live-window", ago(LOGIN_WINDOW_MS - 1000), null);
    await attempt("user:lock-over", ago(LOGIN_LOCK_MS * 2), ago(1000));
    await attempt("user:lock-over-window-live", ago(1000), ago(1));
    await attempt("user:locked", ago(1000), ahead(LOGIN_LOCK_MS));
    // The window is over but the lock is not: still locked, so it stays.
    await attempt(
      "admin:locked-old-window",
      ago(LOGIN_WINDOW_MS * 2),
      ahead(5000),
    );

    const result = await purge.purge();

    expect(result).toEqual({ loginAttempts: 4, rateLimits: 0 });
    expect(await keys("login_attempts")).toEqual([
      "admin:locked-old-window",
      "user:live-window",
      "user:locked",
    ]);
  });

  it("removes rate_limits older than the longest window and keeps the rest", async () => {
    await limit("friend-request:1", ago(RATE_LIMIT_RETENTION_MS));
    await limit("friend-request:2", ago(RATE_LIMIT_RETENTION_MS + 60_000));
    await limit("friend-request:3", ago(RATE_LIMIT_RETENTION_MS - 60_000));
    await limit("friend-request:4", NOW);

    const result = await purge.purge();

    expect(result).toEqual({ loginAttempts: 0, rateLimits: 2 });
    expect(await keys("rate_limits")).toEqual([
      "friend-request:3",
      "friend-request:4",
    ]);
  });

  it("deletes in bounded batches until a batch comes back short", async () => {
    for (let i = 0; i < 25; i += 1) {
      await limit(
        `friend-request:${100 + i}`,
        ago(RATE_LIMIT_RETENTION_MS * 2),
      );
    }
    await limit("friend-request:keep", NOW);
    const spy = vi.spyOn(db.dataSource, "query");

    try {
      const result = await purge.purge(10);
      const deletes = spy.mock.calls.filter(([sql]) =>
        String(sql).includes(`DELETE FROM "rate_limits"`),
      );

      expect(result.rateLimits).toBe(25);
      expect(deletes).toHaveLength(3); // 10, 10, 5
    } finally {
      spy.mockRestore();
    }
    expect(await keys("rate_limits")).toEqual(["friend-request:keep"]);
  });

  it("does one extra empty batch when the backlog is an exact multiple", async () => {
    for (let i = 0; i < 20; i += 1) {
      await limit(
        `friend-request:${200 + i}`,
        ago(RATE_LIMIT_RETENTION_MS * 2),
      );
    }

    expect((await purge.purge(10)).rateLimits).toBe(20);
    expect(await keys("rate_limits")).toEqual([]);
  });

  it("skips a row another transaction holds (a login attempt in progress)", async () => {
    await attempt("user:busy", ago(LOGIN_WINDOW_MS * 2), null);
    await attempt("user:idle", ago(LOGIN_WINDOW_MS * 2), null);

    await db.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT 1 FROM login_attempts WHERE key = 'user:busy' FOR UPDATE`,
      );
      const result = await purge.purge();

      expect(result.loginAttempts).toBe(1);
    });
    expect(await keys("login_attempts")).toEqual(["user:busy"]);
  });
});
