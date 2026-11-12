import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { adminHiddenUsers, admins, users } from "@/db/schema";
import { ApiError } from "@/services/api/errors";

const state = vi.hoisted(() => ({
  db: null as unknown,
  // What the API's POST /v1/admins/me/hidden-users/reveal answers.
  code: "1234" as string | null,
  refuse: false,
  // POST/DELETE /v1/admins/me/hidden-users sent by the actions.
  hasPasscode: true,
  sent: [] as { method: string; path: string; init: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));
// The API checks the code and opens the reveal window, and hides/unhides
// trainees; only those answers are faked.
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
  callApi: vi.fn(
    async (_actor: string, call: (api: unknown) => Promise<unknown>) => {
      const record =
        (method: string) => async (path: string, init: unknown) => {
          state.sent.push({ method, path, init });
          if (method === "POST" && !state.hasPasscode) {
            throw new ApiError({
              status: 400,
              code: "PASSCODE_REQUIRED",
              message: "Hãy đặt mã khoá trước khi ẩn học viên.",
            });
          }
          return { data: { hidden: 1 }, response: { ok: true, status: 200 } };
        };
      const result = (await call({
        POST: record("POST"),
        DELETE: record("DELETE"),
      })) as { data: unknown };

      return result.data;
    },
  ),
}));
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1 })),
}));

const actions = await import("@/features/chat/services/chat-hidden-actions");
const { tryApi } = await import("@/services/api/call");

let db: TestDb;
let userId: number;

beforeEach(async () => {
  vi.mocked(tryApi).mockClear();
  state.code = "1234";
  state.refuse = false;
  state.hasPasscode = true;
  state.sent = [];
  db = await createTestDb();
  state.db = db;
  await db.insert(admins).values({
    username: "pt",
    usernameKey: "pt",
    passwordHash: "x",
  });
  [{ id: userId }] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an" })
    .returning({ id: users.id });
  // The hidden list still comes from the legacy tables until the chat inbox
  // moves to the API.
  await db.insert(adminHiddenUsers).values({ adminId: 1, userId });
});

describe("hideUsersAction / unhideUserAction", () => {
  it("hides through the API and reports how many were hidden", async () => {
    expect(await actions.hideUsersAction([userId])).toEqual({
      status: "success",
      hidden: 1,
    });
    expect(state.sent).toMatchObject([
      {
        method: "POST",
        path: "/v1/admins/me/hidden-users",
        init: { body: { userIds: [userId] } },
      },
    ]);
  });

  it("unhides through the API", async () => {
    expect(await actions.unhideUserAction(userId)).toEqual({
      status: "success",
    });
    expect(state.sent).toMatchObject([
      {
        method: "DELETE",
        path: "/v1/admins/me/hidden-users/{userId}",
        init: { params: { path: { userId } } },
      },
    ]);
  });

  it("shows the API's message when there is no passcode", async () => {
    state.hasPasscode = false;

    expect(await actions.hideUsersAction([userId])).toMatchObject({
      status: "error",
      message: "Hãy đặt mã khoá trước khi ẩn học viên.",
    });
  });

  it("rejects malformed ids without calling the API", async () => {
    expect(await actions.hideUsersAction([])).toMatchObject({
      status: "error",
    });
    expect(await actions.unhideUserAction(-1)).toMatchObject({
      status: "error",
    });
    expect(state.sent).toEqual([]);
  });
});

describe("revealHiddenUsersAction", () => {
  it("starts the reveal session only on the right code", async () => {
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

  it("reveals nothing without a passcode", async () => {
    state.code = null;

    expect(await actions.revealHiddenUsersAction("1234")).toMatchObject({
      status: "error",
    });
  });

  it("treats a refused request (rate limit) as the same quiet miss", async () => {
    state.refuse = true;

    expect(await actions.revealHiddenUsersAction("1234")).toEqual({
      status: "error",
      message: "Không khớp",
    });
  });
});
