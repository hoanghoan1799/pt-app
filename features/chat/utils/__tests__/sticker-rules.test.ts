import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findBundledSticker,
  STICKER_GROUPS,
  STICKER_PACK_ID,
} from "@/features/chat/constants/stickers";
import { sendMessageSchema } from "@/features/chat/utils/chat-rules";
import {
  isGiphyMediaUrl,
  stickerInputSchema,
  toChatSticker,
  toStoredSticker,
} from "@/features/chat/utils/sticker-rules";

const GIPHY_URL = "https://media2.giphy.com/media/abc123XYZ/200w.gif";
const CLIENT_ID = "00000000-0000-4000-8000-000000000001";

describe("bundled manifest", () => {
  const all = STICKER_GROUPS.flatMap((group) => group.stickers);
  const dir = path.join(process.cwd(), "public", "stickers", STICKER_PACK_ID);

  it("has 24 to 32 stickers in three groups with unique ids", () => {
    expect(STICKER_GROUPS.map((group) => group.label)).toEqual([
      "Tập luyện",
      "Ăn uống",
      "Cảm xúc",
    ]);
    expect(all.length).toBeGreaterThanOrEqual(24);
    expect(all.length).toBeLessThanOrEqual(32);
    expect(new Set(all.map((sticker) => sticker.id)).size).toBe(all.length);
  });

  it("has a file for every sticker, the licence, and stays under 1.5 MB", () => {
    const files = readdirSync(dir);

    for (const sticker of all) {
      expect(files).toContain(`${sticker.id}.svg`);
    }
    expect(files).toContain("LICENSE");
    const total = files.reduce(
      (sum, file) => sum + statSync(path.join(dir, file)).size,
      0,
    );

    expect(total).toBeLessThan(1.5 * 1024 * 1024);
  });

  it("looks up own properties only", () => {
    expect(findBundledSticker(STICKER_PACK_ID, "fire")).toMatchObject({
      url: "/stickers/fluent/fire.svg",
    });
    expect(findBundledSticker("constructor", "fire")).toBeNull();
    expect(findBundledSticker(STICKER_PACK_ID, "__proto__")).toBeNull();
    expect(findBundledSticker(STICKER_PACK_ID, "toString")).toBeNull();
  });
});

describe("isGiphyMediaUrl", () => {
  it.each([
    "https://media.giphy.com/media/abc/giphy.gif",
    "https://media0.giphy.com/media/abc/giphy.gif",
    "https://media12.giphy.com/media/abc/giphy.webp",
  ])("accepts %s", (url) => {
    expect(isGiphyMediaUrl(url)).toBe(true);
  });

  it.each([
    "http://media.giphy.com/media/abc/giphy.gif",
    "https://giphy.com/stickers/abc",
    "https://i.giphy.com/abc.gif",
    "https://media.giphy.com.evil.com/abc.gif",
    "https://evilmedia.giphy.com/abc.gif",
    "https://media.giphy.com@evil.com/abc.gif",
    "https://user:pw@media.giphy.com/abc.gif",
    "https://media.giphy.com:8443/abc.gif",
    "https://example.com/abc.gif",
    "javascript:alert(1)",
    "data:image/gif;base64,AAAA",
    "//media.giphy.com/abc.gif",
    "not a url",
    "",
    `https://media.giphy.com/${"a".repeat(600)}`,
  ])("rejects %s", (url) => {
    expect(isGiphyMediaUrl(url)).toBe(false);
  });
});

describe("stickerInputSchema", () => {
  it("accepts a manifest sticker", () => {
    expect(
      stickerInputSchema.safeParse({ pack: "fluent", id: "trophy" }).success,
    ).toBe(true);
  });

  it.each([
    { pack: "fluent", id: "nope" },
    { pack: "other", id: "trophy" },
    { pack: "fluent", id: "../../etc/passwd" },
    { pack: "fluent" },
    { id: "trophy" },
    {},
    null,
    "trophy",
  ])("rejects a bad bundled sticker %j", (input) => {
    expect(stickerInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts a GIPHY sticker whose id is in the URL path", () => {
    expect(
      stickerInputSchema.safeParse({ giphyId: "abc123XYZ", url: GIPHY_URL })
        .success,
    ).toBe(true);
  });

  it.each([
    { giphyId: "abc123XYZ", url: "https://example.com/media/abc123XYZ/a.gif" },
    {
      giphyId: "abc123XYZ",
      url: "http://media.giphy.com/media/abc123XYZ/a.gif",
    },
    { giphyId: "otherId1", url: GIPHY_URL },
    { giphyId: "bad id!", url: GIPHY_URL },
    { giphyId: "abc123XYZ" },
    { url: GIPHY_URL },
  ])("rejects a bad GIPHY sticker %j", (input) => {
    expect(stickerInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("takes text or a sticker, never both and never neither", () => {
    const sticker = { pack: "fluent", id: "fire" };

    expect(
      sendMessageSchema.safeParse({ body: "hi", clientId: CLIENT_ID }).success,
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({ sticker, clientId: CLIENT_ID }).success,
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({ body: "hi", sticker, clientId: CLIENT_ID })
        .success,
    ).toBe(false);
    expect(sendMessageSchema.safeParse({ clientId: CLIENT_ID }).success).toBe(
      false,
    );
    expect(
      sendMessageSchema.safeParse({ body: "  ", clientId: CLIENT_ID }).success,
    ).toBe(false);
  });
});

describe("stored sticker round trip", () => {
  it("stores a bundled sticker as pack:<id> with its bundled path", () => {
    const stored = toStoredSticker({ pack: "fluent", id: "trophy" });

    expect(stored).toEqual({
      stickerRef: "pack:trophy",
      stickerUrl: "/stickers/fluent/trophy.svg",
    });
    expect(toChatSticker(stored.stickerRef, stored.stickerUrl)).toEqual({
      kind: "pack",
      url: "/stickers/fluent/trophy.svg",
      alt: "Cúp",
    });
  });

  it("stores a GIPHY sticker as giphy:<id> with its media URL", () => {
    const stored = toStoredSticker({ giphyId: "abc123XYZ", url: GIPHY_URL });

    expect(stored).toEqual({
      stickerRef: "giphy:abc123XYZ",
      stickerUrl: GIPHY_URL,
    });
    expect(toChatSticker(stored.stickerRef, stored.stickerUrl)).toMatchObject({
      kind: "giphy",
      url: GIPHY_URL,
    });
  });

  it("drops rows that fail the checks and plain text rows", () => {
    expect(toChatSticker(null, null)).toBeNull();
    expect(toChatSticker("giphy:x1y2z3", "https://evil.com/a.gif")).toBeNull();
    expect(
      toChatSticker("pack:trophy", "/stickers/fluent/fire.svg"),
    ).toBeNull();
    expect(toChatSticker("pack:nope", "/stickers/fluent/nope.svg")).toBeNull();
    expect(toChatSticker("weird:1", GIPHY_URL)).toBeNull();
  });
});
