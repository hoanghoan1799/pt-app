import { describe, expect, it } from "vitest";

import {
  AppError,
  classifyError,
  describeErrorReference,
  getErrorMessage,
} from "@/utils/errors";

const createLibsqlError = (message: string, code: string) =>
  Object.assign(new Error(message), { code });

describe("classifyError", () => {
  it("keeps the code of an AppError", () => {
    expect(
      classifyError(new AppError("CONFIG_MISSING", "Thiếu SESSION_SECRET")),
    ).toEqual({
      code: "CONFIG_MISSING",
      detail: "Thiếu SESSION_SECRET",
    });
  });

  it.each([
    ["SQLITE_ERROR: no such table: users", "SQLITE_ERROR", "DB_NOT_MIGRATED"],
    [
      "SQLITE_CANTOPEN: unable to open database file",
      "SQLITE_CANTOPEN",
      "DB_FILE_UNAVAILABLE",
    ],
    ["Server returned HTTP status 401", "SERVER_ERROR", "DB_AUTH_FAILED"],
    ["fetch failed", "ECONNREFUSED", "DB_UNREACHABLE"],
    ["Something odd", "WHATEVER", "UNKNOWN"],
  ])("classifies %s", (message, code, expected) => {
    expect(classifyError(createLibsqlError(message, code)).code).toBe(expected);
  });

  it("reads the cause chain drizzle wraps around driver errors", () => {
    const driverError = createLibsqlError(
      "SQLITE_ERROR: no such table: admins",
      "SQLITE_ERROR",
    );
    const wrapped = new Error("Failed query: select ...", {
      cause: driverError,
    });

    expect(classifyError(wrapped).code).toBe("DB_NOT_MIGRATED");
  });

  it("handles non-Error values", () => {
    expect(classifyError("boom")).toEqual({ code: "UNKNOWN", detail: "boom" });
  });
});

describe("getErrorMessage / describeErrorReference", () => {
  it("returns the readable message and code line", () => {
    expect(getErrorMessage({ code: "DB_NOT_MIGRATED", detail: "" })).toBe(
      "Database chưa được tạo bảng (chạy npm run db:setup)",
    );
    expect(describeErrorReference("3f9a1c2e")).toBe("Mã tham chiếu: 3f9a1c2e");
    expect(describeErrorReference(undefined)).toBeUndefined();
  });
});
