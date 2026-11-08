import { describe, expect, it } from "vitest";

import {
  bubbleBox,
  chatPhotoUrl,
  checkPhoto,
  parsePhotoId,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_ROUNDS,
  PHOTO_MAX_SIDE,
  PHOTO_PREVIEW,
  PHOTO_QUALITIES,
  PHOTO_TARGET_BYTES,
  photoPreview,
  pickEncodedIndex,
  readImageSize,
  shrinkPhotoSize,
  sniffPhotoMime,
  toChatPhoto,
} from "@/features/chat/utils/photo-rules";

const ascii = (text: string) => Array.from(text).map((c) => c.charCodeAt(0));
const pad = (bytes: number[], length = 64) =>
  Uint8Array.from([
    ...bytes,
    ...new Array(Math.max(0, length - bytes.length)).fill(0),
  ]);
const be32 = (n: number) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

const pngBytes = (width: number, height: number) =>
  pad([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    ...ascii("IHDR"),
    ...be32(width),
    ...be32(height),
  ]);

// SOI, an APP0 segment to skip, then SOF0 (height before width).
const jpegBytes = (width: number, height: number) =>
  pad([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...be16(6),
    0,
    0,
    0,
    0,
    0xff,
    0xc0,
    ...be16(11),
    8,
    ...be16(height),
    ...be16(width),
    3,
    1,
    0x22,
    0,
  ]);

const riff = (chunk: string, payload: number[]) =>
  pad([
    ...ascii("RIFF"),
    0,
    0,
    0,
    0,
    ...ascii("WEBP"),
    ...ascii(chunk),
    0,
    0,
    0,
    0,
    ...payload,
  ]);

const webpLossy = (width: number, height: number) =>
  riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height)]);

const webpLossless = (width: number, height: number) => {
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0;

  return riff("VP8L", [
    0x2f,
    bits & 255,
    (bits >> 8) & 255,
    (bits >> 16) & 255,
    (bits >>> 24) & 255,
  ]);
};

const webpExtended = (width: number, height: number) =>
  riff("VP8X", [0, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]);

describe("sniffPhotoMime", () => {
  it("reads the type from the bytes", () => {
    expect(sniffPhotoMime(pngBytes(10, 10))).toBe("image/png");
    expect(sniffPhotoMime(jpegBytes(10, 10))).toBe("image/jpeg");
    expect(sniffPhotoMime(webpLossy(10, 10))).toBe("image/webp");
  });

  it("rejects GIF, SVG, HEIC and plain text", () => {
    expect(sniffPhotoMime(pad(ascii("GIF89a")))).toBeNull();
    expect(sniffPhotoMime(pad(ascii("<svg xmlns=")))).toBeNull();
    expect(
      sniffPhotoMime(pad([0, 0, 0, 0x18, ...ascii("ftypheic")])),
    ).toBeNull();
    expect(sniffPhotoMime(pad(ascii("hello")))).toBeNull();
  });
});

describe("readImageSize", () => {
  it("reads PNG, JPEG and the three WebP flavours", () => {
    expect(readImageSize(pngBytes(1200, 800), "image/png")).toEqual({
      width: 1200,
      height: 800,
    });
    expect(readImageSize(jpegBytes(1600, 900), "image/jpeg")).toEqual({
      width: 1600,
      height: 900,
    });
    expect(readImageSize(webpLossy(1000, 750), "image/webp")).toEqual({
      width: 1000,
      height: 750,
    });
    expect(readImageSize(webpLossless(321, 1599), "image/webp")).toEqual({
      width: 321,
      height: 1599,
    });
    expect(readImageSize(webpExtended(1600, 40), "image/webp")).toEqual({
      width: 1600,
      height: 40,
    });
  });

  it("returns null for a truncated or malformed header", () => {
    expect(
      readImageSize(Uint8Array.from([0x89, 0x50]), "image/png"),
    ).toBeNull();
    expect(
      readImageSize(Uint8Array.from([0xff, 0xd8, 0xff]), "image/jpeg"),
    ).toBeNull();
    expect(
      readImageSize(pad(ascii("RIFF....WEBPVP8 ")), "image/webp"),
    ).toBeNull();
  });
});

describe("checkPhoto", () => {
  it("accepts a photo within the limits and returns its type and size", () => {
    expect(checkPhoto(webpLossy(1600, 1067))).toEqual({
      ok: true,
      mime: "image/webp",
      width: 1600,
      height: 1067,
    });
    expect(checkPhoto(jpegBytes(800, 600))).toMatchObject({
      ok: true,
      mime: "image/jpeg",
    });
    expect(checkPhoto(pngBytes(1, 1))).toMatchObject({
      ok: true,
      mime: "image/png",
    });
  });

  it("rejects an empty body", () => {
    expect(checkPhoto(new Uint8Array(0))).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("rejects over the byte limit but allows exactly the limit", () => {
    const at = new Uint8Array(PHOTO_MAX_BYTES);

    at.set(pngBytes(100, 100));
    const over = new Uint8Array(PHOTO_MAX_BYTES + 1);

    over.set(pngBytes(100, 100));
    expect(checkPhoto(at).ok).toBe(true);
    expect(checkPhoto(over)).toEqual({ ok: false, error: "too_large" });
  });

  it("rejects a long side above 1600 px, on either side, and zero sizes", () => {
    expect(checkPhoto(pngBytes(PHOTO_MAX_SIDE + 1, 10))).toEqual({
      ok: false,
      error: "bad_image",
    });
    expect(checkPhoto(pngBytes(10, PHOTO_MAX_SIDE + 1))).toEqual({
      ok: false,
      error: "bad_image",
    });
    expect(checkPhoto(pngBytes(0, 10))).toEqual({
      ok: false,
      error: "bad_image",
    });
    expect(checkPhoto(pngBytes(PHOTO_MAX_SIDE, PHOTO_MAX_SIDE)).ok).toBe(true);
  });

  it("rejects other formats and images whose header cannot be read", () => {
    expect(checkPhoto(pad(ascii("GIF89a")))).toEqual({
      ok: false,
      error: "bad_image",
    });
    expect(checkPhoto(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({
      ok: false,
      error: "bad_image",
    });
  });
});

describe("ids, urls and payloads", () => {
  it("accepts only plain positive digit ids", () => {
    expect(parsePhotoId("42")).toBe(42);
    for (const bad of ["0", "-1", "1e3", "0x10", " 5", "abc", ""]) {
      expect(parsePhotoId(bad)).toBeNull();
    }
  });

  it("builds the payload from the id and stored size", () => {
    expect(chatPhotoUrl(7)).toBe("/api/chat/photos/7");
    expect(toChatPhoto(7, { width: 800, height: 600 })).toEqual({
      url: "/api/chat/photos/7",
      width: 800,
      height: 600,
      alt: "Ảnh trong tin nhắn",
    });
    expect(toChatPhoto(null, { width: 1, height: 1 })).toBeNull();
    expect(toChatPhoto(7, undefined)).toBeNull();
  });
});

describe("bubbleBox", () => {
  it("caps the width at 240 and keeps the aspect ratio", () => {
    expect(bubbleBox(1600, 1200)).toEqual({ width: 240, height: 180 });
    expect(bubbleBox(600, 1600)).toEqual({ width: 240, height: 640 });
  });

  it("never scales a small photo up", () => {
    expect(bubbleBox(100, 50)).toEqual({ width: 100, height: 50 });
  });
});

describe("photoPreview", () => {
  it("is just the label without a caption and prefixes a caption otherwise", () => {
    expect(photoPreview("")).toBe(PHOTO_PREVIEW);
    expect(photoPreview("  ")).toBe("📷 Ảnh");
    expect(photoPreview("bữa trưa")).toBe("📷 bữa trưa");
  });
});

describe("pickEncodedIndex", () => {
  const KB = 1024;

  it("keeps the first quality that reaches the 400 KB target", () => {
    expect(pickEncodedIndex([900 * KB, 380 * KB, 200 * KB])).toBe(1);
    expect(pickEncodedIndex([PHOTO_TARGET_BYTES])).toBe(0);
  });

  it("falls back to the smallest one under the hard limit", () => {
    expect(pickEncodedIndex([1400 * KB, 900 * KB, 700 * KB, 800 * KB])).toBe(2);
  });

  it("asks for a smaller picture when everything is over the hard limit", () => {
    expect(pickEncodedIndex([2000 * KB, 1800 * KB])).toBeNull();
    expect(pickEncodedIndex([])).toBeNull();
  });
});

describe("encoding plan", () => {
  it("lowers the quality step by step and shrinks by a fifth", () => {
    expect([...PHOTO_QUALITIES]).toEqual([...PHOTO_QUALITIES].sort().reverse());
    expect(PHOTO_QUALITIES).toHaveLength(5);
    expect(shrinkPhotoSize(1600, 1000)).toEqual({ width: 1280, height: 800 });
    expect(shrinkPhotoSize(1, 1)).toEqual({ width: 1, height: 1 });
  });

  it("shrinks enough rounds to bring a 1600 px photo well under the limit", () => {
    let size = { width: 1600, height: 1600 };

    for (let round = 1; round < PHOTO_MAX_ROUNDS; round += 1) {
      size = shrinkPhotoSize(size.width, size.height);
    }
    expect(size.width).toBeLessThan(900);
  });
});
