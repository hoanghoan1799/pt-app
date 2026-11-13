import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({
  isSuper: true,
  fake: null as FakeApi | null,
}));
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
  requireSuperAdmin: vi.fn(async () => {
    if (!state.isSuper) {
      const { redirect } = await import("next/navigation");

      redirect("/admin");
    }
    return { id: 1, role: "super_admin" };
  }),
}));

const { createPtAction, setAdminVerifiedAction, assignTraineePtAction } =
  await import("@/features/pts/services/pt-actions");

const toFormData = (fields: Record<string, string>) => {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
};

beforeEach(() => {
  fake().reset();
  state.isSuper = true;
  vi.mocked(revalidatePath).mockClear();
});

// The hashing, the unique username (case-insensitive) and the missing tick are
// the API's: apps/api/test/admins.e2e.test.ts ("creates a PT ...").
describe("createPtAction", () => {
  it("posts the trimmed username and the password to the API", async () => {
    fake().respond = () => ({ id: 5, username: "Coach.An" });
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: " Coach.An ", password: "long-enough-1" }),
    );

    expect(result.status).toBe("success");
    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        method: "POST",
        path: "/v1/pts",
        init: { body: { username: "Coach.An", password: "long-enough-1" } },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/pts");
  });

  it("rejects a bad username and a short password with field errors, before the API", async () => {
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: "a b", password: "short" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.username).toBeTruthy();
    expect(result.fieldErrors?.password).toBeTruthy();
    expect(fake().calls).toEqual([]);
  });

  it("puts a taken username on the username field and keeps what was typed", async () => {
    fake().respond = () => {
      throw apiRefusal(409, "USERNAME_TAKEN", "Tên đăng nhập này đã được dùng");
    };
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: "COACH", password: "long-enough-1" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.username).toBe("Tên đăng nhập này đã được dùng");
    expect(result.values).toEqual({ username: "COACH" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a PT caller and calls nothing", async () => {
    state.isSuper = false;
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: "coach", password: "long-enough-1" }),
    ).catch((error: unknown) => error);

    expect(result).toMatchObject({
      digest: expect.stringContaining("REDIRECT"),
    });
    expect(fake().calls).toEqual([]);
  });
});

describe("setAdminVerifiedAction", () => {
  it("grants and removes the tick through the API", async () => {
    expect(await setAdminVerifiedAction(7, true)).toEqual({
      status: "success",
    });
    await setAdminVerifiedAction(7, false);

    expect(fake().calls).toMatchObject([
      {
        method: "PUT",
        path: "/v1/admins/{adminId}/verified",
        init: { params: { path: { adminId: 7 } }, body: { verified: true } },
      },
      { init: { body: { verified: false } } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/pts");
  });

  it("shows the API's message for an unknown admin", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "ADMIN_NOT_FOUND", "Không tìm thấy tài khoản");
    };

    expect(await setAdminVerifiedAction(99, true)).toMatchObject({
      status: "error",
      message: "Không tìm thấy tài khoản",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a bad id before the API", async () => {
    expect((await setAdminVerifiedAction(0, true)).status).toBe("error");
    expect(fake().calls).toEqual([]);
  });
});

describe("assignTraineePtAction", () => {
  it("assigns and clears the PT of a trainee", async () => {
    expect((await assignTraineePtAction(3, 9)).status).toBe("success");
    await assignTraineePtAction(3, null);

    expect(fake().calls).toMatchObject([
      {
        method: "PUT",
        path: "/v1/trainees/{userId}/pt",
        init: { params: { path: { userId: 3 } }, body: { ptAdminId: 9 } },
      },
      { init: { body: { ptAdminId: null } } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("shows the API's message for a target that is not a PT account", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "PT_NOT_FOUND", "Không tìm thấy PT");
    };

    expect(await assignTraineePtAction(3, 1)).toMatchObject({
      status: "error",
      message: "Không tìm thấy PT",
    });
  });

  it("reports an unknown trainee", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "USER_NOT_FOUND", "Không tìm thấy học viên");
    };

    expect(await assignTraineePtAction(999, 9)).toMatchObject({
      status: "error",
      message: "Không tìm thấy học viên",
    });
  });
});
