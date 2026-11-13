import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/api/errors";

// The passcode rules themselves (hash, attempt counter, the 5th wrong code
// signing the admin out, unlock window, reset limiter, hidden-chat refusal) now
// live in the API and are covered by apps/api/test/passcode.e2e.test.ts. These
// tests cover what the web actions still own: input validation before the call,
// which endpoint is called with what, and how each API answer is translated.

type Call = { method: string; path: string; body?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as { method: string; path: string; body?: unknown }[],
  // What the next API call answers: data, or an error to refuse with.
  answer: { ok: true, data: {} } as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/call", () => ({
  tryApi: vi.fn(
    async (_actor: string, run: (api: unknown) => Promise<unknown>) => {
      const record =
        (method: string) => async (path: string, init?: { body?: unknown }) => {
          state.calls.push({ method, path, body: init?.body });
          return {};
        };

      await run({
        PUT: record("PUT"),
        POST: record("POST"),
        DELETE: record("DELETE"),
      });
      return state.answer;
    },
  ),
}));
vi.mock("@/services/session", () => ({
  endSession: vi.fn(async () => undefined),
}));
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1 })),
  requireAdminSession: vi.fn(async () => ({ id: 1 })),
}));

const { endSession } = await import("@/services/session");
const { requireAdmin, requireAdminSession } =
  await import("@/services/auth-guard");
const actions = await import("@/features/auth/services/passcode-actions");

const refuse = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, string | number | boolean>,
) => {
  state.answer = {
    ok: false,
    error: new ApiError({ status, code, message, details }),
  };
};

const sent = (): Call[] => state.calls;

beforeEach(() => {
  state.calls = [];
  state.answer = { ok: true, data: {} };
  vi.mocked(endSession).mockClear();
  vi.mocked(requireAdmin).mockClear();
  vi.mocked(requireAdminSession).mockClear();
});

describe("setPasscode", () => {
  it("sends the code to the API and succeeds", async () => {
    expect(await actions.setPasscode("1234")).toEqual({ status: "success" });
    expect(sent()).toEqual([
      {
        method: "PUT",
        path: "/v1/admins/me/passcode",
        body: { passcode: "1234" },
      },
    ]);
    expect(requireAdmin).toHaveBeenCalled();
  });

  it("rejects anything but 4 digits without calling the API", async () => {
    for (const bad of ["123", "12345", "abcd", ""]) {
      expect(await actions.setPasscode(bad)).toMatchObject({
        status: "error",
        message: "Mã khoá gồm đúng 4 chữ số",
      });
    }
    expect(sent()).toEqual([]);
  });

  it("shows the API's refusal when a passcode already exists", async () => {
    refuse(
      409,
      "PASSCODE_ALREADY_SET",
      "Đã có mã khoá. Hãy đổi mã khoá thay vì đặt mới.",
    );

    expect(await actions.setPasscode("2222")).toEqual({
      status: "error",
      message: "Đã có mã khoá. Hãy đổi mã khoá thay vì đặt mới.",
    });
  });
});

describe("changePasscode", () => {
  it("calls the API with both codes", async () => {
    expect(await actions.changePasscode("1111", "2222")).toEqual({
      status: "success",
    });
    expect(sent()).toEqual([
      {
        method: "POST",
        path: "/v1/admins/me/passcode/change",
        body: { currentPasscode: "1111", newPasscode: "2222" },
      },
    ]);
  });

  it("refuses the same code or a malformed one before the call", async () => {
    expect(await actions.changePasscode("1111", "1111")).toMatchObject({
      status: "error",
      message: "Mã khoá mới phải khác mã khoá hiện tại",
    });
    expect(await actions.changePasscode("1111", "22")).toMatchObject({
      status: "error",
    });
    expect(sent()).toEqual([]);
  });

  it("reports the attempts left on a wrong current code", async () => {
    refuse(403, "PASSCODE_WRONG", "Mã khoá không đúng", {
      attemptsLeft: 3,
      signedOut: false,
    });

    expect(await actions.changePasscode("0000", "2222")).toEqual({
      status: "error",
      message: "Mã khoá không đúng",
      attemptsLeft: 3,
    });
    expect(endSession).not.toHaveBeenCalled();
  });
});

describe("turnOffPasscode", () => {
  it("sends the current code in the DELETE body", async () => {
    expect(await actions.turnOffPasscode("1111")).toEqual({
      status: "success",
    });
    expect(sent()).toEqual([
      {
        method: "DELETE",
        path: "/v1/admins/me/passcode",
        body: { currentPasscode: "1111" },
      },
    ]);
  });

  it("shows the API's refusal while chats are hidden", async () => {
    refuse(
      409,
      "PASSCODE_HAS_HIDDEN_CHATS",
      "Hãy bỏ ẩn các học viên đã ẩn trước khi tắt mã khoá",
    );

    expect(await actions.turnOffPasscode("1111")).toMatchObject({
      status: "error",
      message: "Hãy bỏ ẩn các học viên đã ẩn trước khi tắt mã khoá",
    });
  });
});

describe("verifyPasscode", () => {
  it("uses the lock-exempt guard and the verify endpoint", async () => {
    expect(await actions.verifyPasscode("1111")).toEqual({ status: "success" });
    expect(requireAdminSession).toHaveBeenCalled();
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(sent()).toEqual([
      {
        method: "POST",
        path: "/v1/admins/me/passcode/verify",
        body: { passcode: "1111" },
      },
    ]);
  });

  it("counts wrong codes down", async () => {
    refuse(403, "PASSCODE_WRONG", "Mã khoá không đúng", { attemptsLeft: 4 });

    expect(await actions.verifyPasscode("0000")).toMatchObject({
      status: "error",
      attemptsLeft: 4,
    });
    expect(endSession).not.toHaveBeenCalled();
  });

  it("clears the cookie and reports signedOut on the 5th wrong code", async () => {
    refuse(
      401,
      "PASSCODE_SIGNED_OUT",
      "Nhập sai mã khoá quá nhiều lần. Bạn đã bị đăng xuất.",
      {
        attemptsLeft: 0,
        signedOut: true,
      },
    );

    expect(await actions.verifyPasscode("0000")).toEqual({
      status: "error",
      message: "Nhập sai mã khoá quá nhiều lần. Bạn đã bị đăng xuất.",
      attemptsLeft: 0,
      signedOut: true,
    });
    expect(endSession).toHaveBeenCalledWith("pt_admin");
  });

  it("rejects a malformed code without calling the API", async () => {
    expect(await actions.verifyPasscode("12")).toMatchObject({
      status: "error",
    });
    expect(sent()).toEqual([]);
  });
});

describe("resetPasscodeWithPassword", () => {
  it("sends the account password and the new code", async () => {
    expect(
      await actions.resetPasscodeWithPassword("correct-password", "3333"),
    ).toEqual({ status: "success" });
    expect(sent()).toEqual([
      {
        method: "POST",
        path: "/v1/admins/me/passcode/reset",
        body: { password: "correct-password", newPasscode: "3333" },
      },
    ]);
  });

  it("shows a wrong password and a lockout from the API", async () => {
    refuse(403, "PASSCODE_RESET_PASSWORD_WRONG", "Mật khẩu không đúng");
    expect(
      await actions.resetPasscodeWithPassword("nope", "3333"),
    ).toMatchObject({
      status: "error",
      message: "Mật khẩu không đúng",
    });

    refuse(
      429,
      "LOGIN_LOCKED",
      "Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.",
    );
    expect(
      await actions.resetPasscodeWithPassword("nope", "3333"),
    ).toMatchObject({
      status: "error",
      message: "Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.",
    });
  });

  it("rejects an empty password or a malformed code before the call", async () => {
    expect(await actions.resetPasscodeWithPassword("", "3333")).toMatchObject({
      status: "error",
    });
    expect(await actions.resetPasscodeWithPassword("pw", "x")).toMatchObject({
      status: "error",
    });
    expect(sent()).toEqual([]);
  });
});

describe("lockNow", () => {
  it("locks through the API with the lock-exempt guard", async () => {
    expect(await actions.lockNow()).toEqual({ status: "success" });
    expect(requireAdminSession).toHaveBeenCalled();
    expect(sent()).toEqual([
      { method: "POST", path: "/v1/admins/me/passcode/lock", body: undefined },
    ]);
  });

  it("shows the API's refusal without a passcode", async () => {
    refuse(400, "PASSCODE_NOT_SET", "Chưa đặt mã khoá");

    expect(await actions.lockNow()).toMatchObject({
      status: "error",
      message: "Chưa đặt mã khoá",
    });
  });
});
