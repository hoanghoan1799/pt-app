import { describe, expect, it } from "vitest";

import { isSessionStale } from "@/utils/session-staleness";

const CHANGED = new Date(1_700_000_000_000);

describe("isSessionStale", () => {
  it("rejects a session issued before the password change", () => {
    expect(isSessionStale(1_699_999_999, CHANGED)).toBe(true);
  });

  it("accepts a session issued in the same second", () => {
    expect(isSessionStale(1_700_000_000, CHANGED)).toBe(false);
  });

  it("accepts a session issued after the change", () => {
    expect(isSessionStale(1_700_000_100, CHANGED)).toBe(false);
  });

  it("accepts any session when the password never changed", () => {
    expect(isSessionStale(1, null)).toBe(false);
  });
});
