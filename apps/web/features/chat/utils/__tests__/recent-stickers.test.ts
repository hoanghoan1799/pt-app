import { describe, expect, it } from "vitest";

import {
  addRecentSticker,
  parseRecentStickers,
  RECENT_STICKERS_MAX,
  type RecentSticker,
  recentStickerView,
} from "@/features/chat/utils/recent-stickers";

const fire: RecentSticker = { kind: "pack", pack: "fluent", id: "fire" };
const trophy: RecentSticker = { kind: "pack", pack: "fluent", id: "trophy" };
const giphy = (giphyId: string): RecentSticker => ({
  kind: "giphy",
  giphyId,
  url: `https://media2.giphy.com/media/${giphyId}/200w.gif`,
  alt: "Sticker GIPHY",
});

describe("addRecentSticker", () => {
  it("puts the newest first", () => {
    expect(addRecentSticker([fire], trophy)).toEqual([trophy, fire]);
  });

  it("moves a repeat to the front without duplicating it", () => {
    expect(addRecentSticker([fire, trophy], trophy)).toEqual([trophy, fire]);
  });

  it("dedupes GIPHY stickers by id", () => {
    expect(addRecentSticker([giphy("abc123"), fire], giphy("abc123"))).toEqual([
      giphy("abc123"),
      fire,
    ]);
  });

  it("keeps only the last 16", () => {
    const full = Array.from({ length: RECENT_STICKERS_MAX }, (_, index) =>
      giphy(`id${index}abc`),
    );
    const next = addRecentSticker(full, fire);

    expect(next).toHaveLength(RECENT_STICKERS_MAX);
    expect(next[0]).toEqual(fire);
    expect(next.at(-1)).toEqual(full[RECENT_STICKERS_MAX - 2]);
  });
});

describe("parseRecentStickers", () => {
  it("returns an empty list for missing or broken input", () => {
    expect(parseRecentStickers(null)).toEqual([]);
    expect(parseRecentStickers("")).toEqual([]);
    expect(parseRecentStickers("{not json")).toEqual([]);
    expect(parseRecentStickers('{"kind":"pack"}')).toEqual([]);
  });

  it("round-trips a valid list", () => {
    const list = [giphy("abc123"), fire];

    expect(parseRecentStickers(JSON.stringify(list))).toEqual(list);
  });

  it("drops unknown stickers, foreign URLs and junk entries", () => {
    const raw = JSON.stringify([
      { kind: "pack", pack: "fluent", id: "no-such-sticker" },
      { kind: "pack", pack: "nope", id: "fire" },
      { ...giphy("abc123"), url: "https://evil.example/abc123.gif" },
      { kind: "giphy", giphyId: 5 },
      null,
      "text",
      trophy,
    ]);

    expect(parseRecentStickers(raw)).toEqual([trophy]);
  });

  it("removes duplicates and caps the length", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      giphy(`id${index}abc`),
    );

    expect(parseRecentStickers(JSON.stringify([fire, fire]))).toEqual([fire]);
    expect(parseRecentStickers(JSON.stringify(many))).toHaveLength(
      RECENT_STICKERS_MAX,
    );
  });
});

describe("recentStickerView", () => {
  it("gives the bundled url and alt, and the GIPHY ones as stored", () => {
    expect(recentStickerView(fire)).toEqual({
      url: "/stickers/fluent/fire.svg",
      alt: "Lửa",
    });
    expect(recentStickerView(giphy("abc123"))).toEqual({
      url: "https://media2.giphy.com/media/abc123/200w.gif",
      alt: "Sticker GIPHY",
    });
  });
});
