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
vi.mock("@/services/admin-lock", () => ({
  issueUnlock: vi.fn(async () => undefined),
}));
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

const peerRoute = await import("@/app/api/presence/peer/route");
const service = await import("@/features/chat/services/presence");

const SEEN_EARLY = new Date("2026-11-05T01:00:00Z");
const SEEN_LATE = new Date("2026-11-05T02:00:00Z");

let db: TestDb;
let userId: number;
let firstId: number;
let secondId: number;

const addAdmin = async (name: string, lastSeenAt: Date) => {
  const [row] = await db
    .insert(admins)
    .values({
      username: name,
      usernameKey: name,
      passwordHash: "x",
      lastSeenAt,
    })
    .returning({ id: admins.id });

  return row.id;
};

const hiddenOf = async (id: number) =>
  (await db.select().from(admins).where(eq(admins.id, id)))[0].presenceHidden;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  [{ id: userId }] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an" })
    .returning({ id: users.id });
  firstId = await addAdmin("pt1", SEEN_EARLY);
  secondId = await addAdmin("pt2", SEEN_LATE);
  state.user = { id: userId };
  state.admin = { id: firstId };
});

describe("getAdminTeamLastSeen with hidden presence", () => {
  it("shows every admin by default", async () => {
    expect(await hiddenOf(firstId)).toBe(false);
    expect(await service.getAdminTeamLastSeen()).toEqual(SEEN_LATE);
  });

  it("leaves a hidden admin out of the aggregate", async () => {
    await service.setAdminPresenceHidden(secondId, true);

    expect(await service.getAdminTeamLastSeen()).toEqual(SEEN_EARLY);
  });

  it("is null when every admin is hidden", async () => {
    await service.setAdminPresenceHidden(firstId, true);
    await service.setAdminPresenceHidden(secondId, true);

    expect(await service.getAdminTeamLastSeen()).toBeNull();
  });

  it("comes back when the admin turns the status on again", async () => {
    await service.setAdminPresenceHidden(secondId, true);
    await service.setAdminPresenceHidden(secondId, false);

    expect(await service.getAdminTeamLastSeen()).toEqual(SEEN_LATE);
  });

  it("does not change what an admin sees of a trainee", async () => {
    await service.setAdminPresenceHidden(firstId, true);
    await db
      .update(users)
      .set({ lastSeenAt: SEEN_LATE })
      .where(eq(users.id, userId));

    expect(await service.getUserLastSeen(userId)).toEqual(SEEN_LATE);
  });
});

describe("GET /api/presence/peer with hidden presence", () => {
  const getPeer = async () =>
    (
      await peerRoute.GET(new NextRequest("http://localhost/api/presence/peer"))
    ).json();

  it("ignores the hidden admin for a trainee", async () => {
    await service.setAdminPresenceHidden(secondId, true);

    expect(await getPeer()).toEqual({
      peerLastSeenAt: SEEN_EARLY.toISOString(),
      serverNow: expect.any(String),
    });
  });

  it("answers null when all admins are hidden", async () => {
    await service.setAdminPresenceHidden(firstId, true);
    await service.setAdminPresenceHidden(secondId, true);

    expect(await getPeer()).toEqual({
      peerLastSeenAt: null,
      serverNow: expect.any(String),
    });
  });
});
