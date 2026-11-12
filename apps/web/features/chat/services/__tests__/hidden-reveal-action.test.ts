import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  // What the API's POST /v1/admins/me/hidden-users/reveal answers.
  code: "1234" as string | null,
  refuse: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));
// The API checks the code and opens the reveal window; only that answer is faked.
vi.mock("@/services/api/call", () => ({
  tryApi: vi.fn(
    async (
      _actor: string,
      call: (api: unknown) => Promise<unknown>,
    ): Promise<unknown> => {
      let sent = "";

      await call({
        POST: async (_path: string, init: { body: { passcode: string } }) => {
          sent = init.body.passcode;
          return {};
        },
      });
      return state.refuse
        ? { ok: false, error: { code: "TOO_MANY_REQUESTS" } }
        : {
            ok: true,
            data: { revealed: state.code !== null && sent === state.code },
          };
    },
  ),
}));
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1 })),
}));

const actions = await import("@/features/chat/services/chat-hidden-actions");
const { tryApi } = await import("@/services/api/call");
const { hashPassword } = await import("@/services/password");

let db: TestDb;
let userId: number;

beforeEach(async () => {
  vi.mocked(tryApi).mockClear();
  state.code = "1234";
  state.refuse = false;
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
    // A malformed code never reaches the API (no attempt is burned).
    expect(tryApi).toHaveBeenCalledTimes(1);

    const result = await actions.revealHiddenUsersAction("1234");

    expect(result).toMatchObject({
      status: "success",
      users: [{ userId, userName: "An" }],
    });
    expect(tryApi).toHaveBeenCalledTimes(2);
  });

  it("does not hide or reveal anything without a passcode", async () => {
    await db.update(admins).set({ passcodeHash: null }).where(eq(admins.id, 1));
    state.code = null;

    expect(await actions.hideUsersAction([userId])).toMatchObject({
      status: "error",
    });
    expect(await actions.revealHiddenUsersAction("1234")).toMatchObject({
      status: "error",
    });
  });

  it("treats a refused request (rate limit) as the same quiet miss", async () => {
    await actions.hideUsersAction([userId]);
    state.refuse = true;

    expect(await actions.revealHiddenUsersAction("1234")).toEqual({
      status: "error",
      message: "Không khớp",
    });
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
