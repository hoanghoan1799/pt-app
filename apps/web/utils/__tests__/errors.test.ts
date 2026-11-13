import { describe, expect, it } from "vitest";

import {
  AppError,
  classifyError,
  describeErrorReference,
  getErrorMessage,
} from "@/utils/errors";

describe("classifyError", () => {
  it("keeps the code of an AppError", () => {
    expect(
      classifyError(new AppError("CONFIG_MISSING", "Thiếu SESSION_SECRET")),
    ).toEqual({
      code: "CONFIG_MISSING",
      detail: "Thiếu SESSION_SECRET",
    });
  });

  it("keeps the code and the cause chain of an unknown error in the detail", () => {
    const error = new Error("outer", {
      cause: Object.assign(new Error("inner"), { code: "E_INNER" }),
    });

    expect(classifyError(error)).toEqual({
      code: "UNKNOWN",
      detail: "outer | E_INNER | inner",
    });
  });

  it("handles non-Error values", () => {
    expect(classifyError("boom")).toEqual({ code: "UNKNOWN", detail: "boom" });
  });
});

describe("getErrorMessage / describeErrorReference", () => {
  it("returns the readable message and code line", () => {
    expect(getErrorMessage({ code: "API_UNREACHABLE", detail: "" })).toBe(
      "Server không kết nối được tới API (kiểm tra API_URL)",
    );
    expect(describeErrorReference("3f9a1c2e")).toBe("Mã tham chiếu: 3f9a1c2e");
    expect(describeErrorReference(undefined)).toBeUndefined();
  });
});
