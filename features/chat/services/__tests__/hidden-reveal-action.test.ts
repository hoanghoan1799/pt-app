import { eq } from "drizzle-orm";
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
vi.mock("@/services/admin-lock", () => ({
  issueReveal: vi.fn(async () => undefined),
}));
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1 })),
}));

const actions = await import("@/features/chat/services/chat-hidden-actions");
const { issueReveal } = await import("@/services/admin-lock");
const { hashPassword } = await import("@/services/password");

let db: TestDb;
let userId: number;

beforeEach(async () => {
  vi.mocked(issueReveal).mockClear();
  db = await createTestDb();
  state.db = db;
  await db.insert(admins).values({
    username: "pt",
    usernameKey: "pt",
    passwordHash: "x",
    passcodeHash: await hashPassword("1234"),
  });
  [{ id: userId }] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an" })
    .returning({ id: users.id });
});

describe("revealHiddenUsersAction", () => {
  it("starts the reveal session only on the right code", async () => {
    await actions.hideUsersAction([userId]);

    expect(await actions.revealHiddenUsersAction("0000")).toEqual({
      status: "error",
      message: "Không khớp",
    });
    expect(await actions.revealHiddenUsersAction("12")).toMatchObject({
      status: "error",
    });
    expect(issueReveal).not.toHaveBeenCalled();

    const result = await actions.revealHiddenUsersAction("1234");

    expect(result).toMatchObject({
      status: "success",
      users: [{ userId, userName: "An" }],
    });
    expect(issueReveal).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not hide or reveal anything without a passcode", async () => {
    await db.update(admins).set({ passcodeHash: null }).where(eq(admins.id, 1));

    expect(await actions.hideUsersAction([userId])).toMatchObject({
      status: "error",
    });
    expect(await actions.revealHiddenUsersAction("1234")).toMatchObject({
      status: "error",
    });
    expect(issueReveal).not.toHaveBeenCalled();
  });

  it("rejects malformed ids", async () => {
    expect(await actions.hideUsersAction([])).toMatchObject({
      status: "error",
    });
    expect(await actions.unhideUserAction(-1)).toMatchObject({
      status: "error",
    });
  });
});
