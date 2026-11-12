import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({
  fake: null as FakeApi | null,
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
  requireAdmin: vi.fn(async () => {
    if (!state.admin) {
      throw new Error("not an admin");
    }
    return { id: 1 };
  }),
}));

const actions = await import("@/features/chat/services/presence-actions");

beforeEach(() => {
  fake().reset();
  state.admin = true;
});

// Saving the switch for the signed-in admin only, and hiding them from the
// aggregate "last seen", are the API's: apps/api/test/admins.e2e.test.ts
// ("own admin profile and settings") and apps/api/test/presence.e2e.test.ts.
describe("setPresenceHiddenAction", () => {
  it("saves the switch through the API with the admin's session", async () => {
    expect(await actions.setPresenceHiddenAction({ isHidden: true })).toEqual({
      status: "success",
    });
    await actions.setPresenceHiddenAction({ isHidden: false });

    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        method: "PUT",
        path: "/v1/admins/me/presence-hidden",
        init: { body: { isHidden: true } },
      },
      { init: { body: { isHidden: false } } },
    ]);
  });

  it("rejects a non-boolean value before the API", async () => {
    const result = await actions.setPresenceHiddenAction({
      isHidden: "yes",
    } as never);

    expect(result.status).toBe("error");
    expect(fake().calls).toEqual([]);
  });

  it("requires an admin session", async () => {
    state.admin = false;

    expect(
      (await actions.setPresenceHiddenAction({ isHidden: true })).status,
    ).toBe("error");
    expect(fake().calls).toEqual([]);
  });

  it("shows the API's message when it refuses", async () => {
    fake().respond = () => {
      throw apiRefusal(400, "VALIDATION_FAILED", "Giá trị không hợp lệ");
    };

    expect(
      await actions.setPresenceHiddenAction({ isHidden: true }),
    ).toMatchObject({ status: "error", message: "Giá trị không hợp lệ" });
  });
});
