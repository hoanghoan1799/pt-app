import { describe, expect, it } from "vitest";

import { STICKER_KEYWORDS } from "@/features/chat/constants/sticker-keywords";
import { STICKER_GROUPS } from "@/features/chat/constants/stickers";
import {
  getGiphySuggestQuery,
  getSuggestQuery,
  matchStickerSuggestions,
  normalizeSuggestText,
} from "@/features/chat/utils/sticker-suggestions";

const ids = (text: string, locale = "vi", recent: string[] = []) =>
  matchStickerSuggestions(text, locale, recent).map((sticker) => sticker.id);

describe("normalizeSuggestText", () => {
  it("lowercases, strips diacritics and maps đ", () => {
    expect(normalizeSuggestText("  Cố LÊN!! ")).toBe("co len");
    expect(normalizeSuggestText("Đói quá, đi")).toBe("doi qua di");
  });

  it("turns punctuation into single spaces", () => {
    expect(normalizeSuggestText("ok...nhé?!")).toBe("ok nhe");
  });
});

describe("keyword table", () => {
  it("has an entry for every bundled sticker", () => {
    const bundled = STICKER_GROUPS.flatMap((group) =>
      group.stickers.map((sticker) => sticker.id),
    );

    expect(Object.keys(STICKER_KEYWORDS).sort()).toEqual([...bundled].sort());
  });
});

describe("eligibility", () => {
  it("rejects empty text, a leading slash, and long text", () => {
    expect(getSuggestQuery("   ")).toBeNull();
    expect(getSuggestQuery("/imlang gym")).toBeNull();
    expect(getSuggestQuery("một hai ba bốn năm")).toBeNull();
    expect(getSuggestQuery("a".repeat(31))).toBeNull();
    expect(ids("cố lên nào các bạn ơi")).toEqual([]);
    expect(ids(`gym ${"x".repeat(30)}`)).toEqual([]);
    expect(ids("/gym")).toEqual([]);
  });

  it("accepts exactly 4 words and exactly 30 characters", () => {
    expect(getSuggestQuery("một hai ba bốn")).not.toBeNull();
    expect(getSuggestQuery("a".repeat(30))).not.toBeNull();
  });

  it("asks GIPHY only for text of 2+ normalized characters, never emoji", () => {
    expect(getGiphySuggestQuery("  cố   lên ")).toBe("cố lên");
    expect(getGiphySuggestQuery("a")).toBeNull();
    expect(getGiphySuggestQuery("💪")).toBeNull();
    expect(getGiphySuggestQuery("/gym")).toBeNull();
    expect(getGiphySuggestQuery("một hai ba bốn năm")).toBeNull();
  });
});

describe("matchStickerSuggestions", () => {
  it("ignores diacritics: cố lên == co len", () => {
    // exact "co len" (biceps) first, then the contained word "len" (rocket)
    expect(ids("cố lên")).toEqual(["flexed-biceps", "rocket"]);
    expect(ids("co len")).toEqual(["flexed-biceps", "rocket"]);
  });

  it("maps đ to d", () => {
    expect(ids("đói quá")).toEqual(["loudly-crying-face"]);
  });

  it("matches emoji-only text by emoji, ignoring variation selectors", () => {
    expect(ids("💪")).toEqual(["flexed-biceps"]);
    expect(ids("❤")).toEqual(["red-heart"]);
    expect(ids("❤️")).toEqual(["red-heart"]);
    expect(ids("🏋️")).toEqual(["person-lifting-weights"]);
  });

  it("returns nothing for unknown text", () => {
    expect(ids("zzqx")).toEqual([]);
    expect(ids("🦖")).toEqual([]);
  });

  it("needs 3+ characters for a prefix match", () => {
    expect(ids("run")).toContain("running-shoe");
    expect(ids("runn")).toEqual(["running-shoe"]);
    // "ru" would prefix "run" but is too short.
    expect(ids("ru")).toEqual([]);
    // a prefix works on the last word of longer text
    expect(ids("di runn")).toEqual(["running-shoe"]);
  });

  it("does not prefix-match multi-word keywords", () => {
    // "eat clean" is a two-word keyword; "eat" alone must not reach it.
    expect(ids("eat")).not.toContain("green-salad");
  });

  it("ranks an exact keyword above a contained one", () => {
    // Exact (3) beats contained (2), whatever the pack order.
    // "yeu" is an exact keyword of both hearts: a tie, so pack order decides.
    expect(ids("yeu")).toEqual(["smiling-face-with-hearts", "red-heart"]);
    // "thuong qua" equals a red-heart keyword and contains smiling's "thuong".
    expect(ids("thuong qua")).toEqual([
      "red-heart",
      "smiling-face-with-hearts",
    ]);
  });

  it("boosts recently used stickers within the same score", () => {
    expect(ids("yeu")).toEqual(["smiling-face-with-hearts", "red-heart"]);
    expect(ids("yeu", "vi", ["red-heart"])).toEqual([
      "red-heart",
      "smiling-face-with-hearts",
    ]);
  });

  it("never lets a recent boost beat a higher score", () => {
    // "thuong qua": red-heart exact (3); smiling contained (2). Boosting the
    // lower-scored sticker must not overtake.
    expect(ids("thuong qua", "vi", ["smiling-face-with-hearts"])).toEqual([
      "red-heart",
      "smiling-face-with-hearts",
    ]);
  });

  it("matches Chinese keywords for the zh locale", () => {
    expect(ids("加油", "zh")).toEqual(["flexed-biceps"]);
    expect(ids("加油啊", "zh")).toEqual(["flexed-biceps"]);
    expect(ids("谢谢", "zh")).toEqual(["folded-hands"]);
  });

  it("does not match Chinese keywords outside the zh locale", () => {
    expect(ids("谢谢", "vi")).toEqual([]);
    expect(ids("谢谢", "en")).toEqual([]);
  });

  it("matches English keywords for the vi locale", () => {
    expect(ids("ok", "vi")).toEqual(["thumbs-up"]);
    expect(ids("love", "vi")).toEqual([
      "smiling-face-with-hearts",
      "red-heart",
    ]);
  });

  it("does not match Vietnamese-only keywords for the en locale", () => {
    expect(ids("cam on", "en")).toEqual([]);
    expect(ids("cam on", "vi")).toEqual(["folded-hands"]);
  });
});
