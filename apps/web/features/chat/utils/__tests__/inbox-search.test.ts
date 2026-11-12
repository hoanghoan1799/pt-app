import { describe, expect, it } from "vitest";

import {
  asPasscodeQuery,
  matchesInboxSearch,
  normalizeSearchText,
} from "@/features/chat/utils/inbox-search";

describe("normalizeSearchText", () => {
  it("lowercases and strips Vietnamese diacritics", () => {
    expect(normalizeSearchText("Nguyễn Thị Hương")).toBe("nguyen thi huong");
  });

  it("maps đ and Đ to d", () => {
    expect(normalizeSearchText("Đức Đặng")).toBe("duc dang");
  });

  it("treats precomposed and decomposed input the same", () => {
    expect(normalizeSearchText("ê")).toBe("e");
    expect(normalizeSearchText("ê")).toBe("e");
  });

  it("trims surrounding spaces", () => {
    expect(normalizeSearchText("  An ")).toBe("an");
  });
});

describe("matchesInboxSearch", () => {
  it("matches everything for an empty or blank query", () => {
    expect(matchesInboxSearch("", "An")).toBe(true);
    expect(matchesInboxSearch("   ", "An")).toBe(true);
  });

  it("matches a substring ignoring case and diacritics", () => {
    expect(matchesInboxSearch("huong", "Nguyễn Hương")).toBe(true);
    expect(matchesInboxSearch("HƯƠNG", "nguyen huong")).toBe(true);
  });

  it("matches the nickname or the real name", () => {
    expect(matchesInboxSearch("bao", "Bảo Bối", "Trần Văn A")).toBe(true);
    expect(matchesInboxSearch("van a", "Bảo Bối", "Trần Văn A")).toBe(true);
  });

  it("does not match unrelated names", () => {
    expect(matchesInboxSearch("minh", "Bảo", "Lan")).toBe(false);
  });
});

describe("asPasscodeQuery", () => {
  it("accepts exactly four digits", () => {
    expect(asPasscodeQuery("1234")).toBe("1234");
    expect(asPasscodeQuery(" 0042 ")).toBe("0042");
  });

  it.each(["123", "12345", "12a4", "", "12 34", "１２３４"])(
    "rejects %j",
    (value) => {
      expect(asPasscodeQuery(value)).toBeNull();
    },
  );
});
