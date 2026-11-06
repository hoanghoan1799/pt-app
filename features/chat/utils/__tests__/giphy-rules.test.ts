import { describe, expect, it } from "vitest";

import {
  createRateLimiter,
  createTtlCache,
  mapGiphyResponse,
  normalizeGiphyQuery,
} from "@/features/chat/utils/giphy-rules";

const item = (id: string, url: string, small = url) => ({
  id,
  title: " Great job ",
  images: { fixed_width: { url }, fixed_width_small: { url: small } },
});

describe("normalizeGiphyQuery", () => {
  it("collapses whitespace; empty and missing mean trending", () => {
    expect(normalizeGiphyQuery("  gym   time ")).toBe("gym time");
    expect(normalizeGiphyQuery("")).toBe("");
    expect(normalizeGiphyQuery(null)).toBe("");
    expect(normalizeGiphyQuery("a\u0000b")).toBe("a b");
  });

  it("rejects a query over 50 characters", () => {
    expect(normalizeGiphyQuery("a".repeat(50))).toBe("a".repeat(50));
    expect(normalizeGiphyQuery("a".repeat(51))).toBeNull();
  });
});

describe("mapGiphyResponse", () => {
  it("keeps id, urls and a trimmed title", () => {
    const url = "https://media1.giphy.com/media/abc123/200w.gif";

    expect(mapGiphyResponse({ data: [item("abc123", url)] })).toEqual([
      { giphyId: "abc123", url, previewUrl: url, alt: "Great job" },
    ]);
  });

  it("drops items with a foreign host or a bad id, and survives junk", () => {
    const ok = "https://media1.giphy.com/media/good1/200w.gif";
    const result = mapGiphyResponse({
      data: [
        item("evil1", "https://evil.com/a.gif"),
        item("bad id", ok),
        item("good1", ok, "http://media1.giphy.com/s.gif"),
        item("good2", ok),
        null,
        {},
      ],
    });

    expect(result.map((sticker) => sticker.giphyId)).toEqual(["good2"]);
    expect(mapGiphyResponse(null)).toEqual([]);
    expect(mapGiphyResponse({ data: "x" })).toEqual([]);
  });
});

describe("createRateLimiter", () => {
  it("allows the limit per key per window, then resets", () => {
    let time = 0;
    const allow = createRateLimiter(2, 1000, () => time);

    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    expect(allow("b")).toBe(true);
    time = 1000;
    expect(allow("a")).toBe(true);
  });
});

describe("createTtlCache", () => {
  it("expires entries and evicts the oldest past the cap", () => {
    let time = 0;
    const cache = createTtlCache<number>(100, 2, () => time);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    time = 100;
    expect(cache.get("c")).toBeUndefined();
  });
});
