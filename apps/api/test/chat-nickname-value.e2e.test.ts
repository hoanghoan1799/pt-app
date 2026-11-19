import { aliasValueSchema } from "@pt/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ChatNicknameValue1796000000000 } from "../src/migrations/1796000000000-ChatNicknameValue.js";
import { seedAdmin } from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

// PostgreSQL error code 23514: check_violation.
const sqlState = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
};

describe("ChatNicknameValue: the nickname CHECK matches the API's schema", () => {
  let db: TestDatabase;
  let conversationId: number;
  let adminTarget: string;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);
  const insert = (targetKey: string, nickname: string) =>
    query(
      `INSERT INTO chat_nicknames (conversation_id, target_key, nickname, set_by_key, updated_at)
       VALUES ($1, $2, $3, 'user', now())`,
      [conversationId, targetKey, nickname],
    );
  const clear = () =>
    query(`DELETE FROM chat_nicknames WHERE conversation_id = $1`, [
      conversationId,
    ]);

  beforeAll(async () => {
    db = await createTestDatabase();
    const [user] = await query(
      `INSERT INTO users (name, name_key) VALUES ('cnv', 'cnv') RETURNING id`,
    );
    const [conversation] = await query(
      `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
      [user.id],
    );

    conversationId = conversation.id;
    adminTarget = `admin:${(await seedAdmin(db.dataSource)).id}`;
  });

  afterAll(async () => {
    await db.drop();
  });

  it("stores every value the schema produces", async () => {
    for (const typed of [
      "Bé Na",
      "  Thầy   Hoan ",
      "a\tb",
      "👍".repeat(30),
      "Coach 🏋️",
    ]) {
      const value = aliasValueSchema.parse(typed);

      expect(await sqlState(insert("user", value)), typed).toBeUndefined();
      await clear();
    }
  });

  it("refuses blank, padded, multi-space, other whitespace and control characters", async () => {
    for (const value of [
      " ",
      "   ",
      "\u3000",
      " Na",
      "Na ",
      "Bé  Na",
      "Bé\tNa",
      "Bé\nNa",
      "Bé\u00a0Na",
      "Na\u0001",
      "Na\u007f",
      "a".repeat(31),
    ]) {
      expect(await sqlState(insert("user", value)), JSON.stringify(value)).toBe(
        "23514",
      );
    }
  });

  it("repairs existing rows on the way up and deletes the blank ones", async () => {
    const migration = new ChatNicknameValue1796000000000();

    await migration.down(db.dataSource.createQueryRunner());
    // The old length-only rule let these in.
    await insert("user", "   ");
    await insert("pt", "  Thầy   Hoan ");
    await insert(adminTarget, "Sếp\t\u00a0lớn\u0001");
    await migration.up(db.dataSource.createQueryRunner());

    expect(
      await query(
        `SELECT target_key AS "targetKey", nickname FROM chat_nicknames
         WHERE conversation_id = $1 ORDER BY target_key`,
        [conversationId],
      ),
    ).toEqual([
      { targetKey: adminTarget, nickname: "Sếp lớn" },
      { targetKey: "pt", nickname: "Thầy Hoan" },
    ]);
    expect(await sqlState(insert("user", "   "))).toBe("23514");
  });
});
