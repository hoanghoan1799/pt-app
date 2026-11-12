import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, contactAliases, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number; chatEnabled: boolean | null },
  admin: null as null | { id: number },
  blocked: new Set<number>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/services/hidden-users", () => ({
  canAdminAccessUser: vi.fn(
    async (_adminId: number, userId: number) => !state.blocked.has(userId),
  ),
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
const route = await import("@/app/api/chat/bubbles/route");

let db: TestDb;
let userId: number;
let adminId: number;

const get = (path: string) => new NextRequest(`http://localhost${path}`);
const addTrainee = async (name: string, chatEnabled: boolean | null) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name.toLowerCase(), chatEnabled })
    .returning({ id: users.id });

  if (chatEnabled) {
    await q.getOrCreateConversation(row.id);
  }
  return row.id;
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.blocked = new Set();
  const [admin] = await db
    .insert(admins)
    .values({ username: "pt", usernameKey: "pt", passwordHash: "x" })
    .returning({ id: admins.id });

  adminId = admin.id;
  userId = await addTrainee("An", true);
  state.user = { id: userId, chatEnabled: true };
  state.admin = { id: adminId };
});

describe("GET /api/chat/bubbles (trainee)", () => {
  it("answers 401 without a session", async () => {
    state.user = null;
    const response = await route.GET(get("/api/chat/bubbles"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns only the own coach chat, named after the PT who wrote last", async () => {
    const conversation = await q.getOrCreateConversation(userId);

    await q.insertMessage({
      conversationId: conversation.id,
      senderRole: "admin",
      senderAdminId: adminId,
      body: "chào",
      clientId: "00000000-0000-4000-8000-000000000001",
    });
    const body = await (await route.GET(get("/api/chat/bubbles"))).json();

    expect(body.bubbles).toEqual([
      {
        key: "coach",
        userId,
        name: "pt",
        avatarSrc: null,
        lastSeenAt: null,
        href: "/messages/coach",
        embedHref: "/messages/coach?embed=1",
      },
    ]);
  });

  it("uses the trainee's private nickname for the PT", async () => {
    const conversation = await q.getOrCreateConversation(userId);

    await q.insertMessage({
      conversationId: conversation.id,
      senderRole: "admin",
      senderAdminId: adminId,
      body: "chào",
      clientId: "00000000-0000-4000-8000-000000000001",
    });
    await db.insert(contactAliases).values({
      ownerKey: `user:${userId}`,
      targetKey: "pt",
      alias: "Thầy Hoan",
      updatedAt: new Date(),
    });
    const body = await (await route.GET(get("/api/chat/bubbles"))).json();

    expect(body.bubbles[0].name).toBe("Thầy Hoan");
  });

  it("returns the newest last-seen of the PTs that show their status", async () => {
    await db
      .update(admins)
      .set({ lastSeenAt: new Date("2026-01-01T10:00:00Z") })
      .where(eq(admins.id, adminId));
    await db.insert(admins).values({
      username: "pt2",
      usernameKey: "pt2",
      passwordHash: "x",
      lastSeenAt: new Date("2026-01-01T10:05:00Z"),
    });
    await db.insert(admins).values({
      username: "pt3",
      usernameKey: "pt3",
      passwordHash: "x",
      lastSeenAt: new Date("2026-01-01T11:00:00Z"),
      presenceHidden: true,
    });
    const body = await (await route.GET(get("/api/chat/bubbles"))).json();

    expect(body.bubbles[0].lastSeenAt).toBe("2026-01-01T10:05:00.000Z");
  });

  it("gives null last-seen when every PT hides their status", async () => {
    await db
      .update(admins)
      .set({
        lastSeenAt: new Date("2026-01-01T10:00:00Z"),
        presenceHidden: true,
      })
      .where(eq(admins.id, adminId));
    const body = await (await route.GET(get("/api/chat/bubbles"))).json();

    expect(body.bubbles[0].lastSeenAt).toBeNull();
  });

  it("ignores ids and the admin switch, and gives nothing when chat is off", async () => {
    const other = await addTrainee("Binh", true);
    const withIds = await (
      await route.GET(get(`/api/chat/bubbles?ids=${other}`))
    ).json();

    expect(withIds.bubbles.map((b: { userId: number }) => b.userId)).toEqual([
      userId,
    ]);
    state.user = { id: userId, chatEnabled: false };
    const off = await (await route.GET(get("/api/chat/bubbles"))).json();

    expect(off.bubbles).toEqual([]);
  });
});

describe("GET /api/chat/bubbles?as=admin", () => {
  it("answers 401 without an admin session", async () => {
    state.admin = null;
    const response = await route.GET(get("/api/chat/bubbles?as=admin&ids=1"));

    expect(response.status).toBe(401);
  });

  it("returns the alias name and links per allowed trainee", async () => {
    await db.insert(contactAliases).values({
      ownerKey: `admin:${adminId}`,
      targetKey: `user:${userId}`,
      alias: "Bé An",
      updatedAt: new Date(),
    });
    const body = await (
      await route.GET(get(`/api/chat/bubbles?as=admin&ids=${userId}`))
    ).json();

    expect(body.bubbles).toEqual([
      {
        key: `user:${userId}`,
        userId,
        name: "Bé An",
        avatarSrc: null,
        lastSeenAt: null,
        href: `/admin/users/${userId}/messages`,
        embedHref: `/admin/users/${userId}/messages?embed=1`,
      },
    ]);
  });

  it("returns the trainee's last-seen as an ISO string", async () => {
    await db
      .update(users)
      .set({ lastSeenAt: new Date("2026-01-01T09:30:00Z") })
      .where(eq(users.id, userId));
    const body = await (
      await route.GET(get(`/api/chat/bubbles?as=admin&ids=${userId}`))
    ).json();

    expect(body.bubbles[0].lastSeenAt).toBe("2026-01-01T09:30:00.000Z");
  });

  it("leaves out hidden or out-of-scope, unknown and chat-off trainees", async () => {
    const hidden = await addTrainee("Binh", true);
    const locked = await addTrainee("Chi", false);

    state.blocked.add(hidden);
    const body = await (
      await route.GET(
        get(
          `/api/chat/bubbles?as=admin&ids=${userId},${hidden},${locked},9999,x`,
        ),
      )
    ).json();

    expect(body.bubbles.map((b: { userId: number }) => b.userId)).toEqual([
      userId,
    ]);
  });

  it("answers an empty list without ids", async () => {
    const body = await (
      await route.GET(get("/api/chat/bubbles?as=admin"))
    ).json();

    expect(body).toEqual({ bubbles: [] });
  });
});
