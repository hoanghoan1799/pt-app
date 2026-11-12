import { beforeEach, describe, expect, it, vi } from "vitest";

import { AVATAR_MESSAGES } from "@/features/avatar/constants/messages";
import { AVATAR_MAX_DATA_URL_LENGTH } from "@/features/avatar/utils/avatar-rules";
import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({
  fake: null as FakeApi | null,
  user: true,
  admin: true,
}));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn(() => ({ code: "UNKNOWN" })) }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => {
    if (!state.user) {
      throw new Error("NEXT_REDIRECT");
    }
    return { id: 1 };
  }),
  requireAdmin: vi.fn(async () => {
    if (!state.admin) {
      throw new Error("NEXT_REDIRECT");
    }
    return { id: 1 };
  }),
}));

const actions = await import("@/features/avatar/services/avatar-actions");

const DATA_URL = "data:image/png;base64,AAAA";

beforeEach(() => {
  fake().reset();
  state.user = true;
  state.admin = true;
  // The API answers its own /v1/avatars URL.
  fake().respond = ({ method }) =>
    method === "PUT" ? { avatarUrl: "/v1/avatars/user/1?v=1793953327" } : {};
});

// The magic-byte, label and 80 KB checks are the API's:
// apps/api/src/files/image-rules.test.ts and apps/api/test/avatars.e2e.test.ts.
describe("setUserAvatarAction / setAdminAvatarAction", () => {
  it("stores the viewer's own photo and returns its URL through this app", async () => {
    expect(await actions.setUserAvatarAction({ dataUrl: DATA_URL })).toEqual({
      status: "success",
      avatarUrl: "/api/avatar/user/1?v=1793953327",
    });
    expect(fake().calls).toMatchObject([
      {
        actor: "user",
        method: "PUT",
        path: "/v1/users/me/avatar",
        init: { body: { dataUrl: DATA_URL } },
      },
    ]);
  });

  it("stores an admin's photo with the admin session", async () => {
    await actions.setAdminAvatarAction({ dataUrl: DATA_URL });

    expect(fake().calls).toMatchObject([
      { actor: "admin", path: "/v1/admins/me/avatar" },
    ]);
  });

  it("refuses oversize and empty input before sending it on", async () => {
    expect(
      await actions.setUserAvatarAction({
        dataUrl: "x".repeat(AVATAR_MAX_DATA_URL_LENGTH + 1),
      }),
    ).toEqual({ status: "error", message: AVATAR_MESSAGES.TOO_LARGE });
    expect(await actions.setUserAvatarAction({ dataUrl: "" })).toEqual({
      status: "error",
      message: AVATAR_MESSAGES.INVALID,
    });
    expect(fake().calls).toEqual([]);
  });

  it("shows the API's message for a photo it refuses", async () => {
    fake().respond = () => {
      throw apiRefusal(400, "AVATAR_INVALID", AVATAR_MESSAGES.INVALID);
    };

    expect(
      await actions.setUserAvatarAction({ dataUrl: DATA_URL }),
    ).toMatchObject({ status: "error", message: AVATAR_MESSAGES.INVALID });
  });

  it("requires a session of the right kind", async () => {
    state.user = false;
    state.admin = false;

    expect(
      (await actions.setUserAvatarAction({ dataUrl: DATA_URL })).status,
    ).toBe("error");
    expect(
      (await actions.setAdminAvatarAction({ dataUrl: DATA_URL })).status,
    ).toBe("error");
    expect(fake().calls).toEqual([]);
  });
});

describe("removeUserAvatarAction / removeAdminAvatarAction", () => {
  it("clears the photo through the API", async () => {
    expect(await actions.removeUserAvatarAction()).toEqual({
      status: "success",
      avatarUrl: null,
    });
    expect(await actions.removeAdminAvatarAction()).toEqual({
      status: "success",
      avatarUrl: null,
    });
    expect(fake().calls).toMatchObject([
      { actor: "user", method: "DELETE", path: "/v1/users/me/avatar" },
      { actor: "admin", method: "DELETE", path: "/v1/admins/me/avatar" },
    ]);
  });
});
