import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBER_MESSAGES } from "@/features/members/constants/messages";
import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({ fake: null as FakeApi | null }));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn(() => ({ code: "UNKNOWN" })) }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1, role: "pt" })),
}));

const { changeMemberEmailAction, resetMemberPasswordAction } =
  await import("@/features/members/services/member-login-actions");

beforeEach(() => {
  vi.clearAllMocks();
  fake().reset();
});

// Scope across workspaces, the unique email and the session sign-out are the
// API's: apps/api/test/trainees.e2e.test.ts (email, password-reset).
describe("changeMemberEmailAction", () => {
  it("changes the email through the API", async () => {
    expect(await changeMemberEmailAction(3, "new@x.vn")).toEqual({
      status: "success",
    });
    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        method: "PATCH",
        path: "/v1/trainees/{userId}/email",
        init: { params: { path: { userId: 3 } }, body: { email: "new@x.vn" } },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("shows the API's message for a used email", async () => {
    fake().respond = () => {
      throw apiRefusal(409, "EMAIL_TAKEN", MEMBER_MESSAGES.EMAIL_TAKEN);
    };

    expect(await changeMemberEmailAction(3, "used@x.vn")).toMatchObject({
      status: "error",
      message: MEMBER_MESSAGES.EMAIL_TAKEN,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a bad id before the API", async () => {
    expect((await changeMemberEmailAction(-1, "a@b.vn")).status).toBe("error");
    expect(fake().calls).toEqual([]);
  });
});

describe("resetMemberPasswordAction", () => {
  it("returns the new password the API generated", async () => {
    fake().respond = () => ({ password: "Fresh-pass-1" });

    expect(await resetMemberPasswordAction(3)).toEqual({
      status: "success",
      password: "Fresh-pass-1",
    });
    expect(fake().calls).toMatchObject([
      { method: "POST", path: "/v1/trainees/{userId}/password-reset" },
    ]);
  });

  it("shows the API's message for a trainee without a login or in another workspace", async () => {
    fake().respond = () => {
      throw apiRefusal(400, "NO_LOGIN", MEMBER_MESSAGES.NO_LOGIN);
    };

    expect(await resetMemberPasswordAction(3)).toMatchObject({
      status: "error",
      message: MEMBER_MESSAGES.NO_LOGIN,
    });
  });
});
