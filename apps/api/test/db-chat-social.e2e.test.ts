import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "./support/database.js";

// PostgreSQL error codes: 23514 check_violation, 23503 foreign_key_violation,
// 23505 unique_violation, 23502 not_null_violation.
const sqlState = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
};

describe("DbChatSocial schema rules", () => {
  let db: TestDatabase;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);
  const id = async (sql: string, params: unknown[] = []) =>
    (await query(sql, params))[0].id as number;
  // Runs statements in one transaction so deferred constraints are checked at
  // COMMIT, like the app does.
  const inTransaction = (work: (q: typeof query) => Promise<void>) =>
    db.dataSource.transaction(async (manager) => {
      await work((sql, params = []) => manager.query(sql, params));
    });

  const newUser = (name: string) =>
    id(`INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`, [
      name,
    ]);
  const newConversation = (user: number) =>
    id(`INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`, [
      user,
    ]);
  let counter = 0;
  const newMessage = (conversation: number) => {
    counter += 1;
    return id(
      `INSERT INTO chat_messages (conversation_id, sender_role, client_id, created_at)
       VALUES ($1, 'user', 'c${counter}', now()) RETURNING id`,
      [conversation],
    );
  };
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  let alice: number;
  let bob: number;
  let carol: number;

  beforeAll(async () => {
    db = await createTestDatabase();
    alice = await newUser("alice");
    bob = await newUser("bob");
    carol = await newUser("carol");
  });

  afterAll(async () => {
    await db.drop();
  });

  describe("image size", () => {
    const owner = () => alice;
    const inserts: Record<string, () => Promise<unknown>> = {
      chat_photos: async () =>
        query(
          `INSERT INTO chat_photos (conversation_id, uploader_key, mime, width, height, data, size, created_at)
           VALUES ($1, 'user', 'image/png', 1, 1, $2, 99, now())`,
          [await newConversation(await newUser("sz-chat")), PNG],
        ),
      dm_photos: async () => {
        const [low, high] = [await newUser("sz-a"), await newUser("sz-b")];
        const conversation = await id(
          `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now()) RETURNING id`,
          [low, high],
        );

        return query(
          `INSERT INTO dm_photos (conversation_id, uploader_id, mime, width, height, data, size, created_at)
           VALUES ($1, $2, 'image/png', 1, 1, $3, 99, now())`,
          [conversation, low, PNG],
        );
      },
      social_post_photos: () =>
        query(
          `INSERT INTO social_post_photos (uploader_key, mime, width, height, data, size, created_at)
           VALUES ('user:${owner()}', 'image/png', 1, 1, $1, 99, now())`,
          [PNG],
        ),
      chat_custom_stickers: () =>
        query(
          `INSERT INTO chat_custom_stickers (owner_kind, owner_id, mime, data, size, created_at)
           VALUES ('user', ${owner()}, 'image/png', $1, 99, now())`,
          [PNG],
        ),
      user_avatars: async () =>
        query(
          `INSERT INTO user_avatars (user_id, mime, data, size, updated_at)
           VALUES ($1, 'image/png', $2, 99, now())`,
          [await newUser("sz-avatar"), PNG],
        ),
      admin_avatars: async () => {
        const admin = await id(
          `INSERT INTO admins (username, username_key, password_hash, role)
           VALUES ('sz-admin', 'sz-admin', 'x', 'pt') RETURNING id`,
        );

        return query(
          `INSERT INTO admin_avatars (admin_id, mime, data, size, updated_at)
           VALUES ($1, 'image/png', $2, 99, now())`,
          [admin, PNG],
        );
      },
    };

    it.each(Object.keys(inserts))(
      "%s refuses a size that is not the byte length",
      async (table) => {
        expect(await sqlState(inserts[table]())).toBe("23514");
      },
    );

    it("accepts the empty placeholder the upload services write first (0 bytes, size 0)", async () => {
      await query(
        `INSERT INTO social_post_photos (uploader_key, mime, width, height, data, size, created_at)
         VALUES ('user:${alice}', 'image/png', 1, 1, ''::bytea, 0, now())`,
      );
    });
  });

  it("silent is NOT NULL and defaults to false", async () => {
    const conversation = await newConversation(alice);
    const message = await newMessage(conversation);

    expect(
      (await query(`SELECT silent FROM chat_messages WHERE id = $1`, [message]))[0]
        .silent,
    ).toBe(false);
    expect(
      await sqlState(
        query(`UPDATE chat_messages SET silent = NULL WHERE id = $1`, [message]),
      ),
    ).toBe("23502");
  });

  it("no longer has the legacy attachment columns, nicknames table or the redundant index", async () => {
    const columns = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'chat_messages' AND column_name LIKE 'attachment%'`,
    );
    const tables = await query(
      `SELECT to_regclass('chat_nicknames') AS present`,
    );
    const indexes = await query(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'chat_photos_conversation'`,
    );

    expect(columns).toEqual([]);
    expect(tables[0].present).toBeNull();
    expect(indexes).toEqual([]);
  });

  describe("replies stay in their conversation", () => {
    it("refuses a reply to a message of another conversation", async () => {
      const first = await newConversation(await newUser("r1"));
      const second = await newConversation(await newUser("r2"));
      const foreign = await newMessage(first);

      expect(
        await sqlState(
          query(
            `INSERT INTO chat_messages (conversation_id, sender_role, client_id, reply_to_message_id, created_at)
             VALUES ($1, 'user', 'reply-x', $2, now())`,
            [second, foreign],
          ),
        ),
      ).toBe("23503");
    });

    it("clears only reply_to_message_id when the replied message is deleted", async () => {
      const conversation = await newConversation(await newUser("r3"));
      const original = await newMessage(conversation);
      const reply = await id(
        `INSERT INTO chat_messages (conversation_id, sender_role, client_id, reply_to_message_id, created_at)
         VALUES ($1, 'user', 'reply-ok', $2, now()) RETURNING id`,
        [conversation, original],
      );

      await query(`DELETE FROM chat_messages WHERE id = $1`, [original]);
      const [row] = await query(
        `SELECT conversation_id, reply_to_message_id FROM chat_messages WHERE id = $1`,
        [reply],
      );

      expect(row.reply_to_message_id).toBeNull();
      expect(row.conversation_id).toBe(conversation);
    });
  });

  describe("last_message_id belongs to its conversation", () => {
    it("chat: refuses a foreign message and clears only the pointer on delete", async () => {
      const mine = await newConversation(await newUser("l1"));
      const other = await newConversation(await newUser("l2"));
      const foreign = await newMessage(other);
      const own = await newMessage(mine);

      expect(
        await sqlState(
          query(
            `UPDATE chat_conversations SET last_message_id = $1 WHERE id = $2`,
            [foreign, mine],
          ),
        ),
      ).toBe("23503");

      await query(
        `UPDATE chat_conversations SET last_message_id = $1 WHERE id = $2`,
        [own, mine],
      );
      await query(`DELETE FROM chat_messages WHERE id = $1`, [own]);
      const [row] = await query(
        `SELECT id, user_id, last_message_id FROM chat_conversations WHERE id = $1`,
        [mine],
      );

      expect(row.last_message_id).toBeNull();
      expect(row.id).toBe(mine);
    });

    it("dm: refuses a foreign message", async () => {
      const [a, b, c] = [
        await newUser("dl-a"),
        await newUser("dl-b"),
        await newUser("dl-c"),
      ];
      const pair = (low: number, high: number) =>
        id(
          `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now()) RETURNING id`,
          [low, high],
        );
      const first = await pair(a, b);
      const second = await pair(a, c);
      const message = await id(
        `INSERT INTO dm_messages (conversation_id, sender_id, client_id, created_at)
         VALUES ($1, $2, 'dm1', now()) RETURNING id`,
        [first, a],
      );

      expect(
        await sqlState(
          query(
            `UPDATE dm_conversations SET last_message_id = $1 WHERE id = $2`,
            [message, second],
          ),
        ),
      ).toBe("23503");
      await query(
        `UPDATE dm_conversations SET last_message_id = $1 WHERE id = $2`,
        [message, first],
      );
    });
  });

  // The three photo <-> owner pairs: one source of truth, enforced both ways.
  describe.each([
    {
      name: "chat",
      owner: "chat_messages",
      photos: "chat_photos",
      ownerColumn: "message_id",
      pointer: "photo_id",
      makeOwner: async () => {
        const conversation = await newConversation(await newUser(`cp${++counter}`));

        return {
          owner: await newMessage(conversation),
          photo: () =>
            id(
              `INSERT INTO chat_photos (conversation_id, uploader_key, mime, width, height, data, size, created_at)
               VALUES ($1, 'user', 'image/png', 1, 1, ''::bytea, 0, now()) RETURNING id`,
              [conversation],
            ),
          another: () => newMessage(conversation),
        };
      },
    },
    {
      name: "dm",
      owner: "dm_messages",
      photos: "dm_photos",
      ownerColumn: "message_id",
      pointer: "photo_id",
      makeOwner: async () => {
        const low = await newUser(`dp${++counter}a`);
        const high = await newUser(`dp${counter}b`);
        const conversation = await id(
          `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now()) RETURNING id`,
          [low, high],
        );
        const message = () =>
          id(
            `INSERT INTO dm_messages (conversation_id, sender_id, client_id, created_at)
             VALUES ($1, $2, 'p${++counter}', now()) RETURNING id`,
            [conversation, low],
          );

        return {
          owner: await message(),
          photo: () =>
            id(
              `INSERT INTO dm_photos (conversation_id, uploader_id, mime, width, height, data, size, created_at)
               VALUES ($1, $2, 'image/png', 1, 1, ''::bytea, 0, now()) RETURNING id`,
              [conversation, low],
            ),
          another: message,
        };
      },
    },
    {
      name: "social",
      owner: "social_posts",
      photos: "social_post_photos",
      ownerColumn: "post_id",
      pointer: "photo_id",
      makeOwner: async () => {
        const post = () =>
          id(
            `INSERT INTO social_posts (author_kind, author_id, privacy, created_at, updated_at)
             VALUES ('user', $1, 'everyone', now(), now()) RETURNING id`,
            [alice],
          );

        return {
          owner: await post(),
          photo: () =>
            id(
              `INSERT INTO social_post_photos (uploader_key, mime, width, height, data, size, created_at)
               VALUES ('user:${alice}', 'image/png', 1, 1, ''::bytea, 0, now()) RETURNING id`,
            ),
          another: post,
        };
      },
    },
  ])("$name photo link", (c) => {
    const attach = (
      q: typeof query,
      owner: number,
      photo: number,
    ) =>
      q(
        `UPDATE ${c.photos} SET ${c.ownerColumn} = $1 WHERE id = $2`,
        [owner, photo],
      );
    const point = (q: typeof query, owner: number, photo: number) =>
      q(`UPDATE ${c.owner} SET ${c.pointer} = $1 WHERE id = $2`, [photo, owner]);

    it("accepts the app order: attach the photo, then point at it, in one transaction", async () => {
      const { owner, photo } = await c.makeOwner();
      const photoId = await photo();

      await inTransaction(async (q) => {
        await attach(q, owner, photoId);
        await point(q, owner, photoId);
      });
      const [row] = await query(
        `SELECT ${c.pointer} AS pointer FROM ${c.owner} WHERE id = $1`,
        [owner],
      );

      expect(row.pointer).toBe(photoId);
    });

    it("refuses a message that points at a photo attached to another message", async () => {
      const { owner, photo, another } = await c.makeOwner();
      const other = await another();
      const photoId = await photo();

      await inTransaction(async (q) => {
        await attach(q, other, photoId);
        await point(q, other, photoId);
      });

      expect(
        await sqlState(inTransaction((q) => point(q, owner, photoId))),
      ).toBe("23503");
    });

    it("refuses a message that points at a photo nobody attached", async () => {
      const { owner, photo } = await c.makeOwner();
      const pending = await photo();

      expect(
        await sqlState(inTransaction((q) => point(q, owner, pending))),
      ).toBe("23503");
    });

    it("refuses at COMMIT a photo attached to a message that does not point back", async () => {
      const { owner, photo } = await c.makeOwner();
      const photoId = await photo();

      expect(
        await sqlState(inTransaction((q) => attach(q, owner, photoId))),
      ).toBe("23503");
    });

    it("refuses a photo attached to a message that points at another photo", async () => {
      const { owner, photo } = await c.makeOwner();
      const first = await photo();
      const second = await photo();

      await inTransaction(async (q) => {
        await attach(q, owner, first);
        await point(q, owner, first);
      });

      expect(
        await sqlState(inTransaction((q) => attach(q, owner, second))),
      ).toBe("23503");
    });

    it("clears the pointer when the photo is deleted and deletes the photo with its owner", async () => {
      const first = await c.makeOwner();
      const photoId = await first.photo();

      await inTransaction(async (q) => {
        await attach(q, first.owner, photoId);
        await point(q, first.owner, photoId);
      });
      await query(`DELETE FROM ${c.photos} WHERE id = $1`, [photoId]);
      expect(
        (
          await query(
            `SELECT ${c.pointer} AS pointer FROM ${c.owner} WHERE id = $1`,
            [first.owner],
          )
        )[0].pointer,
      ).toBeNull();

      const second = await c.makeOwner();
      const kept = await second.photo();

      await inTransaction(async (q) => {
        await attach(q, second.owner, kept);
        await point(q, second.owner, kept);
      });
      await query(`DELETE FROM ${c.owner} WHERE id = $1`, [second.owner]);
      expect(
        await query(`SELECT 1 FROM ${c.photos} WHERE id = $1`, [kept]),
      ).toEqual([]);
    });

    it("lets the unsend order work: point away first, delete the photo after, in one transaction", async () => {
      const { owner, photo } = await c.makeOwner();
      const photoId = await photo();

      await inTransaction(async (q) => {
        await attach(q, owner, photoId);
        await point(q, owner, photoId);
      });
      await inTransaction(async (q) => {
        await q(`UPDATE ${c.owner} SET ${c.pointer} = NULL WHERE id = $1`, [
          owner,
        ]);
        await q(`DELETE FROM ${c.photos} WHERE ${c.ownerColumn} = $1`, [owner]);
      });
    });
  });

  describe("pairs of people", () => {
    it("dm_conversations: user_low must be below user_high", async () => {
      expect(
        await sqlState(
          query(
            `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now())`,
            [bob, alice],
          ),
        ),
      ).toBe("23514");
      expect(
        await sqlState(
          query(
            `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $1, now())`,
            [bob],
          ),
        ),
      ).toBe("23514");
    });

    it("social_friendships: ordered pair and a requester who is one of the two", async () => {
      const friendship = (low: number, high: number, by: number) =>
        query(
          `INSERT INTO social_friendships (user_low, user_high, status, requested_by, created_at)
           VALUES ($1, $2, 'pending', $3, now())`,
          [low, high, by],
        );

      expect(await sqlState(friendship(bob, alice, bob))).toBe("23514");
      expect(await sqlState(friendship(alice, bob, carol))).toBe("23514");
      expect(await sqlState(friendship(alice, bob, bob))).toBeUndefined();
    });
  });

  describe("social_reports", () => {
    const report = (key: string, status = "open", extra = "") =>
      query(
        `INSERT INTO social_reports (reporter_key, target_kind, target_id, status, created_at${extra ? ", resolution, resolved_at" : ""})
         VALUES ($1, 'post', 7, '${status}', now()${extra})`,
        [key],
      );

    it("allows one open report per reporter and target, but a new one after it is resolved", async () => {
      const key = `user:${alice}`;

      await report(key);
      expect(await sqlState(report(key))).toBe("23505");
      expect(await sqlState(report(`user:${bob}`))).toBeUndefined();
      await query(
        `UPDATE social_reports SET status = 'resolved', resolution = 'kept', resolved_at = now()
         WHERE reporter_key = $1`,
        [key],
      );
      expect(await sqlState(report(key))).toBeUndefined();
    });

    it("ties status to the resolution columns", async () => {
      const key = `user:${carol}`;

      // open with a resolution, resolved without one
      expect(
        await sqlState(report(key, "open", ", 'kept', now()")),
      ).toBe("23514");
      expect(await sqlState(report(key, "resolved"))).toBe("23514");
      expect(
        await sqlState(report(key, "resolved", ", 'deleted', now()")),
      ).toBeUndefined();
    });
  });
});
