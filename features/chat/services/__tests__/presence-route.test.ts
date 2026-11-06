import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number },
  admin: null as null | { id: number },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/services/users", async () => {
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

const route = await import("@/app/api/presence/route");
const peerRoute = await import("@/app/api/presence/peer/route");
const service = await import("@/features/chat/services/presence");

let db: TestDb;
let userId: number;
let adminId: number;

const post = (query = "") =>
  route.POST(
    new NextRequest(`http://localhost/api/presence${query}`, {
      method: "POST",
    }),
  );
const getPeer = (query = "") =>
  peerRoute.GET(new NextRequest(`http://localhost/api/presence/peer${query}`));

const userSeen = async () =>
  (await db.select().from(users).where(eq(users.id, userId)))[0].lastSeenAt;
const adminSeen = async () =>
  (await db.select().from(admins).where(eq(admins.id, adminId)))[0].lastSeenAt;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  [{ id: userId }] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an" })
    .returning({ id: users.id });
  [{ id: adminId }] = await db
    .insert(admins)
    .values({ username: "pt", usernameKey: "pt", passwordHash: "x" })
    .returning({ id: admins.id });
  state.user = { id: userId };
  state.admin = { id: adminId };
});

describe("POST /api/presence", () => {
  it("answers 401 without a trainee session", async () => {
    state.user = null;
    const response = await post();

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await userSeen()).toBeNull();
  });

  it("answers 401 without an admin session", async () => {
    state.admin = null;

    expect((await post("?as=admin")).status).toBe(401);
    expect(await adminSeen()).toBeNull();
  });

  it("stamps the trainee with a 204 and no-store", async () => {
    const response = await post();

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await userSeen()).toBeInstanceOf(Date);
    expect(await adminSeen()).toBeNull();
  });

  it("stamps the admin, not the trainee, with ?as=admin", async () => {
    expect((await post("?as=admin")).status).toBe(204);
    expect(await adminSeen()).toBeInstanceOf(Date);
    expect(await userSeen()).toBeNull();
  });
});

describe("heartbeat throttle", () => {
  const T0 = new Date("2026-11-05T03:00:00Z");

  it("skips writes younger than 60 s and writes at 60 s", async () => {
    await service.touchUserPresence(userId, T0);
    await service.touchUserPresence(userId, new Date(T0.getTime() + 59_000));
    expect(await userSeen()).toEqual(T0);

    const later = new Date(T0.getTime() + 60_000);

    await service.touchUserPresence(userId, later);
    expect(await userSeen()).toEqual(later);
  });

  it("throttles admins the same way", async () => {
    await service.touchAdminPresence(adminId, T0);
    await service.touchAdminPresence(adminId, new Date(T0.getTime() + 30_000));
    expect(await adminSeen()).toEqual(T0);
  });
});

describe("GET /api/presence/peer", () => {
  it("answers 401 without a session", async () => {
    state.user = null;
    expect((await getPeer()).status).toBe(401);
    state.admin = null;
    expect((await getPeer("?as=admin&userId=1")).status).toBe(401);
  });

  it("gives the trainee the newest admin last-seen, or null", async () => {
    const empty = await getPeer();

    expect(empty.headers.get("Cache-Control")).toBe("no-store");
    expect(await empty.json()).toEqual({
      peerLastSeenAt: null,
      serverNow: expect.any(String),
    });

    const [second] = await db
      .insert(admins)
      .values({ username: "pt2", usernameKey: "pt2", passwordHash: "x" })
      .returning({ id: admins.id });

    await db
      .update(admins)
      .set({ lastSeenAt: new Date("2026-11-05T01:00:00Z") })
      .where(eq(admins.id, adminId));
    await db
      .update(admins)
      .set({ lastSeenAt: new Date("2026-11-05T02:00:00Z") })
      .where(eq(admins.id, second.id));

    expect(await (await getPeer()).json()).toEqual({
      peerLastSeenAt: "2026-11-05T02:00:00.000Z",
      serverNow: expect.any(String),
    });
  });

  it("gives the admin a trainee's last-seen", async () => {
    await db
      .update(users)
      .set({ lastSeenAt: new Date("2026-11-05T02:30:00Z") })
      .where(eq(users.id, userId));

    expect(await (await getPeer(`?as=admin&userId=${userId}`)).json()).toEqual({
      peerLastSeenAt: "2026-11-05T02:30:00.000Z",
      serverNow: expect.any(String),
    });
  });

  it("validates the admin query and 404s unknown users", async () => {
    expect((await getPeer("?as=admin")).status).toBe(400);
    expect((await getPeer("?as=admin&userId=abc")).status).toBe(400);
    expect((await getPeer("?as=admin&userId=-1")).status).toBe(400);
    expect((await getPeer("?as=admin&userId=9999")).status).toBe(404);
  });
});
