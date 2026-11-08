import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, users } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { listAdminAccounts, listWorkspaceTrainees } =
  await import("@/features/pts/services/pt-queries");

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
});

describe("PT trainee counts", () => {
  it("counts each PT's trainees and lists everyone with their PT", async () => {
    const [root, a, b] = await db
      .insert(admins)
      .values([
        { username: "root", usernameKey: "root", passwordHash: "x" },
        { username: "a", usernameKey: "a", passwordHash: "x", role: "pt" },
        { username: "b", usernameKey: "b", passwordHash: "x", role: "pt" },
      ])
      .returning({ id: admins.id });

    await db.insert(users).values([
      { name: "U1", nameKey: "u1", ptAdminId: a.id },
      { name: "U2", nameKey: "u2", ptAdminId: a.id },
      { name: "U3", nameKey: "u3" },
    ]);

    const accounts = await listAdminAccounts();
    const trainees = await listWorkspaceTrainees();

    expect(accounts.map((x) => [x.id, x.traineeCount])).toEqual([
      [root.id, 0],
      [a.id, 2],
      [b.id, 0],
    ]);
    expect(trainees.map((t) => [t.name, t.ptAdminId])).toEqual([
      ["U1", a.id],
      ["U2", a.id],
      ["U3", null],
    ]);
  });
});
