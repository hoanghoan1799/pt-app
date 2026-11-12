import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "./support/database.js";

// Chat search folds accents in SQL, and Vietnamese needs d/D for the stroked
// letters. The stock PostgreSQL unaccent rules already map them, so
// immutable_unaccent is a plain wrapper; this test fails if that ever changes.
describe("immutable_unaccent", () => {
  let db: TestDatabase;
  const fold = async (input: string) => {
    const rows: { folded: string }[] = await db.dataSource.query(
      `SELECT immutable_unaccent(lower($1)) AS folded`,
      [input],
    );

    return rows[0].folded;
  };

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  it("maps đ and Đ to d and D (stock rules, no extra handling)", async () => {
    const rows: { lower_d: string; upper_d: string }[] =
      await db.dataSource.query(
        `SELECT immutable_unaccent('đ') AS lower_d, immutable_unaccent('Đ') AS upper_d`,
      );

    expect(rows[0]).toEqual({ lower_d: "d", upper_d: "D" });
  });

  it("folds Vietnamese text the way the JS search does", async () => {
    expect(await fold("Đường đi Việt Nam")).toBe("duong di viet nam");
    expect(await fold("Cơm gà ĐẬU HŨ")).toBe("com ga dau hu");
  });

  it("matches a folded query against a stored chat body", async () => {
    const { dataSource } = db;
    const [{ id: userId }] = await dataSource.query(
      `INSERT INTO users (name, name_key) VALUES ('Chat', 'chat') RETURNING id`,
    );
    const [{ id: conversationId }] = await dataSource.query(
      `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
      [userId],
    );

    await dataSource.query(
      `INSERT INTO chat_messages (conversation_id, sender_role, client_id, body, created_at)
       VALUES ($1, 'user', 'm1', 'Hôm nay tập Đùi sau', now())`,
      [conversationId],
    );

    const rows = await dataSource.query(
      `SELECT body FROM chat_messages
       WHERE deleted_at IS NULL AND sticker_ref IS NULL
         AND immutable_unaccent(lower(body)) LIKE '%' || $1 || '%'`,
      ["dui sau"],
    );

    expect(rows).toEqual([{ body: "Hôm nay tập Đùi sau" }]);
  });
});
