import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  getLocaleCookieOptions,
  isLocale,
  LOCALE_FLAGS,
  LOCALE_MAX_AGE,
  parseLocale,
} from "@/utils/locale";

describe("isLocale", () => {
  it("accepts exactly the supported locales", () => {
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("en")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const value of ["fr", "EN", "en-US", "", " vi", null, undefined, 1]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});

describe("parseLocale", () => {
  it("keeps a supported locale", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("vi")).toBe("vi");
  });

  it("falls back to Vietnamese for a missing or unknown value", () => {
    expect(DEFAULT_LOCALE).toBe("vi");
    expect(parseLocale(undefined)).toBe("vi");
    expect(parseLocale("de")).toBe("vi");
    expect(parseLocale({})).toBe("vi");
  });
});

describe("getLocaleCookieOptions", () => {
  it("lasts a year and is server-only", () => {
    expect(getLocaleCookieOptions()).toMatchObject({
      maxAge: LOCALE_MAX_AGE,
      path: "/",
      httpOnly: true,
    });
    expect(LOCALE_MAX_AGE).toBe(31_536_000);
  });
});

describe("LOCALE_FLAGS", () => {
  it("has a flag for every locale", () => {
    expect(LOCALE_FLAGS).toEqual({ vi: "🇻🇳", en: "🇺🇸" });
  });
});
