import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number; chatEnabled: boolean | null },
  admin: null as null | { id: number },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/services/users", async () => {
  const { eq } = await import("drizzle-orm");
  const { users: usersTable } = await import("@/db/schema");

  return {
    findUserById: vi.fn(async (id: number) => {
      const [row] = await (state.db as TestDb)
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, id));

      return row ?? null;
    }),
  };
});
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const q = await import("@/features/chat/services/chat-queries");
const messagesRoute = await import("@/app/api/chat/messages/route");
const unreadRoute = await import("@/app/api/chat/unread/route");
const adminRoute =
  await import("@/app/api/admin/chat/[conversationId]/messages/route");

let db: TestDb;
let userId: number;
let conversationId: number;
let lastId: number;

const get = (path: string) => new NextRequest(`http://localhost${path}`);
const adminParams = (id: string) => ({
  params: Promise.resolve({ conversationId: id }),
});

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  const [row] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an", chatEnabled: true })
    .returning({ id: users.id });

  userId = row.id;
  state.user = { id: userId, chatEnabled: true };
  state.admin = { id: 1 };
  const conversation = await q.getOrCreateConversation(userId);

  conversationId = conversation.id;
  await q.insertMessage({
    conversationId,
    senderRole: "user",
    senderAdminId: null,
    body: "một",
    clientId: "00000000-0000-4000-8000-000000000001",
  });
  lastId = (
    await q.insertMessage({
      conversationId,
      senderRole: "admin",
      senderAdminId: 1,
      body: "hai",
      clientId: "00000000-0000-4000-8000-000000000002",
    })
  ).id;
});

describe("GET /api/chat/messages", () => {
  it("answers 401 JSON without a session", async () => {
    state.user = null;
    const response = await messagesRoute.GET(get("/api/chat/messages"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("answers 400 when after and before are both given", async () => {
    const response = await messagesRoute.GET(
      get("/api/chat/messages?after=1&before=2"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
  });

  it("answers 400 for a bad cursor", async () => {
    const response = await messagesRoute.GET(get("/api/chat/messages?after=x"));

    expect(response.status).toBe(400);
  });

  it("returns the latest page with the lock and read state", async () => {
    const response = await messagesRoute.GET(get("/api/chat/messages"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.messages.map((m: { body: string }) => m.body)).toEqual([
      "một",
      "hai",
    ]);
    expect(body).toMatchObject({
      hasMore: false,
      chatEnabled: true,
      peerReadUpTo: 0,
    });
  });

  it("returns an empty payload when there is no conversation", async () => {
    const [other] = await db
      .insert(users)
      .values({ name: "Binh", nameKey: "binh" })
      .returning({ id: users.id });

    state.user = { id: other.id, chatEnabled: null };
    const response = await messagesRoute.GET(get("/api/chat/messages"));

    expect(await response.json()).toEqual({
      messages: [],
      hasMore: false,
      chatEnabled: false,
      peerReadUpTo: 0,
    });
  });

  it("answers 204 when nothing is new and state is unchanged", async () => {
    const response = await messagesRoute.GET(
      get(`/api/chat/messages?after=${lastId}&readUpTo=0&enabled=1`),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("answers 200 when only the lock state changed", async () => {
    state.user = { id: userId, chatEnabled: false };
    const response = await messagesRoute.GET(
      get(`/api/chat/messages?after=${lastId}&readUpTo=0&enabled=1`),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).chatEnabled).toBe(false);
  });

  it("answers 200 when the PT read more since", async () => {
    await q.saveReadCursor(conversationId, "admin:1", lastId, lastId);
    const response = await messagesRoute.GET(
      get(`/api/chat/messages?after=${lastId}&readUpTo=0&enabled=1`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ messages: [], peerReadUpTo: lastId });
  });

  it("answers 200 with the new messages, and without readUpTo/enabled", async () => {
    const withNew = await messagesRoute.GET(
      get(`/api/chat/messages?after=${lastId - 1}&readUpTo=0&enabled=1`),
    );
    const noState = await messagesRoute.GET(
      get(`/api/chat/messages?after=${lastId}`),
    );

    expect(
      (await withNew.json()).messages.map((m: { body: string }) => m.body),
    ).toEqual(["hai"]);
    expect(noState.status).toBe(200);
  });
});

describe("GET /api/chat/unread", () => {
  it("answers 401 without a session", async () => {
    state.user = null;
    const response = await unreadRoute.GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns count, chatEnabled and hasHistory", async () => {
    const response = await unreadRoute.GET();

    expect(await response.json()).toEqual({
      count: 1,
      chatEnabled: true,
      hasHistory: true,
    });
  });
});

describe("GET /api/admin/chat/[conversationId]/messages", () => {
  it("answers 401 without an admin session", async () => {
    state.admin = null;
    const response = await adminRoute.GET(
      get("/api/admin/chat/1/messages"),
      adminParams("1"),
    );

    expect(response.status).toBe(401);
  });

  it.each(["abc", "0", "-2", "1.5"])("answers 400 for id %s", async (id) => {
    const response = await adminRoute.GET(
      get(`/api/admin/chat/${id}/messages`),
      adminParams(id),
    );

    expect(response.status).toBe(400);
  });

  it("answers 400 for both after and before", async () => {
    const response = await adminRoute.GET(
      get("/api/admin/chat/1/messages?after=1&before=2"),
      adminParams("1"),
    );

    expect(response.status).toBe(400);
  });

  it("answers 404 for a missing conversation", async () => {
    const response = await adminRoute.GET(
      get("/api/admin/chat/999/messages"),
      adminParams("999"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("returns messages with the trainee's read cursor", async () => {
    await q.saveReadCursor(conversationId, "user", 1, lastId);
    const response = await adminRoute.GET(
      get(`/api/admin/chat/${conversationId}/messages`),
      adminParams(String(conversationId)),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages.map((m: { body: string }) => m.body)).toEqual([
      "một",
      "hai",
    ]);
    expect(body).toMatchObject({
      hasMore: false,
      peerReadUpTo: 1,
      chatEnabled: true,
      userId,
    });
  });
});
