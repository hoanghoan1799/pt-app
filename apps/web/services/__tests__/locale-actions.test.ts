import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({
  fake: null as FakeApi | null,
  user: null as null | { id: number },
  admin: null as null | { id: number },
}));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});
vi.mock("@/services/auth-guard", () => ({
  getCurrentUser: vi.fn(async () => state.user),
  getAdminSession: vi.fn(async () => state.admin),
}));
vi.mock("@/services/locale-cookie", () => ({
  writeLocaleCookie: vi.fn(async () => undefined),
}));

const { setLocaleAction } = await import("@/services/locale-actions");
const { writeLocaleCookie } = await import("@/services/locale-cookie");

beforeEach(() => {
  vi.clearAllMocks();
  fake().reset();
  state.user = null;
  state.admin = null;
});

describe("setLocaleAction", () => {
  it("only sets the cookie for a signed-out visitor", async () => {
    await setLocaleAction("en");

    expect(writeLocaleCookie).toHaveBeenCalledWith("en");
    expect(fake().calls).toEqual([]);
  });

  it("also saves it on a trainee's account through PUT /v1/me/locale", async () => {
    state.user = { id: 4 };
    await setLocaleAction("zh");

    expect(fake().calls).toMatchObject([
      {
        actor: "user",
        method: "PUT",
        path: "/v1/me/locale",
        init: { body: { locale: "zh" } },
      },
    ]);
  });

  it("saves it on an admin's account, locked or not, with the admin session", async () => {
    state.admin = { id: 1 };
    await setLocaleAction("vi");

    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        path: "/v1/me/locale",
        init: { body: { locale: "vi" } },
      },
    ]);
  });

  it("ignores an unknown language: no cookie, no API call", async () => {
    state.user = { id: 4 };
    await setLocaleAction("fr");

    expect(writeLocaleCookie).not.toHaveBeenCalled();
    expect(fake().calls).toEqual([]);
  });

  it("keeps the cookie when the API refuses the save", async () => {
    state.user = { id: 4 };
    fake().respond = () => {
      throw apiRefusal(400, "VALIDATION_FAILED", "Ngôn ngữ không hợp lệ");
    };

    await expect(setLocaleAction("en")).resolves.toBeUndefined();
    expect(writeLocaleCookie).toHaveBeenCalledWith("en");
  });
});
