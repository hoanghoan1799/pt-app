import { describe, expect, it } from "vitest";

import { parseIdempotencyKey } from "./idempotency.js";

describe("parseIdempotencyKey", () => {
  const uuid = "6f1c8c0e-5b0e-4c1d-9a55-2f0a6b7c9d10";

  it("accepts a UUID or any 8-64 character key", () => {
    expect(parseIdempotencyKey(uuid, undefined, true)).toBe(uuid);
    expect(parseIdempotencyKey("abcd_EFGH-12", undefined, true)).toBe(
      "abcd_EFGH-12",
    );
    expect(parseIdempotencyKey("k".repeat(64), undefined, true)).toBe(
      "k".repeat(64),
    );
  });

  it("lets the header win over the body's clientId and trims", () => {
    expect(parseIdempotencyKey(`  ${uuid} `, "other-key-123", true)).toBe(uuid);
    expect(parseIdempotencyKey(undefined, "other-key-123", true)).toBe(
      "other-key-123",
    );
  });

  it("is optional unless required", () => {
    expect(parseIdempotencyKey(undefined)).toBeNull();
    expect(parseIdempotencyKey("   ")).toBeNull();
    expect(() => parseIdempotencyKey(undefined, undefined, true)).toThrow();
  });

  it("rejects short, long and odd keys", () => {
    for (const key of [
      "short",
      "k".repeat(65),
      "has space 123",
      "ký-tự-lạ-1234",
      "a/b/c/d/e/f/g",
    ]) {
      expect(() => parseIdempotencyKey(key)).toThrow();
    }
  });
});
