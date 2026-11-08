import { describe, expect, it } from "vitest";

import { isLockedFor, isRevealValidFor } from "@/utils/admin-lock-rules";

const NOW = 1_000;
const admin = { id: 7, hasPasscode: true };

describe("isLockedFor", () => {
  it("never locks an admin without a passcode", () => {
    expect(isLockedFor({ id: 7, hasPasscode: false }, null, NOW)).toBe(false);
  });

  it("locks when the unlock proof is missing", () => {
    expect(isLockedFor(admin, null, NOW)).toBe(true);
  });

  it("unlocks with a valid proof for this admin", () => {
    expect(isLockedFor(admin, { adminId: 7, expiresAt: NOW + 1 }, NOW)).toBe(
      false,
    );
  });

  it("locks once the proof has expired, including the exact second", () => {
    expect(isLockedFor(admin, { adminId: 7, expiresAt: NOW }, NOW)).toBe(true);
    expect(isLockedFor(admin, { adminId: 7, expiresAt: NOW - 60 }, NOW)).toBe(
      true,
    );
  });

  it("locks when the proof belongs to another admin", () => {
    expect(isLockedFor(admin, { adminId: 8, expiresAt: NOW + 300 }, NOW)).toBe(
      true,
    );
  });
});

describe("isRevealValidFor", () => {
  it("needs an unexpired proof of the same admin", () => {
    expect(isRevealValidFor(7, null, NOW)).toBe(false);
    expect(isRevealValidFor(7, { adminId: 7, expiresAt: NOW + 1 }, NOW)).toBe(
      true,
    );
    expect(isRevealValidFor(7, { adminId: 8, expiresAt: NOW + 1 }, NOW)).toBe(
      false,
    );
    expect(isRevealValidFor(7, { adminId: 7, expiresAt: NOW }, NOW)).toBe(
      false,
    );
  });
});
