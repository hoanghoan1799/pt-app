import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number; chatEnabled: boolean | null },
  admin: null as null | { id: number },
  publish: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  publishTyping: state.publish,
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const route = await import("@/app/api/chat/typing/route");
const q = await import("@/features/chat/services/chat-queries");

let db: TestDb;
let userId: number;
let conversationId: number;

const post = (path: string, body?: unknown) =>
  route.POST(
    new NextRequest(`http://localhost/api/chat/typing${path}`, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.publish.mockReset();
  const [row] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an", chatEnabled: true })
    .returning({ id: users.id });

  userId = row.id;
  state.user = { id: userId, chatEnabled: true };
  state.admin = { id: 7 };
  conversationId = (await q.getOrCreateConversation(userId)).id;
});

describe("POST /api/chat/typing (trainee)", () => {
  it("answers 401 without a session", async () => {
    state.user = null;
    const response = await post("");

    expect(response.status).toBe(401);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("publishes on the trainee's own conversation only", async () => {
    const response = await post("", { conversationId: 999 });

    expect(response.status).toBe(204);
    expect(state.publish).toHaveBeenCalledExactlyOnceWith(
      conversationId,
      "user",
      `user:${userId}`,
    );
  });

  it("sends nothing when chat is locked", async () => {
    state.user = { id: userId, chatEnabled: false };
    const response = await post("");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "chat_locked" });
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("is a quiet no-op while no conversation exists", async () => {
    const [other] = await db
      .insert(users)
      .values({ name: "Binh", nameKey: "binh", chatEnabled: true })
      .returning({ id: users.id });

    state.user = { id: other.id, chatEnabled: true };
    const response = await post("");

    expect(response.status).toBe(204);
    expect(state.publish).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat/typing?as=admin", () => {
  it("answers 401 without an admin session, even for a trainee", async () => {
    state.admin = null;
    const response = await post("?as=admin", { conversationId });

    expect(response.status).toBe(401);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it.each([{}, { conversationId: "1" }, { conversationId: -1 }, null])(
    "answers 400 for body %j",
    async (body) => {
      const response = await post("?as=admin", body);

      expect(response.status).toBe(400);
      expect(state.publish).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for an unknown conversation", async () => {
    const response = await post("?as=admin", { conversationId: 999 });

    expect(response.status).toBe(404);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("publishes as the admin on the named conversation", async () => {
    const response = await post("?as=admin", { conversationId });

    expect(response.status).toBe(204);
    expect(state.publish).toHaveBeenCalledExactlyOnceWith(
      conversationId,
      "admin",
      "admin:7",
    );
  });

  it("sends nothing when the trainee is locked", async () => {
    await db.update(users).set({ chatEnabled: false });
    const response = await post("?as=admin", { conversationId });

    expect(response.status).toBe(403);
    expect(state.publish).not.toHaveBeenCalled();
  });
});
