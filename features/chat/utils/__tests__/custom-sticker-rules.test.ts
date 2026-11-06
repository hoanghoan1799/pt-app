import { describe, expect, it } from "vitest";

import {
  checkStickerImage,
  CUSTOM_STICKER_MAX_BYTES,
  fitWithin,
  parseCustomRef,
  parseCustomStickerId,
  sniffStickerMime,
} from "@/features/chat/utils/custom-sticker-rules";
import {
  stickerInputSchema,
  toChatSticker,
  toStoredSticker,
} from "@/features/chat/utils/sticker-rules";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const WEBP = [
  ...Array.from("RIFF").map((char) => char.charCodeAt(0)),
  1,
  2,
  3,
  4,
  ...Array.from("WEBPVP8 ").map((char) => char.charCodeAt(0)),
];

describe("sniffStickerMime", () => {
  it("reads PNG and WebP from the bytes", () => {
    expect(sniffStickerMime(new Uint8Array(PNG))).toBe("image/png");
    expect(sniffStickerMime(new Uint8Array(WEBP))).toBe("image/webp");
  });

  it.each([
    ["JPEG", [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["GIF", Array.from("GIF89a......").map((c) => c.charCodeAt(0))],
    ["SVG text", Array.from("<svg xmlns=...>").map((c) => c.charCodeAt(0))],
    [
      "a RIFF that is not WebP",
      Array.from("RIFF....WAVEfmt ").map((c) => c.charCodeAt(0)),
    ],
    ["too short", [0x89, 0x50]],
    ["empty", []],
  ])("rejects %s", (_name, bytes) => {
    expect(sniffStickerMime(new Uint8Array(bytes))).toBeNull();
  });
});

describe("checkStickerImage", () => {
  it("accepts a small PNG and reports its type", () => {
    expect(checkStickerImage(new Uint8Array(PNG))).toEqual({
      ok: true,
      mime: "image/png",
    });
  });

  it("rejects an empty body, an oversized image and unknown bytes", () => {
    const big = new Uint8Array(CUSTOM_STICKER_MAX_BYTES + 1);

    big.set(PNG);
    expect(checkStickerImage(new Uint8Array(0))).toEqual({
      ok: false,
      error: "empty",
    });
    expect(checkStickerImage(big)).toEqual({ ok: false, error: "too_large" });
    expect(checkStickerImage(new Uint8Array(40))).toEqual({
      ok: false,
      error: "bad_image",
    });
  });

  it("accepts exactly the size limit", () => {
    const edge = new Uint8Array(CUSTOM_STICKER_MAX_BYTES);

    edge.set(PNG);
    expect(checkStickerImage(edge).ok).toBe(true);
  });
});

describe("custom refs and ids", () => {
  it("parses custom:<id> and nothing else", () => {
    expect(parseCustomRef("custom:12")).toBe(12);
    for (const bad of [
      "custom:0",
      "custom:-1",
      "custom:1e3",
      "custom:",
      "pack:12",
      "custom:12x",
    ]) {
      expect(parseCustomRef(bad)).toBeNull();
    }
  });

  it("accepts plain positive integers as a path id", () => {
    expect(parseCustomStickerId("7")).toBe(7);
    for (const bad of [
      "0",
      "07",
      "1e3",
      "0x10",
      " 5",
      "-3",
      "",
      "9999999999999999",
    ]) {
      expect(parseCustomStickerId(bad)).toBeNull();
    }
  });
});

describe("fitWithin", () => {
  it("keeps the aspect ratio and never scales up", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 512, height: 384 });
    expect(fitWithin(300, 1200)).toEqual({ width: 128, height: 512 });
    expect(fitWithin(100, 80)).toEqual({ width: 100, height: 80 });
  });

  it("never returns a zero side", () => {
    expect(fitWithin(10000, 1).height).toBe(1);
  });
});

describe("custom sticker in the message schema", () => {
  it("accepts a customId and stores a ref with a serve-route URL", () => {
    const parsed = stickerInputSchema.parse({ customId: 5 });

    expect(toStoredSticker(parsed)).toEqual({
      stickerRef: "custom:5",
      stickerUrl: "/api/chat/stickers/custom/5",
    });
  });

  it.each([
    { customId: 0 },
    { customId: -2 },
    { customId: 1.5 },
    { customId: "5" },
    { customId: 5, url: "data:image/png;base64,AAAA" },
    { url: "data:image/png;base64,AAAA" },
  ])("rejects %j or drops what it does not know", (input) => {
    const result = stickerInputSchema.safeParse(input);

    if (result.success) {
      // Extra keys are stripped: a data URL can never reach the stored row.
      expect(result.data).toEqual({ customId: 5 });
    } else {
      expect(result.success).toBe(false);
    }
  });

  it("turns a stored row into a payload only when ref and url agree", () => {
    expect(toChatSticker("custom:5", "/api/chat/stickers/custom/5")).toEqual({
      kind: "custom",
      url: "/api/chat/stickers/custom/5",
      alt: "Sticker của tôi",
    });
    expect(toChatSticker("custom:5", "/api/chat/stickers/custom/6")).toBeNull();
    expect(toChatSticker("custom:5", "data:image/png;base64,AAAA")).toBeNull();
    expect(toChatSticker("custom:5", "https://evil.example/x.png")).toBeNull();
  });
});
