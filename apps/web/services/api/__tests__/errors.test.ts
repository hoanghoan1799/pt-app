import { describe, expect, it } from "vitest";

import {
  ApiError,
  apiErrorFromBody,
  apiErrorToFormState,
  isAdminLockedError,
  isSessionEndedError,
  parseValidationMessage,
} from "@/services/api/errors";

describe("parseValidationMessage", () => {
  it("keeps the first message per top-level field", () => {
    expect(
      parseValidationMessage(
        "email: Sai định dạng; items.0.name: Nhập tên; email: Khác",
      ),
    ).toEqual({ email: "Sai định dạng", items: "Nhập tên" });
  });

  it("gives nothing for text that is not path: message", () => {
    expect(parseValidationMessage("Dữ liệu không hợp lệ")).toBeUndefined();
  });
});

describe("apiErrorFromBody", () => {
  it("reads code, message, ref and details", () => {
    const error = apiErrorFromBody(
      403,
      {
        code: "PASSCODE_WRONG",
        message: "Mã khoá không đúng",
        ref: "r1",
        details: { attemptsLeft: 2 },
      },
      { method: "POST", path: "/v1/x" },
    );

    expect(error).toMatchObject({
      status: 403,
      code: "PASSCODE_WRONG",
      ref: "r1",
      details: { attemptsLeft: 2 },
      path: "/v1/x",
    });
    expect(error.isClientError).toBe(true);
  });

  it("builds a generic error from a body of another shape", () => {
    const error = apiErrorFromBody(502, "bad gateway");

    expect(error).toMatchObject({ code: "HTTP_502", message: "HTTP 502" });
    expect(error.isClientError).toBe(false);
  });
});

describe("classification", () => {
  const make = (status: number, code: string) =>
    new ApiError({ status, code, message: "m" });

  it("knows an ended session and the admin lock", () => {
    expect(isSessionEndedError(make(401, "SESSION_INVALID"))).toBe(true);
    expect(isSessionEndedError(make(401, "INVALID_CREDENTIALS"))).toBe(false);
    expect(isSessionEndedError(make(401, "PASSCODE_SIGNED_OUT"))).toBe(false);
    expect(isAdminLockedError(make(403, "ADMIN_LOCKED"))).toBe(true);
    expect(isAdminLockedError(make(403, "FORBIDDEN"))).toBe(false);
  });

  it("treats timeouts and network failures as not user-actionable", () => {
    expect(
      new ApiError({
        kind: "timeout",
        status: 0,
        code: "API_TIMEOUT",
        message: "m",
      }).isClientError,
    ).toBe(false);
  });
});

describe("apiErrorToFormState", () => {
  it("carries the message, field errors and what was typed", () => {
    const state = apiErrorToFormState(
      new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        message: "email: Sai định dạng",
      }),
      { values: { email: "x" } },
    );

    expect(state).toMatchObject({
      status: "error",
      message: "email: Sai định dạng",
      fieldErrors: { email: "Sai định dạng" },
      values: { email: "x" },
    });
  });
});
