import { describe, expect, it } from "vitest";

import { getInitial, normalizeName, toNameKey } from "@/utils/name";

describe("normalizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  Nam   Nguyễn ")).toBe("Nam Nguyễn");
  });
});

describe("toNameKey", () => {
  it("matches regardless of case and spacing", () => {
    expect(toNameKey(" NAM  nguyễn")).toBe(toNameKey("Nam Nguyễn"));
  });

  it("ignores Vietnamese accents", () => {
    expect(toNameKey("nguyen van an")).toBe(toNameKey("Nguyễn Văn An"));
    expect(toNameKey("Đức")).toBe("duc");
  });

  it("matches decomposed and composed accents", () => {
    const decomposed = "Nguyễn".normalize("NFD");

    expect(toNameKey(decomposed)).toBe(toNameKey("Nguyễn"));
  });
});

describe("getInitial", () => {
  it("returns the upper-cased first letter", () => {
    expect(getInitial(" đức")).toBe("Đ");
  });
});
