import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  chatColorOverrides,
  chatConversations,
  chatMessages,
  chatNicknames,
  chatReads,
  pushSubscriptions,
  users,
} from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/services/session", () => ({
  readSession: vi.fn(async () => ({ role: "admin", adminId: 1 })),
}));
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({ id, username: "pt" })),
}));
vi.mock("@/services/users", () => ({ findUserById: vi.fn() }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { deleteMemberAction } =
  await import("@/features/members/services/member-actions");

let db: TestDb;

const seedTrainee = async (name: string) => {
  const [user] = await db
    .insert(users)
    .values({ name, nameKey: name.toLowerCase() })
    .returning({ id: users.id });
  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId: user.id })
    .returning({ id: chatConversations.id });

  await db.insert(chatMessages).values([
    {
      conversationId: conversation.id,
      senderRole: "user",
      body: `${name} hello`,
      clientId: `${name}-1`,
      createdAt: new Date(),
    },
    {
      conversationId: conversation.id,
      senderRole: "admin",
      senderAdminId: 1,
      body: `reply to ${name}`,
      clientId: `${name}-2`,
      createdAt: new Date(),
    },
  ]);
  await db.insert(chatReads).values([
    { conversationId: conversation.id, readerKey: "user" },
    { conversationId: conversation.id, readerKey: "admin:1" },
  ]);
  return { userId: user.id, conversationId: conversation.id };
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
});

describe("deleteMemberAction chat cleanup", () => {
  it("removes the trainee's chat rows and leaves another trainee's intact", async () => {
    const gone = await seedTrainee("An");
    const kept = await seedTrainee("Binh");

    const result = await deleteMemberAction(gone.userId);

    expect(result.status).toBe("success");
    expect(
      await db.select().from(users).where(eq(users.id, gone.userId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.userId, gone.userId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, gone.conversationId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(chatReads)
        .where(eq(chatReads.conversationId, gone.conversationId)),
    ).toHaveLength(0);

    expect(await db.select().from(chatConversations)).toHaveLength(1);
    expect(await db.select().from(chatMessages)).toHaveLength(2);
    expect(await db.select().from(chatReads)).toHaveLength(2);
    expect(
      (await db.select().from(chatMessages)).map((row) => row.conversationId),
    ).toEqual([kept.conversationId, kept.conversationId]);
  });

  it("removes the trainee's nicknames and colour overrides only", async () => {
    const gone = await seedTrainee("An");
    const kept = await seedTrainee("Binh");

    await db.insert(chatNicknames).values(
      [gone, kept].map((member) => ({
        conversationId: member.conversationId,
        targetKey: "pt",
        nickname: "Coach",
        setByKey: "user",
        updatedAt: new Date(),
      })),
    );
    await db.insert(chatColorOverrides).values(
      [gone, kept].map((member) => ({
        conversationId: member.conversationId,
        adminId: 1,
        color: "green",
      })),
    );

    await deleteMemberAction(gone.userId);

    expect(
      (await db.select().from(chatNicknames)).map((r) => r.conversationId),
    ).toEqual([kept.conversationId]);
    expect(
      (await db.select().from(chatColorOverrides)).map((r) => r.conversationId),
    ).toEqual([kept.conversationId]);
  });

  it("removes the trainee's hidden-chat rows for every admin, only theirs", async () => {
    const gone = await seedTrainee("An");
    const kept = await seedTrainee("Binh");

    await db.insert(adminHiddenUsers).values([
      { adminId: 1, userId: gone.userId },
      { adminId: 2, userId: gone.userId },
      { adminId: 1, userId: kept.userId },
    ]);

    await deleteMemberAction(gone.userId);

    expect(
      (await db.select().from(adminHiddenUsers)).map((r) => [
        r.adminId,
        r.userId,
      ]),
    ).toEqual([[1, kept.userId]]);
  });

  it("removes the trainee's push subscriptions only", async () => {
    const gone = await seedTrainee("An");
    const kept = await seedTrainee("Binh");
    const sub = (ownerKey: string, n: number) => ({
      ownerKey,
      endpoint: `https://push.example/${n}`,
      p256dh: "p",
      auth: "a",
    });

    await db
      .insert(pushSubscriptions)
      .values([
        sub(`user:${gone.userId}`, 1),
        sub(`user:${gone.userId}`, 2),
        sub(`user:${kept.userId}`, 3),
        sub("admin:1", 4),
      ]);

    await deleteMemberAction(gone.userId);

    expect(
      (await db.select().from(pushSubscriptions)).map((row) => row.endpoint),
    ).toEqual(["https://push.example/3", "https://push.example/4"]);
  });

  it("deletes a trainee who never opened a conversation", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Chi", nameKey: "chi" })
      .returning({ id: users.id });

    const result = await deleteMemberAction(user.id);

    expect(result.status).toBe("success");
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
