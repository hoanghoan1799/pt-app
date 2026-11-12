import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatConversations,
  chatHiddenConversations,
  chatMessages,
  users,
} from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  adminId: 1,
  revealed: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => state.revealed),
}));
vi.mock("@/services/auth-guard", () => ({
  getApiAdmin: vi.fn(async () => ({ id: state.adminId })),
}));

const guard = await import("@/services/hidden-users");
const messagesRoute =
  await import("@/app/api/admin/chat/[conversationId]/messages/route");
const peerRoute = await import("@/app/api/presence/peer/route");
const migration =
  await import("@/features/chat/services/hidden-users-migration");

let db: TestDb;
const A = 1;
const B = 2;

const addUser = async (name: string) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name.toLowerCase(), chatEnabled: true })
    .returning({ id: users.id });

  return row.id;
};

const hide = (adminId: number, userId: number) =>
  db.insert(adminHiddenUsers).values({ adminId, userId });

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.adminId = A;
  state.revealed = false;
  await db.insert(admins).values([
    { username: "pt-one", usernameKey: "pt-one", passwordHash: "x" },
    { username: "pt-two", usernameKey: "pt-two", passwordHash: "x" },
  ]);
});

describe("canAdminAccessUser", () => {
  it("is false for a hidden trainee until revealed, true for others always", async () => {
    const an = await addUser("An");
    const binh = await addUser("Binh");

    await hide(A, binh);

    expect(await guard.canAdminAccessUser(A, an)).toBe(true);
    expect(await guard.canAdminAccessUser(A, binh)).toBe(false);
    expect(await guard.canAdminAccessUser(B, binh)).toBe(true);

    state.revealed = true;
    expect(await guard.canAdminAccessUser(A, binh)).toBe(true);
  });
});

describe("admin API routes for a hidden trainee", () => {
  let userId: number;
  let conversationId: number;

  const getMessages = () =>
    messagesRoute.GET(
      new NextRequest(
        `http://localhost/api/admin/chat/${conversationId}/messages`,
      ),
      { params: Promise.resolve({ conversationId: String(conversationId) }) },
    );
  const getPeer = () =>
    peerRoute.GET(
      new NextRequest(
        `http://localhost/api/presence/peer?as=admin&userId=${userId}`,
      ),
    );

  beforeEach(async () => {
    userId = await addUser("An");
    [{ id: conversationId }] = await db
      .insert(chatConversations)
      .values({ userId })
      .returning({ id: chatConversations.id });
    await db.insert(chatMessages).values({
      conversationId,
      senderRole: "user",
      body: "hi",
      clientId: "00000000-0000-4000-8000-000000000001",
      createdAt: new Date(),
    });
    await hide(A, userId);
  });

  it("answers 404 to the hiding admin, 200 once revealed, 200 to another admin", async () => {
    expect((await getMessages()).status).toBe(404);
    expect((await getPeer()).status).toBe(404);

    state.revealed = true;
    expect((await getMessages()).status).toBe(200);
    expect((await getPeer()).status).toBe(200);

    state.revealed = false;
    state.adminId = B;
    expect((await getMessages()).status).toBe(200);
    expect((await getPeer()).status).toBe(200);
  });
});

describe("moveHiddenConversationsToUsers", () => {
  const addConversation = async (userId: number) => {
    const [row] = await db
      .insert(chatConversations)
      .values({ userId })
      .returning({ id: chatConversations.id });

    return row.id;
  };

  it("copies legacy rows to the conversation's trainee and removes them", async () => {
    const an = await addUser("An");
    const binh = await addUser("Binh");
    const anChat = await addConversation(an);
    const binhChat = await addConversation(binh);

    await db.insert(chatHiddenConversations).values([
      { adminId: A, conversationId: anChat },
      { adminId: B, conversationId: anChat },
      { adminId: A, conversationId: binhChat },
      // Its conversation is gone: nobody to hide, dropped.
      { adminId: A, conversationId: 9999 },
    ]);

    expect(await migration.moveHiddenConversationsToUsers(db)).toBe(3);

    const rows = await db.select().from(adminHiddenUsers);

    expect(rows.map((r) => [r.adminId, r.userId]).sort()).toEqual([
      [A, an],
      [A, binh],
      [B, an],
    ]);
    expect(await db.select().from(chatHiddenConversations)).toHaveLength(0);
  });

  it("is idempotent and keeps rows that already exist", async () => {
    const an = await addUser("An");
    const anChat = await addConversation(an);

    await hide(A, an);
    await db
      .insert(chatHiddenConversations)
      .values({ adminId: A, conversationId: anChat });

    await migration.moveHiddenConversationsToUsers(db);
    expect(await migration.moveHiddenConversationsToUsers(db)).toBe(0);

    expect(await db.select().from(adminHiddenUsers)).toHaveLength(1);
    expect(await db.select().from(chatHiddenConversations)).toHaveLength(0);
  });
});
