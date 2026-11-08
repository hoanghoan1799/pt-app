import { notInArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatConversations,
  users,
} from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown, revealed: false }));

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

const scope = await import("@/services/admin-scope");
const guard = await import("@/services/hidden-users");

let db: TestDb;
let superId: number;
let legacyId: number;
let ptA: number;
let ptB: number;
let mine: number;
let theirs: number;
let unassigned: number;

const addAdmin = async (name: string, role: "pt" | "super_admin" | null) => {
  const [row] = await db
    .insert(admins)
    .values({ username: name, usernameKey: name, passwordHash: "x", role })
    .returning({ id: admins.id });

  return row.id;
};

const addUser = async (name: string, ptAdminId: number | null) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name, ptAdminId })
    .returning({ id: users.id });

  return row.id;
};

const visibleIds = async (adminId: number) =>
  (
    await db
      .select({ id: users.id })
      .from(users)
      .where(scope.adminScopeFilter(adminId))
  )
    .map((row) => row.id)
    .sort();

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.revealed = false;
  superId = await addAdmin("boss", "super_admin");
  legacyId = await addAdmin("legacy", null);
  ptA = await addAdmin("pta", "pt");
  ptB = await addAdmin("ptb", "pt");
  mine = await addUser("mine", ptA);
  theirs = await addUser("theirs", ptB);
  unassigned = await addUser("free", null);
});

describe("toAdminRole / isSuperAdmin", () => {
  it("treats a null role as super admin and only pt as pt", () => {
    expect(scope.toAdminRole(null)).toBe("super_admin");
    expect(scope.toAdminRole(undefined)).toBe("super_admin");
    expect(scope.toAdminRole("super_admin")).toBe("super_admin");
    expect(scope.toAdminRole("pt")).toBe("pt");
    expect(scope.isSuperAdmin({ role: "pt" })).toBe(false);
    expect(scope.isSuperAdmin({ role: "super_admin" })).toBe(true);
  });
});

describe("adminScopeFilter", () => {
  it("gives a super admin and a legacy null-role admin every trainee", async () => {
    const all = [mine, theirs, unassigned].sort();

    expect(await visibleIds(superId)).toEqual(all);
    expect(await visibleIds(legacyId)).toEqual(all);
  });

  it("gives a PT only the trainees assigned to them", async () => {
    expect(await visibleIds(ptA)).toEqual([mine]);
    expect(await visibleIds(ptB)).toEqual([theirs]);
  });

  it("filters any user-id column, e.g. conversations", async () => {
    await db
      .insert(chatConversations)
      .values([{ userId: mine }, { userId: theirs }]);
    const rows = await db
      .select({ userId: chatConversations.userId })
      .from(chatConversations)
      .where(scope.adminScopeFilter(ptA, chatConversations.userId));

    expect(rows.map((row) => row.userId)).toEqual([mine]);
  });

  it("lists the conversations of out-of-scope trainees", async () => {
    await db
      .insert(chatConversations)
      .values([{ userId: mine }, { userId: theirs }]);
    const ids = await db
      .select()
      .from(chatConversations)
      .where(
        notInArray(
          chatConversations.id,
          scope.outOfScopeConversationIdsOf(ptA),
        ),
      );

    expect(ids.map((row) => row.userId)).toEqual([mine]);
  });
});

describe("canAdminAccessUser", () => {
  it("lets a PT open only their own trainee", async () => {
    expect(await guard.canAdminAccessUser(ptA, mine)).toBe(true);
    expect(await guard.canAdminAccessUser(ptA, theirs)).toBe(false);
    expect(await guard.canAdminAccessUser(ptA, unassigned)).toBe(false);
  });

  it("leaves the super admin unchanged", async () => {
    for (const id of [mine, theirs, unassigned]) {
      expect(await guard.canAdminAccessUser(superId, id)).toBe(true);
      expect(await guard.canAdminAccessUser(legacyId, id)).toBe(true);
    }
  });

  it("still applies hiding on top of the scope", async () => {
    await db.insert(adminHiddenUsers).values({ adminId: ptA, userId: mine });
    expect(await guard.canAdminAccessUser(ptA, mine)).toBe(false);
    state.revealed = true;
    expect(await guard.canAdminAccessUser(ptA, mine)).toBe(true);
    expect(await guard.canAdminAccessUser(ptA, theirs)).toBe(false);
  });

  it("is false for a trainee that does not exist", async () => {
    expect(await guard.canAdminAccessUser(superId, 9999)).toBe(false);
  });
});
