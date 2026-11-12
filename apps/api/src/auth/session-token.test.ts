import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  generateToken,
  hashToken,
  isWellFormedToken,
  parseBearer,
} from "./session-token.js";

describe("generateToken", () => {
  it("is 32 random bytes as base64url, different every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));

    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });
});

describe("hashToken", () => {
  it("is the SHA-256 digest of the token, and not the token", () => {
    const token = generateToken();
    const hash = hashToken(token);

    expect(hash).toHaveLength(32);
    expect(hash.equals(createHash("sha256").update(token).digest())).toBe(true);
    expect(hash.toString("base64url")).not.toBe(token);
    expect(hashToken(token).equals(hash)).toBe(true);
    expect(hashToken(`${token}x`).equals(hash)).toBe(false);
  });
});

describe("parseBearer", () => {
  const token = generateToken();

  it("accepts only 'Bearer <token>'", () => {
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
    expect(parseBearer(`bearer ${token}`)).toBe(token);
  });

  it("rejects anything else", () => {
    for (const header of [
      undefined,
      "",
      token,
      `Basic ${token}`,
      `Bearer ${token} extra`,
      "Bearer ",
      "Bearer short",
      `Bearer ${"a".repeat(200)}`,
      `Bearer ${token}!`,
    ]) {
      expect(parseBearer(header)).toBeNull();
    }
  });

  it("checks the token shape", () => {
    expect(isWellFormedToken(token)).toBe(true);
    expect(isWellFormedToken("x".repeat(42))).toBe(false);
  });
});
