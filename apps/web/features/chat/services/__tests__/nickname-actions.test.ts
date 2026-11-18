import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({
  fake: null as FakeApi | null,
  signedIn: true,
}));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("@/services/logger", () => ({
  logServerError: vi.fn(() => ({ code: "UNKNOWN" })),
}));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});
vi.mock("@/services/auth-guard", () => {
  const guard = async () => {
    if (!state.signedIn) {
      throw new Error("not signed in");
    }
    return { id: 1 };
  };

  return { requireAdmin: vi.fn(guard), requireUser: vi.fn(guard) };
});

const actions = await import("@/features/chat/services/chat-profile-actions");

const PROFILE = { nicknames: { pt: "Thầy" }, colors: {} };

beforeEach(() => {
  fake().reset();
  fake().respond = () => ({ profile: PROFILE });
  state.signedIn = true;
});

// Who may name whom, the chat lock and the audience are the API's:
// apps/api/test/chat-nicknames.e2e.test.ts. Here: what the browser's actions
// send and give back.
describe("setNicknameAction (trainee)", () => {
  it("sends the cleaned nickname to the trainee's own conversation and returns the profile", async () => {
    const result = await actions.setNicknameAction({
      target: "pt",
      nickname: "  Thầy   Hoàn ",
    });

    expect(result).toEqual({ status: "success", profile: PROFILE });
    expect(fake().calls).toMatchObject([
      {
        actor: "user",
        method: "PUT",
        path: "/v1/chat/conversations/me/nickname",
        init: { body: { target: "pt", nickname: "Thầy Hoàn" } },
      },
    ]);
  });

  it("sends a blank nickname as a clear", async () => {
    await actions.setNicknameAction({ target: "user", nickname: "   " });

    expect(fake().calls[0].init).toMatchObject({
      body: { target: "user", nickname: "" },
    });
  });

  it.each([
    { target: "user:1", nickname: "x" },
    { target: "admin:0", nickname: "x" },
    { target: "pt", nickname: "a".repeat(31) },
    { target: "pt", nickname: "a\u0007b" },
    { nickname: "x" },
  ])("rejects bad input before the API: %j", async (input) => {
    const result = await actions.setNicknameAction(input as never);

    expect(result).toMatchObject({
      status: "error",
      message: "Biệt danh không hợp lệ (tối đa 30 ký tự)",
    });
    expect(fake().calls).toEqual([]);
  });

  it("requires a signed-in trainee", async () => {
    state.signedIn = false;

    expect(
      (await actions.setNicknameAction({ target: "pt", nickname: "x" })).status,
    ).toBe("error");
    expect(fake().calls).toEqual([]);
  });

  it("shows the API's message when it refuses (locked chat)", async () => {
    fake().respond = () => {
      throw apiRefusal(403, "CHAT_LOCKED", "PT đã tạm khoá nhắn tin");
    };

    expect(
      await actions.setNicknameAction({ target: "pt", nickname: "x" }),
    ).toMatchObject({ status: "error", message: "PT đã tạm khoá nhắn tin" });
  });
});

describe("adminSetNicknameAction", () => {
  it("names the conversation in the path and sends the cleaned nickname", async () => {
    const result = await actions.adminSetNicknameAction({
      conversationId: 7,
      target: "admin:3",
      nickname: " HLV ",
    });

    expect(result).toEqual({ status: "success", profile: PROFILE });
    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        method: "PUT",
        path: "/v1/chat/conversations/{cid}/nickname",
        init: {
          params: { path: { cid: 7 } },
          body: { target: "admin:3", nickname: "HLV" },
        },
      },
    ]);
  });

  it.each([0, -1, 1.5, "7", undefined])(
    "rejects conversation id %j before the API",
    async (conversationId) => {
      const result = await actions.adminSetNicknameAction({
        conversationId,
        target: "user",
        nickname: "x",
      } as never);

      expect(result.status).toBe("error");
      expect(fake().calls).toEqual([]);
    },
  );

  it("rejects a bad nickname before the API and requires an admin", async () => {
    expect(
      (
        await actions.adminSetNicknameAction({
          conversationId: 7,
          target: "user",
          nickname: "a".repeat(31),
        })
      ).status,
    ).toBe("error");
    state.signedIn = false;
    expect(
      (
        await actions.adminSetNicknameAction({
          conversationId: 7,
          target: "user",
          nickname: "x",
        })
      ).status,
    ).toBe("error");
    expect(fake().calls).toEqual([]);
  });

  it("shows the API's message for a PT outside the workspace", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "ADMIN_NOT_FOUND", "Không tìm thấy PT này");
    };

    expect(
      await actions.adminSetNicknameAction({
        conversationId: 7,
        target: "admin:9",
        nickname: "x",
      }),
    ).toMatchObject({ status: "error", message: "Không tìm thấy PT này" });
  });
});
