import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, chatConversations, chatNicknames, users } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { getMemberProgress } =
  await import("@/features/dashboard/services/dashboard-queries");

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  await db
    .insert(admins)
    .values({ username: "pt", usernameKey: "pt", passwordHash: "x" });
});

describe("getMemberProgress names and avatars", () => {
  it("carries the nickname and the avatar URL, else real name and none", async () => {
    const [binh, an] = await db
      .insert(users)
      .values([
        {
          name: "Binh",
          nameKey: "binh",
          avatarUpdatedAt: new Date(1_700_000_000_000),
        },
        { name: "An", nameKey: "an" },
      ])
      .returning({ id: users.id });
    const [conversation] = await db
      .insert(chatConversations)
      .values({ userId: binh.id })
      .returning({ id: chatConversations.id });

    await db.insert(chatNicknames).values({
      conversationId: conversation.id,
      targetKey: "user",
      nickname: "Bé Bình",
      setByKey: "admin:1",
      updatedAt: new Date(),
    });

    const members = await getMemberProgress("2026-10-05", 1);

    expect(members.map((m) => [m.id, m.name, m.displayName])).toEqual([
      [an.id, "An", "An"],
      [binh.id, "Binh", "Bé Bình"],
    ]);
    expect(members[0].avatarUrl).toBeNull();
    expect(members[1].avatarUrl).toContain(`/api/avatar/user/${binh.id}`);
  });
});
