import { describe, expect, it } from "vitest";

import {
  generatePassword,
  hashPassword,
  verifyPassword,
} from "@/services/password";

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse");

    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "md5$abc")).toBe(false);
  });
});

describe("generatePassword", () => {
  it("makes 1000 valid, mostly distinct passwords", () => {
    const seen = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const password = generatePassword();

      expect(password).toHaveLength(12);
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
      seen.add(password);
    }
    expect(seen.size).toBe(1000);
  });
});
