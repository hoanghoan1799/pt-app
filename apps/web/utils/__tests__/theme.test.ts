import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  getThemeCookieOptions,
  isTheme,
  parseTheme,
  THEME_MAX_AGE,
  THEMES,
} from "@/utils/theme";

describe("parseTheme", () => {
  it.each(THEMES)("keeps the valid value %s", (theme) => {
    expect(parseTheme(theme)).toBe(theme);
  });

  it("defaults to system when the cookie is missing", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(DEFAULT_THEME).toBe("system");
  });

  it.each([
    "",
    "DARK",
    " dark",
    "dark ",
    "auto",
    "dark;path=/",
    "<script>",
    null,
    42,
    {},
    ["dark"],
  ])("falls back to system for %j", (value) => {
    expect(parseTheme(value)).toBe("system");
  });
});

describe("isTheme", () => {
  it("accepts only the three themes", () => {
    expect(THEMES).toEqual(["light", "dark", "system"]);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("getThemeCookieOptions", () => {
  it("is long lived, lax and site wide", () => {
    const options = getThemeCookieOptions();

    expect(options.maxAge).toBe(THEME_MAX_AGE);
    expect(options.maxAge).toBeGreaterThanOrEqual(60 * 60 * 24 * 180);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });
});
