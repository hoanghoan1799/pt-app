import { describe, expect, it } from "vitest";

import {
  isNewerBuild,
  shouldCheck,
  VERSION_CHECK_INTERVAL_MS,
} from "@/features/pwa/utils/version-check";

describe("isNewerBuild", () => {
  it("is false for the same build id", () => {
    expect(isNewerBuild("abc123", "abc123")).toBe(false);
  });

  it("is true for a different build id", () => {
    expect(isNewerBuild("abc123", "def456")).toBe(true);
  });

  it("is false when either side is dev", () => {
    expect(isNewerBuild("dev", "def456")).toBe(false);
    expect(isNewerBuild("abc123", "dev")).toBe(false);
    expect(isNewerBuild("dev", "dev")).toBe(false);
  });

  it("is false for empty or non-string latest values", () => {
    expect(isNewerBuild("abc123", "")).toBe(false);
    expect(isNewerBuild("abc123", undefined)).toBe(false);
    expect(isNewerBuild("abc123", null)).toBe(false);
    expect(isNewerBuild("abc123", 42)).toBe(false);
    expect(isNewerBuild("abc123", { buildId: "def456" })).toBe(false);
  });
});

describe("shouldCheck", () => {
  it("allows the first check", () => {
    expect(shouldCheck(null, 1_000, VERSION_CHECK_INTERVAL_MS)).toBe(true);
  });

  it("blocks a check inside the interval", () => {
    expect(shouldCheck(1_000, 1_000, VERSION_CHECK_INTERVAL_MS)).toBe(false);
    expect(shouldCheck(1_000, 60_999, VERSION_CHECK_INTERVAL_MS)).toBe(false);
  });

  it("allows a check exactly at and after the interval", () => {
    expect(shouldCheck(1_000, 61_000, VERSION_CHECK_INTERVAL_MS)).toBe(true);
    expect(shouldCheck(1_000, 120_000, VERSION_CHECK_INTERVAL_MS)).toBe(true);
  });

  it("uses a 60 second default interval", () => {
    expect(VERSION_CHECK_INTERVAL_MS).toBe(60_000);
  });
});
