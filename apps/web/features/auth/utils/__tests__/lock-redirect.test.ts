import { describe, expect, it } from "vitest";

import {
  buildLockUrl,
  safeNextPath,
} from "@/features/auth/utils/lock-redirect";

describe("safeNextPath", () => {
  it("keeps admin paths with query", () => {
    expect(safeNextPath("/admin/users/3?week=2")).toBe("/admin/users/3?week=2");
    expect(safeNextPath("/admin")).toBe("/admin");
  });

  it.each([
    undefined,
    "",
    "https://evil.com",
    "//evil.com",
    "/admin//evil.com",
    "/adminx",
    "/workouts",
    "/admin\\evil",
    "/admin/lock",
    "/admin/lock?next=/admin",
    "/admin/login",
  ])("falls back to /admin for %s", (value) => {
    expect(safeNextPath(value)).toBe("/admin");
  });
});

describe("buildLockUrl", () => {
  it("encodes the current path", () => {
    expect(buildLockUrl("/admin/users/3?a=1")).toBe(
      "/admin/lock?next=%2Fadmin%2Fusers%2F3%3Fa%3D1",
    );
  });
});
