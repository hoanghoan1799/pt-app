import { beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  chatConversations,
  chatNicknames,
  contactAliases,
  users,
} from "@/db/schema";
import { moveChatNicknamesToAliases } from "@/features/contact-aliases/services/legacy-nicknames-migration";

let db: TestDb;
let conversationId: number;
let userId: number;

const legacy = (targetKey: string, setByKey: string, nickname: string) => ({
  conversationId,
  targetKey,
  nickname,
  setByKey,
  updatedAt: new Date(1_700_000_000_000),
});

const aliases = async () =>
  (await db.select().from(contactAliases))
    .map((row) => `${row.ownerKey}>${row.targetKey}=${row.alias}`)
    .sort();

beforeEach(async () => {
  db = await createTestDb();
  const [user] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an" })
    .returning({ id: users.id });
  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId: user.id })
    .returning({ id: chatConversations.id });

  userId = user.id;
  conversationId = conversation.id;
});

describe("moveChatNicknamesToAliases", () => {
  it("copies each shared nickname to the person who set it", async () => {
    await db
      .insert(chatNicknames)
      .values([
        legacy("pt", "user", "Thầy"),
        legacy("user", "admin:2", "Bé Na"),
        legacy("admin:3", "user", "Coach"),
      ]);

    expect(await moveChatNicknamesToAliases(db)).toBe(3);
    expect(await aliases()).toEqual(
      [
        `admin:2>user:${userId}=Bé Na`,
        `user:${userId}>admin:3=Coach`,
        `user:${userId}>pt=Thầy`,
      ].sort(),
    );
  });

  it("drops self-nicknames, meaningless rows and orphans, and empties the legacy table", async () => {
    await db
      .insert(chatNicknames)
      .values([
        legacy("user", "user", "Tự gọi"),
        legacy("pt", "admin:2", "Admin cho PT"),
        legacy("admin:3", "user", "Giữ"),
      ]);
    await db.insert(chatNicknames).values({
      ...legacy("pt", "user", "Mồ côi"),
      conversationId: 9999,
    });

    expect(await moveChatNicknamesToAliases(db)).toBe(1);
    expect(await aliases()).toEqual([`user:${userId}>admin:3=Giữ`]);
    expect(await db.select().from(chatNicknames)).toEqual([]);
  });

  it("keeps the original timestamp", async () => {
    await db.insert(chatNicknames).values(legacy("pt", "user", "Thầy"));
    await moveChatNicknamesToAliases(db);

    const [row] = await db.select().from(contactAliases);

    expect(row.updatedAt.getTime()).toBe(1_700_000_000_000);
  });

  it("is idempotent and never resurrects a cleared alias", async () => {
    await db.insert(chatNicknames).values(legacy("pt", "user", "Thầy"));
    await moveChatNicknamesToAliases(db);
    expect(await moveChatNicknamesToAliases(db)).toBe(0);

    // The owner clears it; a later run (every build runs the script) must not
    // bring it back.
    await db.delete(contactAliases);
    expect(await moveChatNicknamesToAliases(db)).toBe(0);
    expect(await aliases()).toEqual([]);
  });

  it("does not overwrite an alias that already exists", async () => {
    await db.insert(contactAliases).values({
      ownerKey: `user:${userId}`,
      targetKey: "pt",
      alias: "Mới hơn",
      updatedAt: new Date(),
    });
    await db.insert(chatNicknames).values(legacy("pt", "user", "Cũ"));

    expect(await moveChatNicknamesToAliases(db)).toBe(0);
    expect(await aliases()).toEqual([`user:${userId}>pt=Mới hơn`]);
  });

  it("does nothing on an empty table", async () => {
    expect(await moveChatNicknamesToAliases(db)).toBe(0);
  });
});
