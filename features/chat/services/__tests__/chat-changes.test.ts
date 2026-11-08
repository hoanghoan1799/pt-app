import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { chatConversations, chatMessages, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number; chatEnabled: boolean | null },
  admin: null as null | { id: number },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  publishMessageUpdate: vi.fn(async () => undefined),
}));
vi.mock("@/features/chat/services/chat-push", () => ({
  scheduleReactionPush: vi.fn(),
}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/services/users", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const { users: usersTable } = await import("@/db/schema");

  return {
    findUserById: vi.fn(async (id: number) => {
      const [row] = await (state.db as TestDb)
        .select()
        .from(usersTable)
        .where(equals(usersTable.id, id));

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
const mutations = await import("@/features/chat/services/chat-mutations");
const messagesRoute = await import("@/app/api/chat/messages/route");
const adminRoute =
  await import("@/app/api/admin/chat/[conversationId]/messages/route");
const editsRoute =
  await import("@/app/api/chat/messages/[messageId]/edits/route");
const adminEditsRoute =
  await import("@/app/api/admin/chat/[conversationId]/messages/[messageId]/edits/route");

let db: TestDb;
let userId: number;
let conversationId: number;
let firstId: number;
let lastId: number;

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const get = (path: string) => new NextRequest(`http://localhost${path}`);
const adminParams = (id: string) => ({
  params: Promise.resolve({ conversationId: id }),
});
const traineeActor = () => ({ role: "user", userId, name: "An" }) as const;
const conversationRef = () => ({ id: conversationId, userId });
const ids = (list: { id: number }[]) => list.map((message) => message.id);

const fetchThread = async (query: string) => {
  const response = await messagesRoute.GET(get(`/api/chat/messages?${query}`));

  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
};

const reactToLast = async (emoji: string | null = "❤️") =>
  mutations.reactToMessage(traineeActor(), conversationRef(), {
    messageId: lastId,
    emoji,
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
  conversationId = (await q.getOrCreateConversation(userId)).id;
  firstId = (
    await q.insertMessage({
      conversationId,
      senderRole: "user",
      senderAdminId: null,
      body: "một",
      clientId: uuid(1),
    })
  ).id;
  lastId = (
    await q.insertMessage({
      conversationId,
      senderRole: "admin",
      senderAdminId: 1,
      body: "hai",
      clientId: uuid(2),
    })
  ).id;
});

describe("change cursor on GET /api/chat/messages", () => {
  it("reports no changes and cursor 0 before any mutation", async () => {
    const { body } = await fetchThread("changedSince=0");

    expect(body.changes).toEqual([]);
    expect(body.lastChangeAt).toBe(0);
    expect(ids(body.messages)).toEqual([firstId, lastId]);
  });

  it("returns reacted, edited and unsent messages in changes, and only those", async () => {
    await reactToLast();
    await mutations.editChatMessage(traineeActor(), conversationRef(), {
      messageId: firstId,
      body: "một (sửa)",
    });
    const { body } = await fetchThread("changedSince=0");

    expect(ids(body.changes).sort()).toEqual([firstId, lastId].sort());
    const reacted = body.changes.find(
      (message: { id: number }) => message.id === lastId,
    );
    const edited = body.changes.find(
      (message: { id: number }) => message.id === firstId,
    );

    expect(reacted.reactions).toEqual([
      { emoji: "❤️", reactorKey: "user", reactorName: "An" },
    ]);
    expect(edited.body).toBe("một (sửa)");
    expect(edited.editedAt).toEqual(expect.any(String));
    expect(body.lastChangeAt).toBeGreaterThan(0);

    await mutations.unsendChatMessage(traineeActor(), conversationRef(), {
      messageId: firstId,
    });
    const afterUnsend = await fetchThread("changedSince=0");
    const unsent = afterUnsend.body.changes.find(
      (message: { id: number }) => message.id === firstId,
    );

    expect(unsent).toMatchObject({ body: "", deleted: true });
  });

  it("returns only what changed after the cursor the client holds", async () => {
    await reactToLast();
    const first = (await fetchThread("changedSince=0")).body;

    await mutations.reactToMessage(
      { role: "admin", adminId: 1, name: "pt1", adminRole: "super_admin" },
      conversationRef(),
      { messageId: firstId, emoji: "👍" },
    );
    const next = (await fetchThread(`changedSince=${first.lastChangeAt}`)).body;

    expect(ids(next.changes)).toEqual([firstId]);
    expect(next.lastChangeAt).toBeGreaterThan(first.lastChangeAt);
  });

  it("answers 204 only when changedSince is sent and not older than the last change", async () => {
    await reactToLast();
    const { body } = await fetchThread("changedSince=0");
    const known = `after=${lastId}&readUpTo=0&enabled=1`;
    const current = await fetchThread(
      `${known}&changedSince=${body.lastChangeAt}`,
    );
    const stale = await fetchThread(
      `${known}&changedSince=${body.lastChangeAt - 1}`,
    );

    expect(current.status).toBe(204);
    expect(stale.status).toBe(200);
    expect(ids(stale.body.changes)).toEqual([lastId]);
  });

  it("keeps today's 204 for a client that sends no changedSince, or a malformed one", async () => {
    await reactToLast();
    const known = `after=${lastId}&readUpTo=0&enabled=1`;

    expect((await fetchThread(known)).status).toBe(204);
    expect((await fetchThread(`${known}&changedSince=abc`)).status).toBe(204);
    expect((await fetchThread(`${known}&changedSince=-5`)).status).toBe(204);
  });

  it("still answers 200 for a new message even when changedSince is current", async () => {
    const known = `after=${firstId}&readUpTo=0&enabled=1&changedSince=0`;
    const { status, body } = await fetchThread(known);

    expect(status).toBe(200);
    expect(ids(body.messages)).toEqual([lastId]);
  });

  it("pages through more than 200 changes without losing any", async () => {
    const base = 1_000_000;
    const rows = Array.from({ length: 205 }, (_, i) => ({
      conversationId,
      senderRole: "user" as const,
      body: `m${i}`,
      clientId: uuid(100 + i),
      createdAt: new Date(base + i),
      updatedAt: new Date(base + 10 + i),
    }));

    await db.insert(chatMessages).values(rows);
    await db
      .update(chatConversations)
      .set({ lastChangeAt: new Date(base + 10 + 204) })
      .where(eq(chatConversations.id, conversationId));

    const page1 = (await fetchThread("changedSince=0")).body;

    expect(page1.changes).toHaveLength(200);
    expect(page1.lastChangeAt).toBe(base + 10 + 199);
    const page2 = (await fetchThread(`changedSince=${page1.lastChangeAt}`))
      .body;

    expect(page2.changes).toHaveLength(5);
    expect(page2.lastChangeAt).toBe(base + 10 + 204);
  });
});

describe("change cursor on the admin thread route", () => {
  it("returns changes and the cursor for any conversation", async () => {
    await reactToLast();
    const response = await adminRoute.GET(
      get(`/api/admin/chat/${conversationId}/messages?changedSince=0`),
      adminParams(String(conversationId)),
    );
    const body = await response.json();

    expect(ids(body.changes)).toEqual([lastId]);
    expect(body.lastChangeAt).toBeGreaterThan(0);
  });

  it("returns no changes when changedSince is not sent", async () => {
    await reactToLast();
    const response = await adminRoute.GET(
      get(`/api/admin/chat/${conversationId}/messages`),
      adminParams(String(conversationId)),
    );
    const body = await response.json();

    expect(body.changes).toEqual([]);
    expect(body.lastChangeAt).toBeGreaterThan(0);
  });
});

describe("edit history routes", () => {
  beforeEach(async () => {
    await mutations.editChatMessage(traineeActor(), conversationRef(), {
      messageId: firstId,
      body: "một (sửa)",
    });
  });

  const traineeGet = (id: string) =>
    editsRoute.GET(get("/x"), { params: Promise.resolve({ messageId: id }) });

  it("gives the trainee the previous bodies", async () => {
    const response = await traineeGet(String(firstId));

    expect(response.status).toBe(200);
    expect((await response.json()).edits).toEqual([
      { previousBody: "một", editedAt: expect.any(String) },
    ]);
  });

  it("gives an admin the same history", async () => {
    const response = await adminEditsRoute.GET(get("/x"), {
      params: Promise.resolve({
        conversationId: String(conversationId),
        messageId: String(firstId),
      }),
    });

    expect((await response.json()).edits).toEqual([
      { previousBody: "một", editedAt: expect.any(String) },
    ]);
  });

  it("answers 400 for a bad id and 404 for unknown or foreign messages", async () => {
    const [other] = await db
      .insert(users)
      .values({ name: "Binh", nameKey: "binh", chatEnabled: true })
      .returning({ id: users.id });
    const foreignConversation = await q.getOrCreateConversation(other.id);
    const foreign = await q.insertMessage({
      conversationId: foreignConversation.id,
      senderRole: "user",
      senderAdminId: null,
      body: "riêng",
      clientId: uuid(77),
    });

    expect((await traineeGet("abc")).status).toBe(400);
    expect((await traineeGet("99999")).status).toBe(404);
    expect((await traineeGet(String(foreign.id))).status).toBe(404);
    const adminWrongConversation = await adminEditsRoute.GET(get("/x"), {
      params: Promise.resolve({
        conversationId: String(foreignConversation.id),
        messageId: String(firstId),
      }),
    });

    expect(adminWrongConversation.status).toBe(404);
  });

  it("answers 401 without a session", async () => {
    state.user = null;
    state.admin = null;

    expect((await traineeGet(String(firstId))).status).toBe(401);
    const adminResponse = await adminEditsRoute.GET(get("/x"), {
      params: Promise.resolve({
        conversationId: String(conversationId),
        messageId: String(firstId),
      }),
    });

    expect(adminResponse.status).toBe(401);
  });

  it("returns an empty history once the message is unsent", async () => {
    await mutations.unsendChatMessage(traineeActor(), conversationRef(), {
      messageId: firstId,
    });
    const response = await traineeGet(String(firstId));

    expect((await response.json()).edits).toEqual([]);
  });
});
