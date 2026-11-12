import { describe, expect, it } from "vitest";

import {
  hashPassword,
  PasswordHasher,
  verifyPassword,
} from "./password-hash.js";

// Port of apps/web/services/__tests__/password.test.ts plus a compatibility
// check: hashes written by the web app must verify here.
describe("scrypt hashes", () => {
  it("round-trips and uses the scrypt$N$salt$hash format", async () => {
    const hash = await hashPassword("correct horse");
    const [prefix, cost, salt, digest] = hash.split("$");

    expect(prefix).toBe("scrypt");
    expect(cost).toBe("16384");
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(Buffer.from(digest, "base64")).toHaveLength(64);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("correct horsf", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("verifies a hash made by the web implementation", async () => {
    // Made with apps/web/services/password.ts (fixed salt, N=16384).
    const { scryptSync } = await import("node:crypto");
    const salt = Buffer.from("0123456789abcdef");
    const digest = scryptSync("web-made", salt, 64, { N: 16384 });
    const hash = `scrypt$16384$${salt.toString("base64")}$${digest.toString("base64")}`;

    expect(await verifyPassword("web-made", hash)).toBe(true);
    expect(await verifyPassword("other", hash)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    for (const bad of [
      "",
      "plain",
      "bcrypt$1$a$b",
      "scrypt$16384$only",
      "scrypt$$$",
    ]) {
      expect(await verifyPassword("x", bad)).toBe(false);
    }
  });

  it("keeps one dummy hash for unknown accounts", async () => {
    const hasher = new PasswordHasher();

    expect(await hasher.dummy()).toBe(await hasher.dummy());
    expect(await hasher.verify("anything", await hasher.dummy())).toBe(false);
  });
});
