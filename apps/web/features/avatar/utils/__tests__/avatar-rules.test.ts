import { describe, expect, it } from "vitest";

import {
  AVATAR_MAX_BYTES,
  avatarKey,
  avatarUrl,
  decodeAvatarDataUrl,
  detectImageMime,
  isAvatarKind,
} from "@/features/avatar/utils/avatar-rules";
import { squareCrop } from "@/features/avatar/utils/resize-avatar";

// A real 1x1 PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_URL = `data:image/png;base64,${PNG_BASE64}`;

const toBase64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const WEBP_BYTES = [
  ...Array.from("RIFF", (c) => c.charCodeAt(0)),
  0x10,
  0,
  0,
  0,
  ...Array.from("WEBP", (c) => c.charCodeAt(0)),
];

describe("detectImageMime", () => {
  it("reads PNG, JPEG and WebP from the first bytes", () => {
    expect(detectImageMime(Buffer.from(PNG_BASE64, "base64"))).toBe(
      "image/png",
    );
    expect(detectImageMime(new Uint8Array(JPEG_BYTES))).toBe("image/jpeg");
    expect(detectImageMime(new Uint8Array(WEBP_BYTES))).toBe("image/webp");
  });

  it("rejects GIF, SVG, HTML and short input", () => {
    expect(detectImageMime(Buffer.from("GIF89a....."))).toBeNull();
    expect(detectImageMime(Buffer.from("<svg xmlns=''></svg>"))).toBeNull();
    expect(detectImageMime(Buffer.from("<html>"))).toBeNull();
    expect(detectImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // RIFF without the WEBP tag (e.g. WAV).
    expect(
      detectImageMime(
        new Uint8Array([
          ...Array.from("RIFF", (c) => c.charCodeAt(0)),
          0,
          0,
          0,
          0,
          ...Array.from("WAVE", (c) => c.charCodeAt(0)),
        ]),
      ),
    ).toBeNull();
  });
});

describe("decodeAvatarDataUrl", () => {
  it("accepts a PNG data URL", () => {
    const result = decodeAvatarDataUrl(PNG_URL);

    expect(result).toMatchObject({ ok: true, mime: "image/png" });
  });

  it("accepts JPEG and WebP data URLs", () => {
    expect(
      decodeAvatarDataUrl(`data:image/jpeg;base64,${toBase64(JPEG_BYTES)}`),
    ).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(
      decodeAvatarDataUrl(`data:image/webp;base64,${toBase64(WEBP_BYTES)}`),
    ).toMatchObject({ ok: true, mime: "image/webp" });
  });

  it("rejects a declared type that the bytes contradict", () => {
    expect(decodeAvatarDataUrl(`data:image/jpeg;base64,${PNG_BASE64}`)).toEqual(
      { ok: false, reason: "format" },
    );
  });

  it("rejects non-images dressed as images (magic bytes, not the label)", () => {
    const html = Buffer.from("<script>alert(1)</script>").toString("base64");

    expect(decodeAvatarDataUrl(`data:image/png;base64,${html}`)).toEqual({
      ok: false,
      reason: "format",
    });
  });

  it("rejects malformed input and unsupported types", () => {
    for (const bad of [
      "",
      "not a data url",
      "data:image/png;base64,",
      `data:image/png,${PNG_BASE64}`,
      `data:image/svg+xml;base64,${PNG_BASE64}`,
      `data:image/gif;base64,${PNG_BASE64}`,
      "data:image/png;base64,@@@",
    ]) {
      expect(decodeAvatarDataUrl(bad), bad).toMatchObject({ ok: false });
    }
  });

  it("rejects more than 80 KB decoded and accepts exactly 80 KB", () => {
    const body = (length: number) =>
      toBase64([
        ...JPEG_BYTES,
        ...new Array(length - JPEG_BYTES.length).fill(1),
      ]);

    expect(
      decodeAvatarDataUrl(
        `data:image/jpeg;base64,${body(AVATAR_MAX_BYTES + 1)}`,
      ),
    ).toEqual({ ok: false, reason: "too-large" });
    expect(
      decodeAvatarDataUrl(`data:image/jpeg;base64,${body(AVATAR_MAX_BYTES)}`),
    ).toMatchObject({ ok: true });
  });
});

describe("avatar urls and keys", () => {
  it("builds a versioned URL from whole seconds, or null without a photo", () => {
    expect(avatarUrl("user", 7, new Date(1_793_953_327_000))).toBe(
      "/api/avatar/user/7?v=1793953327",
    );
    expect(avatarUrl("admin", 2, null)).toBeNull();
    expect(avatarUrl("admin", 2, undefined)).toBeNull();
  });

  it("keys the thread map like nicknames", () => {
    expect(avatarKey("user", 3)).toBe("user");
    expect(avatarKey("admin", 3)).toBe("admin:3");
  });

  it("knows the two kinds", () => {
    expect(isAvatarKind("user")).toBe(true);
    expect(isAvatarKind("admin")).toBe(true);
    expect(isAvatarKind("root")).toBe(false);
  });
});

describe("squareCrop", () => {
  it("centres the square on a landscape image", () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 });
  });

  it("centres the square on a portrait image", () => {
    expect(squareCrop(200, 301)).toEqual({ sx: 0, sy: 50, side: 200 });
  });

  it("keeps a square as it is", () => {
    expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });
});
