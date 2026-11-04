import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  configured: true,
  user: null as null | { id: number; chatEnabled: boolean | null },
  admin: null as null | { id: number },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  isRealtimeConfigured: () => state.configured,
  createChatTokenRequest: vi.fn(async (input: unknown) => ({ signed: input })),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const route = await import("@/app/api/chat/ably-token/route");
const q = await import("@/features/chat/services/chat-queries");

let userId: number;

const get = (path = "") =>
  route.GET(new NextRequest(`http://localhost/api/chat/ably-token${path}`));

beforeEach(async () => {
  const db: TestDb = await createTestDb();

  state.db = db;
  state.configured = true;
  const [row] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an", chatEnabled: true })
    .returning({ id: users.id });

  userId = row.id;
  state.user = { id: userId, chatEnabled: true };
  state.admin = null;
});

describe("GET /api/chat/ably-token", () => {
  it("returns 204 when Ably is not configured", async () => {
    state.configured = false;
    const response = await get();

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 401 without a session", async () => {
    state.user = null;
    const response = await get();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 403 for a locked trainee", async () => {
    state.user = { id: userId, chatEnabled: false };
    const response = await get();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "chat_locked" });
  });

  it("signs a subscribe-only capability for the trainee's own conversation", async () => {
    const response = await get();
    const conversation = await q.findConversationByUserId(userId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signed: {
        clientId: `user:${userId}`,
        capability: {
          [`chat:conversation:${conversation!.id}`]: ["subscribe"],
          [`chat:user:${userId}`]: ["subscribe"],
        },
      },
    });
  });

  it("signs the admin capability for ?as=admin", async () => {
    state.admin = { id: 7 };
    const response = await get("?as=admin");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signed: {
        clientId: "admin:7",
        capability: {
          "chat:conversation:*": ["subscribe"],
          "chat:inbox": ["subscribe"],
        },
      },
    });
  });

  it("returns 401 for ?as=admin without an admin session", async () => {
    const response = await get("?as=admin");

    expect(response.status).toBe(401);
  });
});
