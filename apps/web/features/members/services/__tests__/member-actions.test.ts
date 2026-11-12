import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({
  fake: null as FakeApi | null,
  admin: { id: 1, role: "super_admin" as "super_admin" | "pt" },
}));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn(() => ({ code: "UNKNOWN" })) }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => state.admin),
}));

const { createMemberAction, deleteMemberAction } =
  await import("@/features/members/services/member-actions");

const toFormData = (fields: Record<string, string>) => {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
};

const create = (fields: Record<string, string>) =>
  createMemberAction(INITIAL_FORM_STATE, toFormData(fields));

beforeEach(() => {
  vi.clearAllMocks();
  fake().reset();
  state.admin = { id: 1, role: "super_admin" };
  fake().respond = ({ init }) => ({
    id: 20,
    name: (init.body as { name: string }).name,
    email: (init.body as { email: string }).email,
    ptAdminId: (init.body as { ptAdminId: number | null }).ptAdminId,
    password: "Generated-pass-1",
  });
});

// The name/email rules, duplicates, PT workspace checks and the password are the
// API's: apps/api/test/trainees.e2e.test.ts ("POST /v1/trainees").
describe("createMemberAction", () => {
  it("creates through the API and shows the generated password once", async () => {
    const result = await create({ name: "An", email: " an@example.com " });

    expect(result.status).toBe("success");
    expect(result.credentials).toEqual({
      name: "An",
      email: "an@example.com",
      password: "Generated-pass-1",
    });
    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        method: "POST",
        path: "/v1/trainees",
        init: { body: { name: "An", ptAdminId: null } },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("puts a PT's trainee in their own workspace and ignores a posted PT", async () => {
    state.admin = { id: 7, role: "pt" };
    await create({ name: "An", email: "an@example.com", ptAdminId: "9" });

    expect(fake().calls[0].init.body).toMatchObject({ ptAdminId: 7 });
  });

  it("lets a super admin pick a PT", async () => {
    await create({ name: "Chi", email: "chi@example.com", ptAdminId: "9" });

    expect(fake().calls[0].init.body).toMatchObject({ ptAdminId: 9 });
  });

  it.each([
    ["a non-numeric value", "abc"],
    ["a negative id", "-1"],
  ])("rejects %s before the API", async (_label, ptAdminId) => {
    const result = await create({
      name: "Dung",
      email: "dung@example.com",
      ptAdminId,
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.ptAdminId).toBeTruthy();
    expect(fake().calls).toEqual([]);
  });

  it.each([
    ["NAME_TAKEN", "name", 409],
    ["EMAIL_TAKEN", "email", 409],
    ["PT_NOT_FOUND", "ptAdminId", 404],
  ])(
    "puts %s on the %s field and keeps what was typed",
    async (code, field, status) => {
      fake().respond = () => {
        throw apiRefusal(status, code, `msg ${code}`);
      };
      const result = await create({ name: "An", email: "an@example.com" });

      expect(result.status).toBe("error");
      expect(result.fieldErrors).toEqual({ [field]: `msg ${code}` });
      expect(result.values).toEqual({ name: "An", email: "an@example.com" });
      expect(result.credentials).toBeUndefined();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("maps the API's validation message to field errors", async () => {
    fake().respond = () => {
      throw apiRefusal(
        400,
        "VALIDATION_FAILED",
        "email: Email không hợp lệ; name: Nhập tên user",
      );
    };
    const result = await create({ name: "", email: "x" });

    expect(result.fieldErrors).toEqual({
      email: "Email không hợp lệ",
      name: "Nhập tên user",
    });
  });
});

describe("deleteMemberAction", () => {
  it("deletes through the API, refreshes the dashboard and goes back to it", async () => {
    fake().respond = () => undefined;

    await deleteMemberAction(5);

    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        method: "DELETE",
        path: "/v1/trainees/{userId}",
        init: { params: { path: { userId: 5 } } },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("shows the API's message for a trainee outside the workspace or missing", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "TRAINEE_NOT_FOUND", "Không tìm thấy user này");
    };

    expect(await deleteMemberAction(5)).toMatchObject({
      status: "error",
      message: "Không tìm thấy user này",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a bad id before the API", async () => {
    expect((await deleteMemberAction(0)).status).toBe("error");
    expect(fake().calls).toEqual([]);
  });
});
