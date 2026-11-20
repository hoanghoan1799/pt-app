import { RESTRICTION_MESSAGES } from "@pt/contracts";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

// The block rules, the write path and the PT refusal are the API's:
// apps/api/test/restrictions.e2e.test.ts. Here: the action asks for a super
// admin first, validates the input, calls the right route and refreshes.

const state = vi.hoisted(() => ({
  fake: null as FakeApi | null,
  isSuper: true,
}));
const fake = () => state.fake as FakeApi;

class Redirected extends Error {}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Redirected) {
      throw error;
    }
  },
}));
vi.mock("@/services/logger", () => ({
  logServerError: vi.fn(() => ({ code: "UNKNOWN" })),
}));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});
vi.mock("@/services/auth-guard", () => ({
  // A PT is redirected to the dashboard, like the real requireSuperAdmin.
  requireSuperAdmin: vi.fn(async () => {
    if (!state.isSuper) {
      throw new Redirected("/admin");
    }
    return { id: 1, role: "super_admin" };
  }),
}));

const { blockUserAction, liftRestrictionAction } =
  await import("@/features/restrictions/services/restriction-actions");

const VALID = {
  userId: 7,
  level: "restricted",
  duration: "7d",
  reason: "  spam trong chat  ",
};

beforeEach(() => {
  vi.clearAllMocks();
  fake().reset();
  state.isSuper = true;
});

describe("blockUserAction", () => {
  it("sends the trimmed block to the API and refreshes the pages", async () => {
    fake().respond = () => ({ restriction: {} });

    expect(await blockUserAction(VALID)).toEqual({ status: "success" });
    expect(fake().calls).toEqual([
      {
        actor: "admin",
        method: "PUT",
        path: "/v1/trainees/{userId}/restriction",
        init: {
          params: { path: { userId: 7 } },
          body: {
            level: "restricted",
            duration: "7d",
            reason: "spam trong chat",
          },
        },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/7", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/feed");
  });

  it("refuses a PT before anything is sent", async () => {
    state.isSuper = false;

    await expect(blockUserAction(VALID)).rejects.toBeInstanceOf(Redirected);
    expect(fake().calls).toEqual([]);
  });

  it("refuses a missing or too long reason and bad values, sending nothing", async () => {
    expect(await blockUserAction({ ...VALID, reason: "   " })).toEqual({
      status: "error",
      message: RESTRICTION_MESSAGES.REASON_REQUIRED,
    });
    expect(
      await blockUserAction({ ...VALID, reason: "a".repeat(301) }),
    ).toEqual({
      status: "error",
      message: RESTRICTION_MESSAGES.REASON_TOO_LONG,
    });
    for (const bad of [
      { ...VALID, level: "banned" },
      { ...VALID, duration: "1y" },
      { ...VALID, userId: 0 },
      { ...VALID, userId: "7" },
      null,
    ]) {
      expect((await blockUserAction(bad)).status, JSON.stringify(bad)).toBe(
        "error",
      );
    }
    expect(fake().calls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows 'trainee not found' for a 404 and nothing is refreshed", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "TRAINEE_NOT_FOUND", "Không tìm thấy học viên");
    };

    expect(await blockUserAction(VALID)).toEqual({
      status: "error",
      message: RESTRICTION_MESSAGES.USER_NOT_FOUND,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("blockUserAction refusals from the API", () => {
  it("shows the API's own text for any other refusal", async () => {
    fake().respond = () => {
      throw apiRefusal(403, "FORBIDDEN", "Bạn không có quyền");
    };

    expect(await blockUserAction(VALID)).toEqual({
      status: "error",
      message: "Bạn không có quyền",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("liftRestrictionAction", () => {
  it("lifts through the API and refreshes the pages", async () => {
    expect(await liftRestrictionAction(7)).toEqual({ status: "success" });
    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        method: "DELETE",
        path: "/v1/trainees/{userId}/restriction",
        init: { params: { path: { userId: 7 } } },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/7", "layout");
  });

  it("says 'not blocked' when nothing is active", async () => {
    fake().respond = () => {
      throw apiRefusal(
        409,
        "NOT_RESTRICTED",
        RESTRICTION_MESSAGES.NOT_RESTRICTED,
      );
    };

    expect(await liftRestrictionAction(7)).toEqual({
      status: "error",
      message: RESTRICTION_MESSAGES.NOT_RESTRICTED,
    });
  });

  it("refuses a bad id and a PT, sending nothing", async () => {
    expect(await liftRestrictionAction("7")).toEqual({
      status: "error",
      message: RESTRICTION_MESSAGES.INVALID_INPUT,
    });
    state.isSuper = false;
    await expect(liftRestrictionAction(7)).rejects.toBeInstanceOf(Redirected);
    expect(fake().calls).toEqual([]);
  });

  it("shows 'trainee not found' for a 404", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "TRAINEE_NOT_FOUND", "Không tìm thấy học viên");
    };

    expect(await liftRestrictionAction(7)).toEqual({
      status: "error",
      message: RESTRICTION_MESSAGES.USER_NOT_FOUND,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
