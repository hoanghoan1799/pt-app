import { describe, expect, it } from "vitest";

import {
  attemptsLeft,
  isValidPasscode,
  PASSCODE_MAX_FAILS,
  passcodeSchema,
  shouldSignOut,
  UNLOCK_WINDOW_SECONDS,
  unlockExpiry,
} from "@/features/auth/utils/passcode-rules";

describe("passcodeSchema", () => {
  it.each(["0000", "1234", "9876", "0007"])("accepts %s", (value) => {
    expect(passcodeSchema.safeParse(value).success).toBe(true);
  });

  it.each(["", "123", "12345", "12a4", "abcd", " 123", "12 4", "١٢٣٤", "12.4"])(
    "rejects %j",
    (value) => {
      expect(isValidPasscode(value)).toBe(false);
    },
  );

  it("rejects a trailing newline", () => {
    expect(isValidPasscode("1234\n")).toBe(false);
  });

  it("gives a Vietnamese message", () => {
    const result = passcodeSchema.safeParse("12");

    expect(result.success ? "" : result.error.issues[0].message).toBe(
      "Mã khoá gồm đúng 4 chữ số",
    );
  });
});

describe("constants", () => {
  it("uses 5 strikes and a 5 minute window", () => {
    expect(PASSCODE_MAX_FAILS).toBe(5);
    expect(UNLOCK_WINDOW_SECONDS).toBe(300);
    expect(unlockExpiry(1000)).toBe(1300);
  });
});

describe("strikes", () => {
  it("counts attempts down and signs out on the 5th", () => {
    expect(attemptsLeft(1)).toBe(4);
    expect(attemptsLeft(4)).toBe(1);
    expect(attemptsLeft(5)).toBe(0);
    expect(attemptsLeft(9)).toBe(0);
    expect(shouldSignOut(4)).toBe(false);
    expect(shouldSignOut(5)).toBe(true);
  });
});
