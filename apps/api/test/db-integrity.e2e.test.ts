import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deriveId } from "../scripts/migrate/account-refs.js";
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

type Kind = "user" | "admin";
type Account = { kind: Kind; id: number };
type Ctx = {
  user: number;
  admin: number;
  post: number;
  conversation: number;
  message: number;
};

const DANGLING = 987_654;
const keyOf = (account: Account) => `${account.kind}:${account.id}`;

describe("account references have real foreign keys", () => {
  let db: TestDatabase;
  let ctx: Ctx;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);
  const newUser = async (name: string) =>
    (
      await query(
        `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
        [name],
      )
    )[0].id as number;
  const newAdmin = async (name: string) =>
    (
      await query(
        `INSERT INTO admins (username, username_key, password_hash, role)
         VALUES ($1, $1, 'x', 'pt') RETURNING id`,
        [name],
      )
    )[0].id as number;

  beforeAll(async () => {
    db = await createTestDatabase();
    const user = await newUser("owner");
    const admin = await newAdmin("coach");
    const [{ id: post }] = await query(
      `INSERT INTO social_posts (author_kind, author_id, privacy, created_at, updated_at)
       VALUES ('user', $1, 'everyone', now(), now()) RETURNING id`,
      [user],
    );
    const [{ id: conversation }] = await query(
      `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
      [user],
    );
    const [{ id: message }] = await query(
      `INSERT INTO chat_messages (conversation_id, sender_role, client_id, created_at)
       VALUES ($1, 'user', 'seed', now()) RETURNING id`,
      [conversation],
    );

    ctx = { user, admin, post, conversation, message };
  });

  afterAll(async () => {
    await db.drop();
  });

  // One entry per covered column: which kinds of account it can point at, and
  // an INSERT whose only account reference is `who` (the rest is valid).
  type Case = {
    column: string;
    kinds: Kind[];
    insert: (who: Account) => [string, unknown[]];
  };
  const cases: Record<string, Case[]> = {
    social_comments: [
      {
        column: "author_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO social_comments (post_id, author_key, body, created_at)
           VALUES ($1, $2, 'hi', now())`,
          [ctx.post, keyOf(who)],
        ],
      },
    ],
    social_reactions: [
      {
        column: "reactor_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO social_reactions (post_id, reactor_key, emoji, created_at)
           VALUES ($1, $2, '❤️', now())`,
          [ctx.post, keyOf(who)],
        ],
      },
    ],
    social_notifications: [
      {
        column: "recipient_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO social_notifications (recipient_key, kind, actor_key, created_at)
           VALUES ($1, 'friend_request', $2, now())`,
          [keyOf(who), `user:${ctx.user}`],
        ],
      },
      {
        column: "actor_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO social_notifications (recipient_key, kind, actor_key, created_at)
           VALUES ($1, 'friend_request', $2, now())`,
          [`user:${ctx.user}`, keyOf(who)],
        ],
      },
    ],
    social_reports: [
      {
        column: "reporter_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO social_reports (reporter_key, target_kind, target_id, status, created_at)
           VALUES ($1, 'post', $2, 'open', now())`,
          [keyOf(who), ctx.post],
        ],
      },
      {
        column: "target_kind/target_id (user)",
        kinds: ["user"],
        insert: (who) => [
          `INSERT INTO social_reports (reporter_key, target_kind, target_id, status, created_at)
           VALUES ($1, 'user', $2, 'open', now())`,
          [`user:${ctx.user}`, who.id],
        ],
      },
    ],
    social_post_photos: [
      {
        column: "uploader_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO social_post_photos (uploader_key, mime, width, height, data, size, created_at)
           VALUES ($1, 'image/png', 1, 1, '\\x01', 1, now())`,
          [keyOf(who)],
        ],
      },
    ],
    social_posts: [
      {
        column: "author_kind/author_id",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO social_posts (author_kind, author_id, privacy, created_at, updated_at)
           VALUES ($1, $2, 'everyone', now(), now())`,
          [who.kind, who.id],
        ],
      },
    ],
    chat_custom_stickers: [
      {
        column: "owner_kind/owner_id",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO chat_custom_stickers (owner_kind, owner_id, mime, data, size, created_at)
           VALUES ($1, $2, 'image/png', '\\x01', 1, now())`,
          [who.kind, who.id],
        ],
      },
    ],
    push_subscriptions: [
      {
        column: "owner_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO push_subscriptions (owner_key, endpoint) VALUES ($1, $2)`,
          [keyOf(who), `endpoint-${who.kind}-${who.id}`],
        ],
      },
    ],
    contact_aliases: [
      {
        column: "owner_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
           VALUES ($1, 'pt', 'x', now())`,
          [keyOf(who)],
        ],
      },
      {
        column: "target_key",
        kinds: ["user", "admin"],
        insert: (who) => [
          `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
           VALUES ($1, $2, 'x', now())`,
          [`user:${ctx.user}`, keyOf(who)],
        ],
      },
    ],
    // Chat scheme: "user" is the conversation's trainee, only "admin:<id>"
    // points at an account of its own.
    chat_photos: [
      {
        column: "uploader_key",
        kinds: ["admin"],
        insert: (who) => [
          `INSERT INTO chat_photos (conversation_id, uploader_key, mime, width, height, data, size, created_at)
           VALUES ($1, $2, 'image/png', 1, 1, '\\x01', 1, now())`,
          [ctx.conversation, keyOf(who)],
        ],
      },
    ],
    chat_reactions: [
      {
        column: "reactor_key",
        kinds: ["admin"],
        insert: (who) => [
          `INSERT INTO chat_reactions (message_id, reactor_key, emoji, created_at)
           VALUES ($1, $2, '👍', now())`,
          [ctx.message, keyOf(who)],
        ],
      },
    ],
    chat_reads: [
      {
        column: "reader_key",
        kinds: ["admin"],
        insert: (who) => [
          `INSERT INTO chat_reads (conversation_id, reader_key) VALUES ($1, $2)`,
          [ctx.conversation, keyOf(who)],
        ],
      },
    ],
  };

  const count = async (table: string) =>
    (await query(`SELECT count(*)::int AS n FROM "${table}"`))[0].n as number;

  for (const [table, list] of Object.entries(cases)) {
    for (const item of list) {
      for (const kind of item.kinds) {
        it(`${table}.${item.column} -> ${kind}s: rejects a dangling reference, cascades on delete`, async () => {
          const run = (who: Account) => {
            const [sql, params] = item.insert(who);

            return query(sql, params);
          };

          expect(await sqlState(run({ kind, id: DANGLING }))).toBe("23503");

          const before = await count(table);
          const id =
            kind === "user"
              ? await newUser(`${table}-${item.column}-u`)
              : await newAdmin(`${table}-${item.column}-a`);

          await run({ kind, id });
          expect(await count(table)).toBe(before + 1);

          await query(`DELETE FROM ${kind}s WHERE id = $1`, [id]);
          expect(await count(table)).toBe(before);
        });
      }
    }
  }

  it("leaves the other account kind and non-account keys unchecked", async () => {
    // A chat reader "user" (the trainee) and the alias target "pt" are not
    // account keys: no foreign key applies.
    await query(
      `INSERT INTO chat_reads (conversation_id, reader_key) VALUES ($1, 'user')`,
      [ctx.conversation],
    );
    await query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, 'pt', 'coach', now())`,
      [`user:${ctx.user}`],
    );
    // Each kind's reference is checked against its own table.
    expect(
      await sqlState(
        query(
          `INSERT INTO social_comments (post_id, author_key, body, created_at)
           VALUES ($1, $2, 'x', now())`,
          [ctx.post, `admin:${ctx.user + 1000}`],
        ),
      ),
    ).toBe("23503");
  });

  it("maps the generated ids: kind + id pairs and keys", async () => {
    const rows = await query(
      `SELECT author_user_id, author_admin_id FROM social_comments
       WHERE author_key = $1 LIMIT 1`,
      [`user:${ctx.user}`],
    );

    expect(rows).toEqual([]);
    await query(
      `INSERT INTO social_comments (post_id, author_key, body, created_at)
       VALUES ($1, $2, 'a', now()), ($1, $3, 'b', now())`,
      [ctx.post, `user:${ctx.user}`, `admin:${ctx.admin}`],
    );
    const mapped = await query(
      `SELECT author_key, author_user_id, author_admin_id FROM social_comments
       WHERE post_id = $1 AND author_key IN ($2, $3) ORDER BY author_key`,
      [ctx.post, `user:${ctx.user}`, `admin:${ctx.admin}`],
    );

    expect(mapped).toEqual([
      {
        author_key: `admin:${ctx.admin}`,
        author_user_id: null,
        author_admin_id: ctx.admin,
      },
      {
        author_key: `user:${ctx.user}`,
        author_user_id: ctx.user,
        author_admin_id: null,
      },
    ]);
  });

  it("derives the same ids as the data migration script does", async () => {
    const keys = [
      `user:${ctx.user}`,
      `admin:${ctx.admin}`,
      "user:012",
      "user:abc",
      "user:1234567890",
      "admin:0",
      "someone",
    ];

    for (const key of keys) {
      await query(
        `INSERT INTO social_comments (post_id, author_key, body, created_at)
         VALUES ($1, $2, 'derive', now())`,
        [ctx.post, key],
      );
    }
    const rows: {
      author_key: string;
      author_user_id: number | null;
      author_admin_id: number | null;
    }[] = await query(
      `SELECT author_key, author_user_id, author_admin_id FROM social_comments
       WHERE body = 'derive'`,
    );

    expect(rows).toHaveLength(keys.length);
    for (const row of rows) {
      const source = { author_key: row.author_key };

      expect(row.author_user_id, row.author_key).toBe(
        deriveId("social_comments", "author_user_id", source),
      );
      expect(row.author_admin_id, row.author_key).toBe(
        deriveId("social_comments", "author_admin_id", source),
      );
    }
  });

  it("refuses to write a generated column", async () => {
    expect(
      await sqlState(
        query(
          `INSERT INTO social_comments (post_id, author_key, body, created_at, author_user_id)
           VALUES ($1, $2, 'x', now(), $3)`,
          [ctx.post, `user:${ctx.user}`, ctx.user],
        ),
      ),
    ).toBe("428C9");
  });
});

describe("lookup indexes for account deletion", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  // Every text key the cleanup services filter on must lead some index.
  const LOOKUPS: [string, string][] = [
    ["social_comments", "author_key"],
    ["social_reactions", "reactor_key"],
    ["social_notifications", "recipient_key"],
    ["social_notifications", "actor_key"],
    ["social_reports", "reporter_key"],
    ["social_reports", "target_kind"],
    ["social_post_photos", "uploader_key"],
    ["contact_aliases", "owner_key"],
    ["contact_aliases", "target_key"],
    ["push_subscriptions", "owner_key"],
    ["chat_custom_stickers", "owner_kind"],
    ["social_posts", "author_kind"],
  ];

  it.each(LOOKUPS)("%s.%s leads an index", async (table, column) => {
    const rows: { leading: string }[] = await db.dataSource.query(
      `SELECT a.attname AS leading
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
       WHERE c.relname = $1 AND a.attname = $2`,
      [table, column],
    );

    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("message dedup keys are scoped by sender", () => {
  let db: TestDatabase;
  let conversation: number;
  let dm: number;
  let users: number[];
  let admins: number[];
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);

  beforeAll(async () => {
    db = await createTestDatabase();
    users = [];
    admins = [];
    for (const name of ["a", "b"]) {
      users.push(
        (
          await query(
            `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
            [name],
          )
        )[0].id,
      );
      admins.push(
        (
          await query(
            `INSERT INTO admins (username, username_key, password_hash, role)
             VALUES ($1, $1, 'x', 'pt') RETURNING id`,
            [name],
          )
        )[0].id,
      );
    }
    conversation = (
      await query(
        `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
        [users[0]],
      )
    )[0].id;
    dm = (
      await query(
        `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now()) RETURNING id`,
        [users[0], users[1]],
      )
    )[0].id;
  });

  afterAll(async () => {
    await db.drop();
  });

  const chatInsert = (role: string, adminId: number | null, clientId: string) =>
    query(
      `INSERT INTO chat_messages (conversation_id, sender_role, sender_admin_id, client_id, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [conversation, role, adminId, clientId],
    );

  it("chat: the same sender cannot reuse a client_id, another sender can", async () => {
    await chatInsert("user", null, "k1");
    expect(await sqlState(chatInsert("user", null, "k1"))).toBe("23505");
    await chatInsert("admin", admins[0], "k1");
    expect(await sqlState(chatInsert("admin", admins[0], "k1"))).toBe("23505");
    await chatInsert("admin", admins[1], "k1");
    expect(
      (
        await query(
          `SELECT count(*)::int AS n FROM chat_messages WHERE client_id = 'k1'`,
        )
      )[0].n,
    ).toBe(3);
  });

  it("chat: ON CONFLICT on the sender key skips only the same sender", async () => {
    const upsert = (adminId: number) =>
      query(
        `INSERT INTO chat_messages (conversation_id, sender_role, sender_admin_id, client_id, created_at)
         VALUES ($1, 'admin', $2, 'k2', now())
         ON CONFLICT (conversation_id, sender_role, (COALESCE(sender_admin_id, 0)), client_id) DO NOTHING
         RETURNING id`,
        [conversation, adminId],
      );

    expect(await upsert(admins[0])).toHaveLength(1);
    expect(await upsert(admins[0])).toHaveLength(0);
    expect(await upsert(admins[1])).toHaveLength(1);
  });

  it("dm: scoped by (conversation, sender, client_id)", async () => {
    const insert = (sender: number, clientId: string) =>
      query(
        `INSERT INTO dm_messages (conversation_id, sender_id, body, client_id, created_at)
         VALUES ($1, $2, 'x', $3, now())`,
        [dm, sender, clientId],
      );

    await insert(users[0], "d1");
    expect(await sqlState(insert(users[0], "d1"))).toBe("23505");
    await insert(users[1], "d1");
  });
});

describe("chat sender consistency", () => {
  let db: TestDatabase;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  it("rejects a trainee message with an admin id, keeps history when the admin is removed", async () => {
    const [{ id: userId }] = await query(
      `INSERT INTO users (name, name_key) VALUES ('u', 'u') RETURNING id`,
    );
    const [{ id: adminId }] = await query(
      `INSERT INTO admins (username, username_key, password_hash, role)
       VALUES ('c', 'c', 'x', 'pt') RETURNING id`,
    );
    const [{ id: conversationId }] = await query(
      `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
      [userId],
    );
    const insert = (role: string, sender: number | null, clientId: string) =>
      query(
        `INSERT INTO chat_messages (conversation_id, sender_role, sender_admin_id, client_id, created_at)
         VALUES ($1, $2, $3, $4, now())`,
        [conversationId, role, sender, clientId],
      );

    expect(await sqlState(insert("user", adminId, "bad"))).toBe("23514");
    await insert("user", null, "ok-user");
    await insert("admin", adminId, "ok-admin");

    await query(`DELETE FROM admins WHERE id = $1`, [adminId]);

    const rows = await query(
      `SELECT sender_role, sender_admin_id FROM chat_messages
       WHERE client_id = 'ok-admin'`,
    );

    expect(rows).toEqual([{ sender_role: "admin", sender_admin_id: null }]);
  });
});
