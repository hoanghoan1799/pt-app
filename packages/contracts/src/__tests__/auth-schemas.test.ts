import {
  adminLoginRequestSchema,
  attemptsLeft,
  changePasscodeRequestSchema,
  changePasswordRequestSchema,
  passcodeSchema,
  revealHiddenUsersRequestSchema,
  shouldSignOut,
  toAdminRole,
  userLoginRequestSchema,
} from "../auth/index.js";
import { describe, expect, it } from "vitest";

describe("login requests", () => {
  it("defaults the client kind to web and trims the email", () => {
    expect(
      userLoginRequestSchema.parse({ email: " a@b.co ", password: "x" }),
    ).toEqual({ email: "a@b.co", password: "x", clientKind: "web" });
  });

  it("does not validate the email format (a malformed email is a counted failure)", () => {
    expect(
      userLoginRequestSchema.safeParse({ email: "nope", password: "x" })
        .success,
    ).toBe(true);
  });

  it("requires both fields and a known client kind", () => {
    expect(
      userLoginRequestSchema.safeParse({ email: "", password: "x" }).success,
    ).toBe(false);
    expect(
      adminLoginRequestSchema.safeParse({ username: "a", password: "" })
        .success,
    ).toBe(false);
    expect(
      adminLoginRequestSchema.safeParse({
        username: "a",
        password: "x",
        clientKind: "tv",
      }).success,
    ).toBe(false);
    expect(
      adminLoginRequestSchema.safeParse({
        username: "a",
        password: "x",
        clientKind: "android",
        clientName: "Pixel 9",
      }).success,
    ).toBe(true);
  });
});

describe("passcode", () => {
  it("is exactly 4 digits", () => {
    expect(passcodeSchema.safeParse("1234").success).toBe(true);
    for (const bad of ["123", "12345", "abcd", "", "12 4", "１２３４"]) {
      expect(passcodeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("counts attempts down and signs out on the 5th", () => {
    expect([1, 2, 3, 4, 5].map(attemptsLeft)).toEqual([4, 3, 2, 1, 0]);
    expect(attemptsLeft(9)).toBe(0);
    expect([4, 5, 6].map(shouldSignOut)).toEqual([false, true, true]);
  });

  it("change needs two well-formed codes; reveal takes any text", () => {
    expect(
      changePasscodeRequestSchema.safeParse({
        currentPasscode: "1111",
        newPasscode: "22",
      }).success,
    ).toBe(false);
    expect(
      revealHiddenUsersRequestSchema.safeParse({ passcode: "joe" }).success,
    ).toBe(true);
  });
});

describe("change password", () => {
  const parse = (currentPassword: string, newPassword: string) =>
    changePasswordRequestSchema.safeParse({ currentPassword, newPassword });

  it("keeps the web rules: 8 to 128 characters and different from the current one", () => {
    expect(parse("old-password", "new-password").success).toBe(true);
    expect(parse("old-password", "short").success).toBe(false);
    expect(parse("old-password", "x".repeat(129)).success).toBe(false);
    expect(parse("same-password", "same-password").success).toBe(false);
    expect(parse("", "new-password").success).toBe(false);
  });
});

describe("toAdminRole", () => {
  it("treats a missing role as super admin", () => {
    expect(toAdminRole(null)).toBe("super_admin");
    expect(toAdminRole(undefined)).toBe("super_admin");
    expect(toAdminRole("pt")).toBe("pt");
    expect(toAdminRole("anything")).toBe("super_admin");
  });
});
