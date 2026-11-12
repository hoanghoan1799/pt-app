import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatConversations,
  chatHiddenConversations,
  chatMessages,
  exerciseCompletions,
  exercises,
  exerciseSets,
  users,
  workoutDays,
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
const dashboard =
  await import("@/features/dashboard/services/dashboard-queries");
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

// One day with one exercise, completed and with a weighted set, for `userId`.
const addActivity = async (userId: number, date = "2026-11-02") => {
  const [day] = await db
    .insert(workoutDays)
    .values({ userId, date })
    .returning({ id: workoutDays.id });
  const [exercise] = await db
    .insert(exercises)
    .values({ dayId: day.id, title: `Squat ${userId}`, youtubeId: "abc" })
    .returning({ id: exercises.id });

  await db.insert(exerciseCompletions).values({
    exerciseId: exercise.id,
    userId,
    completedAt: new Date("2026-11-03T03:00:00Z"),
  });
  await db.insert(exerciseSets).values({
    exerciseId: exercise.id,
    userId,
    position: 0,
    weightKg: 50,
    reps: 5,
  });
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

describe("dashboard member list, totals and recent activity", () => {
  it("leaves a hidden trainee out for the hiding admin only", async () => {
    const an = await addUser("An");
    const binh = await addUser("Binh");

    await addActivity(an);
    await addActivity(binh);
    await hide(A, binh);

    const forA = await dashboard.getMemberProgress("2026-11-02", A);
    const forB = await dashboard.getMemberProgress("2026-11-02", B);

    expect(forA.map((m) => m.id)).toEqual([an]);
    expect(forB.map((m) => m.id)).toEqual([an, binh]);
    // The totals are built from this list, so they drop the trainee too.
    expect(forA.reduce((sum, m) => sum + m.assigned, 0)).toBe(1);
    expect(forB.reduce((sum, m) => sum + m.assigned, 0)).toBe(2);
  });

  it("leaves completions and personal bests of a hidden trainee out of recent activity", async () => {
    const an = await addUser("An");
    const binh = await addUser("Binh");

    await addActivity(an);
    await addActivity(binh);
    await hide(A, binh);

    const names = (items: { userName: string }[]) =>
      [...new Set(items.map((item) => item.userName))].sort();
    const forA = await dashboard.getRecentActivity({ limit: 20, adminId: A });
    const forB = await dashboard.getRecentActivity({ limit: 20, adminId: B });

    expect(names(forA)).toEqual(["An"]);
    expect(names(forB)).toEqual(["An", "Binh"]);
    expect(forA.some((item) => item.kind === "completion")).toBe(true);
    // The per-trainee page asks by userId and is guarded separately.
    expect(
      names(await dashboard.getRecentActivity({ limit: 20, userId: binh })),
    ).toEqual(["Binh"]);
  });
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
