import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "./support/database.js";

const sqlError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const driver = (
      error as { driverError?: { code?: string; message?: string } }
    ).driverError;

    return { code: driver?.code, message: driver?.message ?? "" };
  }
  return undefined;
};

describe("DbHousekeeping: DM membership", () => {
  let db: TestDatabase;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);
  const id = async (sql: string, params: unknown[] = []) =>
    (await query(sql, params))[0].id as number;
  const newUser = (name: string) =>
    id(`INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`, [
      name,
    ]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  let low: number;
  let high: number;
  let outsider: number;
  let conversation: number;
  let counter = 0;

  const insertMessage = (sender: number) => {
    counter += 1;
    return query(
      `INSERT INTO dm_messages (conversation_id, sender_id, client_id, created_at)
       VALUES ($1, $2, 'c${counter}', now()) RETURNING id`,
      [conversation, sender],
    );
  };
  const insertPhoto = (uploader: number) =>
    query(
      `INSERT INTO dm_photos (conversation_id, uploader_id, mime, width, height, data, size, created_at)
       VALUES ($1, $2, 'image/png', 1, 1, $3, 4, now()) RETURNING id`,
      [conversation, uploader, PNG],
    );
  const insertRead = (user: number) =>
    query(
      `INSERT INTO dm_reads (conversation_id, user_id, last_read_message_id) VALUES ($1, $2, 0)`,
      [conversation, user],
    );

  beforeAll(async () => {
    db = await createTestDatabase();
    const [a, b] = [await newUser("hk-a"), await newUser("hk-b")];

    low = Math.min(a, b);
    high = Math.max(a, b);
    outsider = await newUser("hk-outsider");
    conversation = await id(
      `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now()) RETURNING id`,
      [low, high],
    );
  });

  afterAll(async () => {
    await db.drop();
  });

  const tables = {
    dm_messages: [insertMessage, "sender_id"],
    dm_photos: [insertPhoto, "uploader_id"],
    dm_reads: [insertRead, "user_id"],
  } as const;

  describe.each(Object.entries(tables))("%s", (table, [insert]) => {
    it("accepts both members", async () => {
      expect(await sqlError(insert(low))).toBeUndefined();
      if (table !== "dm_reads") {
        expect(await sqlError(insert(high))).toBeUndefined();
      }
    });

    it("rejects a user who is not in the conversation (23514)", async () => {
      const error = await sqlError(insert(outsider));

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(table);
      expect(error?.message).toContain(String(conversation));
    });
  });

  it("rejects moving a row to a user outside the conversation", async () => {
    const error = await sqlError(
      query(
        `UPDATE dm_messages SET sender_id = $1 WHERE conversation_id = $2`,
        [outsider, conversation],
      ),
    );

    expect(error?.code).toBe("23514");
  });

  it("lets a member's row change other columns", async () => {
    expect(
      await sqlError(
        query(`UPDATE dm_messages SET body = 'x' WHERE conversation_id = $1`, [
          conversation,
        ]),
      ),
    ).toBeUndefined();
  });

  it("refuses to change the pair of an existing conversation", async () => {
    const error = await sqlError(
      query(`UPDATE dm_conversations SET user_high = $1 WHERE id = $2`, [
        outsider + 1000,
        conversation,
      ]),
    );

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("dm_conversations");
  });

  it("still allows other conversation updates", async () => {
    expect(
      await sqlError(
        query(
          `UPDATE dm_conversations SET last_message_at = now() WHERE id = $1`,
          [conversation],
        ),
      ),
    ).toBeUndefined();
  });
});
