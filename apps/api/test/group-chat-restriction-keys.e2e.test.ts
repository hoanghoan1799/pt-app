import type { QueryRunner } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GroupChatRestrictionKeys1796100000000 } from "../src/migrations/1796100000000-GroupChatRestrictionKeys.js";
import { seedAdmin } from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

// PostgreSQL error codes: 23514 check_violation, 23503 foreign_key_violation,
// 23505 unique_violation.
const sqlState = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
};

const CLIENT_ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";

const fixture = async () => {
  const db: TestDatabase = await createTestDatabase();
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);

  return {
    db,
    query,
    newUser: async (name: string): Promise<number> =>
      (
        await query(
          `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
          [name],
        )
      )[0].id,
    newGroup: async (): Promise<number> =>
      (
        await query(
          `INSERT INTO chat_groups (name, created_by_key, created_at)
           VALUES ('Nhóm', 'admin:1', now()) RETURNING id`,
        )
      )[0].id,
    send: (groupId: number, senderKey: string, clientId: string | null) =>
      query(
        `INSERT INTO chat_group_messages (group_id, kind, sender_key, body, client_id, created_at)
         VALUES ($1, 'message', $2, 'hi', $3, now()) RETURNING id`,
        [groupId, senderKey, clientId],
      ),
    join: (groupId: number, memberKey: string, lastRead?: number | null) =>
      lastRead === undefined
        ? query(
            `INSERT INTO chat_group_members (group_id, member_key, added_by_key, joined_at)
             VALUES ($1, $2, 'admin:1', now())`,
            [groupId, memberKey],
          )
        : query(
            `INSERT INTO chat_group_members (group_id, member_key, added_by_key, joined_at, last_read_message_id)
             VALUES ($1, $2, 'admin:1', now(), $3)`,
            [groupId, memberKey, lastRead],
          ),
  };
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

describe("GroupChatRestrictionKeys: group chat keys", () => {
  let f: Fixture;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    f = await fixture();
    alice = `user:${await f.newUser("gcr alice")}`;
    bob = `user:${await f.newUser("gcr bob")}`;
  });

  afterAll(async () => {
    await f.db.drop();
  });

  it("stores two members' messages that share a client_id, and still dedupes one sender's retry", async () => {
    const group = await f.newGroup();
    const [first] = await f.send(group, alice, CLIENT_ID);
    const [other] = await f.send(group, bob, CLIENT_ID);

    expect(other.id).not.toBe(first.id);

    // The retry as a send path writes it: the conflict target is the new key,
    // nothing is inserted, and the lookup by the same key finds the original.
    const retried = await f.query(
      `INSERT INTO chat_group_messages (group_id, kind, sender_key, body, client_id, created_at)
       VALUES ($1, 'message', $2, 'hi', $3, now())
       ON CONFLICT (group_id, sender_key, client_id) DO NOTHING RETURNING id`,
      [group, alice, CLIENT_ID],
    );
    const original = await f.query(
      `SELECT id FROM chat_group_messages
        WHERE group_id = $1 AND sender_key = $2 AND client_id = $3`,
      [group, alice, CLIENT_ID],
    );

    expect(retried).toEqual([]);
    expect(original).toEqual([{ id: first.id }]);
    expect(await sqlState(f.send(group, alice, CLIENT_ID))).toBe("23505");

    const stored = await f.query(
      `SELECT sender_key FROM chat_group_messages
        WHERE group_id = $1 AND client_id = $2 ORDER BY id`,
      [group, CLIENT_ID],
    );

    expect(stored).toEqual([{ sender_key: alice }, { sender_key: bob }]);
  });

  it("starts a member with no read cursor (NULL) and refuses 0, a missing message and another group's", async () => {
    const group = await f.newGroup();
    const otherGroup = await f.newGroup();
    const [own] = await f.send(group, alice, null);
    const [foreign] = await f.send(otherGroup, alice, null);

    await f.join(group, alice);

    const [member] = await f.query(
      `SELECT last_read_message_id FROM chat_group_members
        WHERE group_id = $1 AND member_key = $2`,
      [group, alice],
    );

    expect(member.last_read_message_id).toBeNull();

    const markRead = (value: number) =>
      f.query(
        `UPDATE chat_group_members SET last_read_message_id = $3
          WHERE group_id = $1 AND member_key = $2`,
        [group, alice, value],
      );

    expect(await sqlState(markRead(0))).toBe("23503");
    expect(await sqlState(markRead(foreign.id))).toBe("23503");
    expect(await sqlState(markRead(987_654))).toBe("23503");
    expect(await sqlState(f.join(group, bob, foreign.id))).toBe("23503");
    expect(await sqlState(markRead(own.id))).toBeUndefined();
  });

  it("clears only the cursor when its message is deleted, never group_id", async () => {
    const group = await f.newGroup();
    const [older] = await f.send(group, bob, null);
    const [read] = await f.send(group, bob, null);

    await f.join(group, alice, read.id);
    await f.join(group, bob, older.id);
    await f.query(`DELETE FROM chat_group_messages WHERE id = $1`, [read.id]);

    expect(
      await f.query(
        `SELECT group_id, member_key, last_read_message_id FROM chat_group_members
          WHERE group_id = $1 ORDER BY member_key`,
        [group],
      ),
    ).toEqual([
      { group_id: group, member_key: alice, last_read_message_id: null },
      { group_id: group, member_key: bob, last_read_message_id: older.id },
    ]);
  });
});

describe("GroupChatRestrictionKeys: one active restriction per trainee", () => {
  let f: Fixture;
  let adminId: number;

  const insertBlock = (
    runner: QueryRunner | null,
    userId: number,
    level: "restricted" | "suspended" = "restricted",
  ) =>
    (runner ?? f.db.dataSource).query(
      `INSERT INTO user_restrictions (user_id, level, created_by_admin_id, created_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [userId, level, adminId],
    );

  // The write path documented on the entity: lock the trainee, lift every row
  // that is not lifted, insert. Runs inside the caller's transaction.
  const block = async (runner: QueryRunner, userId: number) => {
    await runner.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [
      userId,
    ]);
    await runner.query(
      `UPDATE user_restrictions
          SET lifted_at = GREATEST(created_at, LEAST(now(), COALESCE(until, now()))),
              lifted_by_admin_id = $2
        WHERE user_id = $1 AND lifted_at IS NULL`,
      [userId, adminId],
    );
    return (await insertBlock(runner, userId))[0].id as number;
  };

  const transaction = async () => {
    const runner = f.db.dataSource.createQueryRunner();

    await runner.connect();
    await runner.startTransaction();
    return runner;
  };

  // Waits until another session is blocked on a lock (the second create).
  const waitForLockWait = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await f.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );

      if (row.n > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("the second create never waited for the first");
  };

  const active = (userId: number) =>
    f.query(
      `SELECT id FROM user_restrictions WHERE user_id = $1 AND lifted_at IS NULL`,
      [userId],
    );

  beforeAll(async () => {
    f = await fixture();
    adminId = (await seedAdmin(f.db.dataSource)).id;
  });

  afterAll(async () => {
    await f.db.drop();
  });

  it("refuses a second active row, and accepts it once the first is lifted in the same transaction", async () => {
    const trainee = await f.newUser("ur second");
    const [first] = await insertBlock(null, trainee);

    expect(await sqlState(insertBlock(null, trainee, "suspended"))).toBe(
      "23505",
    );

    const runner = await transaction();
    const second = await block(runner, trainee);

    await runner.commitTransaction();
    await runner.release();

    const rows = await f.query(
      `SELECT id, lifted_at IS NOT NULL AS lifted, lifted_by_admin_id AS "liftedBy"
         FROM user_restrictions WHERE user_id = $1 ORDER BY id`,
      [trainee],
    );

    expect(rows).toEqual([
      { id: first.id, lifted: true, liftedBy: adminId },
      { id: second, lifted: false, liftedBy: null },
    ]);
  });

  it("lifts an expired block that was never lifted before the next one (it still holds the slot)", async () => {
    const trainee = await f.newUser("ur expired");
    const [expired] = await f.query(
      `INSERT INTO user_restrictions (user_id, level, until, created_by_admin_id, created_at)
       VALUES ($1, 'restricted', now() - interval '1 day', $2, now() - interval '2 days')
       RETURNING id`,
      [trainee, adminId],
    );

    expect(await sqlState(insertBlock(null, trainee))).toBe("23505");

    const runner = await transaction();

    await block(runner, trainee);
    await runner.commitTransaction();
    await runner.release();

    const [row] = await f.query(
      `SELECT lifted_at = until AS "atUntil" FROM user_restrictions WHERE id = $1`,
      [expired.id],
    );

    expect(row.atUntil).toBe(true);
  });

  it("two concurrent creates both succeed through the write path, and one stays active", async () => {
    const trainee = await f.newUser("ur concurrent");
    const first = await transaction();
    const second = await transaction();

    try {
      const firstId = await block(first, trainee);
      const secondCreate = block(second, trainee);

      await waitForLockWait();
      await first.commitTransaction();

      const secondId = await secondCreate;

      await second.commitTransaction();

      expect(await active(trainee)).toEqual([{ id: secondId }]);
      expect(
        await f.query(
          `SELECT id, lifted_at IS NOT NULL AS lifted FROM user_restrictions
            WHERE user_id = $1 ORDER BY id`,
          [trainee],
        ),
      ).toEqual([
        { id: firstId, lifted: true },
        { id: secondId, lifted: false },
      ]);
    } finally {
      await first.release();
      await second.release();
    }
  });

  it("two concurrent plain inserts never leave two active rows: the index refuses the second", async () => {
    const trainee = await f.newUser("ur race");
    const first = await transaction();
    const second = await transaction();

    try {
      await insertBlock(first, trainee);

      const secondInsert = sqlState(insertBlock(second, trainee));

      await waitForLockWait();
      await first.commitTransaction();

      expect(await secondInsert).toBe("23505");
      await second.rollbackTransaction();
      expect(await active(trainee)).toHaveLength(1);
    } finally {
      await first.release();
      await second.release();
    }
  });

  it("refuses a lifted_at before created_at", async () => {
    const trainee = await f.newUser("ur early");

    expect(
      await sqlState(
        f.query(
          `INSERT INTO user_restrictions (user_id, level, created_by_admin_id, created_at, lifted_at)
           VALUES ($1, 'restricted', $2, now(), now() - interval '1 minute')`,
          [trainee, adminId],
        ),
      ),
    ).toBe("23514");
  });
});

describe("GroupChatRestrictionKeys: existing rows on the way up", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await fixture();
  });

  afterAll(async () => {
    await f.db.drop();
  });

  it("clears 0 and dangling cursors, resolves duplicate active restrictions and early lifts, then enforces the rules", async () => {
    const migration = new GroupChatRestrictionKeys1796100000000();
    const t = (ms: number) => new Date(1_700_000_000_000 + ms);

    await migration.down(f.db.dataSource.createQueryRunner());

    // What the old rules let in.
    const group = await f.newGroup();
    const otherGroup = await f.newGroup();
    const reader = await f.newUser("mig reader");
    const never = await f.newUser("mig never");
    const lost = await f.newUser("mig lost");
    const stray = await f.newUser("mig stray");
    const [own] = await f.send(group, `user:${reader}`, null);
    const [foreign] = await f.send(otherGroup, `user:${reader}`, null);

    await f.join(group, `user:${reader}`, own.id);
    await f.join(group, `user:${never}`);
    await f.join(group, `user:${lost}`, 987_654);
    await f.join(group, `user:${stray}`, foreign.id);

    const restriction = async (
      userId: number,
      createdAt: number,
      until: number | null = null,
      liftedAt: number | null = null,
    ) =>
      (
        await f.query(
          `INSERT INTO user_restrictions (user_id, level, until, created_at, lifted_at)
           VALUES ($1, 'restricted', $2, $3, $4) RETURNING id`,
          [
            userId,
            until === null ? null : t(until),
            t(createdAt),
            liftedAt === null ? null : t(liftedAt),
          ],
        )
      )[0].id as number;

    // The same rows as the data script's unit test (planRestrictionLifts).
    const r1 = await restriction(reader, 100, 150);
    const r2 = await restriction(reader, 200);
    const r3 = await restriction(reader, 300, 900);
    const r4 = await restriction(reader, 400, null, 450);
    const r5 = await restriction(never, 100);
    const r6 = await restriction(lost, 500);
    const r7 = await restriction(lost, 500);
    const early = await restriction(stray, 100, null, 50);

    await migration.up(f.db.dataSource.createQueryRunner());

    const cursors = Object.fromEntries(
      (
        await f.query(
          `SELECT member_key, last_read_message_id FROM chat_group_members
            WHERE group_id = $1`,
          [group],
        )
      ).map(
        (row: { member_key: string; last_read_message_id: number | null }) => [
          row.member_key,
          row.last_read_message_id,
        ],
      ),
    );

    expect(cursors).toEqual({
      [`user:${reader}`]: own.id,
      [`user:${never}`]: null,
      [`user:${lost}`]: null,
      [`user:${stray}`]: null,
    });

    const lifted = Object.fromEntries(
      (await f.query(`SELECT id, lifted_at FROM user_restrictions`)).map(
        (row: { id: number; lifted_at: Date | null }) => [
          row.id,
          row.lifted_at,
        ],
      ),
    );

    expect(lifted).toEqual({
      [r1]: t(150),
      [r2]: t(300),
      [r3]: null,
      [r4]: t(450),
      [r5]: null,
      [r6]: t(500),
      [r7]: null,
      [early]: t(100),
    });

    expect(
      await sqlState(
        f.query(
          `INSERT INTO user_restrictions (user_id, level, created_at) VALUES ($1, 'suspended', now())`,
          [reader],
        ),
      ),
    ).toBe("23505");
    expect(
      await sqlState(
        f.query(
          `UPDATE chat_group_members SET last_read_message_id = 0 WHERE member_key = $1`,
          [`user:${never}`],
        ),
      ),
    ).toBe("23503");
  });
});
