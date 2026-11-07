import { describe, expect, it } from "vitest";

import {
  buildSnippet,
  findMatch,
  foldText,
  formatResultTime,
  isSearchableQuery,
  matchesQuery,
  parseSearchParams,
  searchSenderLabel,
} from "@/features/chat/utils/search-rules";

describe("foldText", () => {
  it("removes Vietnamese accents, reads đ as d and lower-cases", () => {
    expect(foldText("Đồ ĂN Nhẹ")).toBe("do an nhe");
    expect(foldText("Nguyễn Văn Ưu")).toBe("nguyen van uu");
    expect(foldText("đĐ")).toBe("dd");
  });

  it("treats precomposed and decomposed input alike", () => {
    expect(foldText("ă".normalize("NFD"))).toBe("a");
    expect(foldText("ă")).toBe("a");
  });
});

describe("isSearchableQuery", () => {
  it("needs two characters, not counting surrounding spaces", () => {
    expect(isSearchableQuery("")).toBe(false);
    expect(isSearchableQuery("a")).toBe(false);
    expect(isSearchableQuery("  a  ")).toBe(false);
    expect(isSearchableQuery("an")).toBe(true);
    expect(isSearchableQuery(" ăn ")).toBe(true);
    // Two characters even when each is a combining sequence.
    expect(isSearchableQuery("đ")).toBe(false);
    expect(isSearchableQuery("đồ")).toBe(true);
  });

  it("refuses an absurdly long query", () => {
    expect(isSearchableQuery("a".repeat(100))).toBe(true);
    expect(isSearchableQuery("a".repeat(101))).toBe(false);
  });
});

describe("findMatch", () => {
  it("'an' matches 'ăn' and 'do' matches 'đồ'", () => {
    expect(matchesQuery("Hôm nay em ăn cơm gà", "an")).toBe(true);
    expect(matchesQuery("Đồ ăn vặt", "do")).toBe(true);
    expect(matchesQuery("Đồ ăn vặt", "ĐỒ")).toBe(true);
    expect(matchesQuery("Đồ ăn vặt", "đo")).toBe(true);
  });

  it("does not match unrelated text or a single letter query", () => {
    expect(matchesQuery("Tập chân", "ngực")).toBe(false);
    expect(findMatch("anything", " ")).toBeNull();
  });

  it("returns the range in the original text", () => {
    const text = "Hôm nay em ăn cơm";
    const range = findMatch(text, "an");

    expect(range).not.toBeNull();
    expect(text.slice(range?.start, range?.end)).toBe("an".replace("an", "ăn"));
  });

  it("finds the first match, case and accent insensitively", () => {
    const text = "Ăn sáng, ăn trưa";
    const range = findMatch(text, "an");

    expect(range).toEqual({ start: 0, end: 2 });
  });

  it("maps back correctly when the text is decomposed (NFD)", () => {
    const text = "em ăn cơm".normalize("NFD");
    const range = findMatch(text, "an");

    expect(range).not.toBeNull();
    expect(text.slice(range?.start, range?.end).normalize("NFC")).toBe("ăn");
  });

  it("matches across a run of spaces or a line break as one space", () => {
    const text = "bữa sáng\n\n  ăn   cơm";
    const range = findMatch(text, "sang an com");

    expect(range).not.toBeNull();
    expect(text.slice(range?.start, range?.end)).toBe("sáng\n\n  ăn   cơm");
  });

  it("keeps astral characters (emoji) in place", () => {
    const text = "💪 tập chân";
    const range = findMatch(text, "tap");

    expect(text.slice(range?.start, range?.end)).toBe("tập");
  });
});

describe("buildSnippet", () => {
  it("bolds the match and keeps context on both sides", () => {
    const snippet = buildSnippet("em ăn cơm gà", { start: 3, end: 5 });

    expect(snippet).toEqual({ before: "em ", match: "ăn", after: " cơm gà" });
  });

  it("cuts long text with an ellipsis on the cut sides", () => {
    const text = `${"x".repeat(100)}ăn${"y".repeat(100)}`;
    const snippet = buildSnippet(text, { start: 100, end: 102 }, 10);

    expect(snippet.before).toBe(`…${"x".repeat(10)}`);
    expect(snippet.match).toBe("ăn");
    expect(snippet.after).toBe(`${"y".repeat(10)}…`);
  });

  it("puts line breaks on one line", () => {
    expect(buildSnippet("a\nb ăn\nc", { start: 4, end: 6 }).before).toBe(
      "a b ",
    );
  });
});

describe("parseSearchParams", () => {
  const parse = (query: string) =>
    parseSearchParams(new URLSearchParams(query));

  it("accepts a query with an optional cursor", () => {
    expect(parse("q=an")).toEqual({
      ok: true,
      query: "an",
      before: undefined,
    });
    expect(parse("q=an&before=12")).toEqual({
      ok: true,
      query: "an",
      before: 12,
    });
  });

  it("refuses a short or missing query and a bad cursor", () => {
    expect(parse("")).toEqual({ ok: false });
    expect(parse("q=a")).toEqual({ ok: false });
    expect(parse("q=an&before=0")).toEqual({ ok: false });
    expect(parse("q=an&before=1e3")).toEqual({ ok: false });
  });
});

describe("searchSenderLabel", () => {
  const admin = { role: "admin", adminId: 1, peerName: "An" } as const;

  it("labels my own messages 'Bạn'", () => {
    expect(
      searchSenderLabel(
        { senderRole: "user", senderAdminId: null, senderName: null },
        { role: "user" },
      ),
    ).toBe("Bạn");
    expect(
      searchSenderLabel(
        { senderRole: "admin", senderAdminId: 1, senderName: "pt1" },
        admin,
      ),
    ).toBe("Bạn");
  });

  it("applies nicknames to the other side", () => {
    expect(
      searchSenderLabel(
        { senderRole: "user", senderAdminId: null, senderName: null },
        admin,
        { user: "An nhỏ" },
      ),
    ).toBe("An nhỏ");
    expect(
      searchSenderLabel(
        { senderRole: "admin", senderAdminId: 2, senderName: "pt2" },
        { role: "user" },
        { pt: "Thầy Hoan" },
      ),
    ).toBe("Thầy Hoan");
    expect(
      searchSenderLabel(
        { senderRole: "admin", senderAdminId: 2, senderName: "pt2" },
        { role: "user" },
      ),
    ).toBe("pt2");
  });

  it("names a deleted PT", () => {
    expect(
      searchSenderLabel(
        { senderRole: "admin", senderAdminId: 9, senderName: null },
        { role: "user" },
      ),
    ).toBe("PT (đã xoá)");
  });
});

describe("formatResultTime", () => {
  const NOW = Date.parse("2026-11-07T10:00:00Z");

  it("shows day, month and time within the current year", () => {
    expect(formatResultTime("2026-10-05T11:32:00Z", NOW)).toBe("05/10 18:32");
  });

  it("adds the year for an earlier year", () => {
    expect(formatResultTime("2025-10-05T11:32:00Z", NOW)).toBe(
      "05/10/2025 18:32",
    );
  });
});
