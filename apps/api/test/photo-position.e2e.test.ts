import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PhotoPosition1795400000000 } from "../src/migrations/1795400000000-PhotoPosition.js";
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

describe("PhotoPosition schema rules", () => {
  let db: TestDatabase;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);
  const id = async (sql: string, params: unknown[] = []) =>
    (await query(sql, params))[0].id as number;
  const inTransaction = (work: (q: typeof query) => Promise<void>) =>
    db.dataSource.transaction(async (manager) => {
      await work((sql, params = []) => manager.query(sql, params));
    });
  let counter = 0;

  // One owner (a message or a post) and a way to make photos for it, per table.
  const kinds = [
    {
      name: "chat",
      owners: "chat_messages",
      photos: "chat_photos",
      ownerColumn: "message_id",
      makeOwner: async () => {
        counter += 1;
        const user = await id(
          `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
          [`pp-chat${counter}`],
        );
        const conversation = await id(
          `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
          [user],
        );
        const owner = await id(
          `INSERT INTO chat_messages (conversation_id, sender_role, client_id, created_at)
           VALUES ($1, 'user', $2, now()) RETURNING id`,
          [conversation, `pp${counter}`],
        );

        return {
          owner,
          photo: () =>
            id(
              `INSERT INTO chat_photos (conversation_id, uploader_key, mime, width, height, data, size, created_at)
               VALUES ($1, 'user', 'image/png', 1, 1, ''::bytea, 0, now()) RETURNING id`,
              [conversation],
            ),
        };
      },
    },
    {
      name: "dm",
      owners: "dm_messages",
      photos: "dm_photos",
      ownerColumn: "message_id",
      makeOwner: async () => {
        counter += 1;
        const low = await id(
          `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
          [`pp-dm${counter}a`],
        );
        const high = await id(
          `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
          [`pp-dm${counter}b`],
        );
        const conversation = await id(
          `INSERT INTO dm_conversations (user_low, user_high, created_at)
           VALUES ($1, $2, now()) RETURNING id`,
          [Math.min(low, high), Math.max(low, high)],
        );
        const owner = await id(
          `INSERT INTO dm_messages (conversation_id, sender_id, client_id, created_at)
           VALUES ($1, $2, $3, now()) RETURNING id`,
          [conversation, low, `pp${counter}`],
        );

        return {
          owner,
          photo: () =>
            id(
              `INSERT INTO dm_photos (conversation_id, uploader_id, mime, width, height, data, size, created_at)
               VALUES ($1, $2, 'image/png', 1, 1, ''::bytea, 0, now()) RETURNING id`,
              [conversation, low],
            ),
        };
      },
    },
    {
      name: "social",
      owners: "social_posts",
      photos: "social_post_photos",
      ownerColumn: "post_id",
      makeOwner: async () => {
        counter += 1;
        const user = await id(
          `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
          [`pp-soc${counter}`],
        );
        const owner = await id(
          `INSERT INTO social_posts (author_kind, author_id, privacy, created_at, updated_at)
           VALUES ('user', $1, 'everyone', now(), now()) RETURNING id`,
          [user],
        );

        return {
          owner,
          photo: () =>
            id(
              `INSERT INTO social_post_photos (uploader_key, mime, width, height, data, size, created_at)
               VALUES ('user:${user}', 'image/png', 1, 1, ''::bytea, 0, now()) RETURNING id`,
            ),
        };
      },
    },
  ];

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  describe.each(kinds)("$name photos", (kind) => {
    const attach = (
      q: typeof query,
      owner: number,
      photo: number,
      position: number | null,
    ) =>
      q(
        `UPDATE ${kind.photos} SET ${kind.ownerColumn} = $1, position = $3 WHERE id = $2`,
        [owner, photo, position],
      );
    const cover = (q: typeof query, owner: number, photo: number) =>
      q(`UPDATE ${kind.owners} SET photo_id = $1 WHERE id = $2`, [
        photo,
        owner,
      ]);

    it("has a nullable integer position column", async () => {
      const rows = await query(
        `SELECT data_type, is_nullable FROM information_schema.columns
         WHERE table_name = $1 AND column_name = 'position'`,
        [kind.photos],
      );

      expect(rows).toEqual([{ data_type: "integer", is_nullable: "YES" }]);
    });

    it("stores up to 10 photos on one owner in order, the first one its cover", async () => {
      const { owner, photo } = await kind.makeOwner();
      const ids: number[] = [];

      for (let index = 0; index < 10; index += 1) {
        ids.push(await photo());
      }
      await inTransaction(async (q) => {
        for (const [position, photoId] of ids.entries()) {
          await attach(q, owner, photoId, position);
        }
        await cover(q, owner, ids[0]);
      });
      const rows = await query(
        `SELECT id FROM ${kind.photos} WHERE ${kind.ownerColumn} = $1
         ORDER BY COALESCE(position, 0), id`,
        [owner],
      );

      expect(rows.map((row: { id: number }) => row.id)).toEqual(ids);
    });

    it("refuses a negative position", async () => {
      const { owner, photo } = await kind.makeOwner();
      const photoId = await photo();

      expect(
        await sqlState(inTransaction((q) => attach(q, owner, photoId, -1))),
      ).toBe("23514");
    });

    it("refuses two photos at the same position of one owner", async () => {
      const { owner, photo } = await kind.makeOwner();
      const first = await photo();
      const second = await photo();

      await inTransaction(async (q) => {
        await attach(q, owner, first, 0);
        await cover(q, owner, first);
      });

      expect(
        await sqlState(inTransaction((q) => attach(q, owner, second, 0))),
      ).toBe("23505");
    });

    it("lets rows from before positions (null) and pending photos share a slot", async () => {
      const { owner, photo } = await kind.makeOwner();
      const first = await photo();
      const second = await photo();
      const pending = await photo();
      const otherPending = await photo();

      await inTransaction(async (q) => {
        await attach(q, owner, first, null);
        await attach(q, owner, second, null);
        await cover(q, owner, first);
      });
      await query(
        `UPDATE ${kind.photos} SET position = 0 WHERE id = ANY($1::int[])`,
        [[pending, otherPending]],
      );

      const rows = await query(
        `SELECT count(*)::int AS total FROM ${kind.photos} WHERE ${kind.ownerColumn} = $1`,
        [owner],
      );

      expect(rows[0].total).toBe(2);
    });

    it("reverts: the extra photos go, the cover stays, then it applies again", async () => {
      const { owner, photo } = await kind.makeOwner();
      const first = await photo();
      const second = await photo();
      const pending = await photo();

      await inTransaction(async (q) => {
        await attach(q, owner, first, 0);
        await attach(q, owner, second, 1);
        await cover(q, owner, first);
      });
      await new PhotoPosition1795400000000().down(
        db.dataSource.createQueryRunner(),
      );

      const left = await query(
        `SELECT id FROM ${kind.photos} WHERE id = ANY($1::int[]) ORDER BY id`,
        [[first, second, pending]],
      );

      expect(left.map((row: { id: number }) => row.id)).toEqual([
        first,
        pending,
      ]);
      const columns = await query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = $1 AND column_name = 'position'`,
        [kind.photos],
      );

      expect(columns).toEqual([]);
      // The old rule is back: a second attached photo is refused at COMMIT.
      expect(
        await sqlState(
          inTransaction((q) =>
            q(
              `UPDATE ${kind.photos} SET ${kind.ownerColumn} = $1 WHERE id = $2`,
              [owner, pending],
            ),
          ),
        ),
      ).toBe("23503");
      await new PhotoPosition1795400000000().up(
        db.dataSource.createQueryRunner(),
      );
      await inTransaction((q) => attach(q, owner, pending, 1));
    });
  });
});
