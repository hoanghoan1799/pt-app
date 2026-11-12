import { AVATAR_MAX_BYTES } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  avatarUrl,
  avatarVersion,
  decodeAvatarDataUrl,
  detectImageMime,
  encodeDataUrl,
} from "./image-rules.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_URL = `data:image/png;base64,${PNG_BASE64}`;

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_HEAD = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

const urlOf = (mime: string, bytes: number[]) =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

describe("detectImageMime", () => {
  it("reads PNG, JPEG and WebP from the first bytes", () => {
    expect(detectImageMime(Uint8Array.from(PNG_HEAD))).toBe("image/png");
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(detectImageMime(Uint8Array.from(WEBP_HEAD))).toBe("image/webp");
  });

  it("rejects GIF, SVG, HTML, RIFF without WEBP and short input", () => {
    const text = (value: string) => Uint8Array.from(Buffer.from(value));

    expect(detectImageMime(text("GIF89a"))).toBeNull();
    expect(detectImageMime(text("<svg xmlns='x'/>"))).toBeNull();
    expect(detectImageMime(text("<script>1</script>"))).toBeNull();
    expect(
      detectImageMime(Uint8Array.from([...WEBP_HEAD.slice(0, 8), 0x57, 0x41])),
    ).toBeNull();
    expect(detectImageMime(Uint8Array.from([0x89, 0x50]))).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
  });
});

describe("decodeAvatarDataUrl", () => {
  it("accepts a PNG data URL and returns the bytes", () => {
    const result = decodeAvatarDataUrl(PNG_URL);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/png");
      expect(result.bytes.toString("base64")).toBe(PNG_BASE64);
    }
  });

  it("accepts JPEG and WebP data URLs", () => {
    expect(
      decodeAvatarDataUrl(urlOf("image/jpeg", [0xff, 0xd8, 0xff, 1])).ok,
    ).toBe(true);
    expect(decodeAvatarDataUrl(urlOf("image/webp", WEBP_HEAD)).ok).toBe(true);
  });

  it("rejects a declared type the bytes contradict", () => {
    expect(
      decodeAvatarDataUrl(PNG_URL.replace("image/png", "image/jpeg")),
    ).toEqual({
      ok: false,
      reason: "format",
    });
  });

  it("rejects non-images dressed as images", () => {
    const html = urlOf("image/png", [...Buffer.from("<script>1</script>")]);

    expect(decodeAvatarDataUrl(html)).toEqual({ ok: false, reason: "format" });
  });

  it("rejects malformed input and unsupported types", () => {
    for (const bad of [
      "",
      "nope",
      "data:image/png;base64,",
      "data:image/png,abc",
      "data:image/png;base64,@@@",
      urlOf("image/gif", [0x47, 0x49, 0x46]),
    ]) {
      expect(decodeAvatarDataUrl(bad), bad).toEqual({
        ok: false,
        reason: "format",
      });
    }
  });

  it("accepts exactly 80 KB decoded and rejects one byte more as too large", () => {
    const body = (size: number) => [
      ...PNG_HEAD,
      ...new Array(size - PNG_HEAD.length).fill(1),
    ];

    expect(
      decodeAvatarDataUrl(urlOf("image/png", body(AVATAR_MAX_BYTES))).ok,
    ).toBe(true);
    expect(
      decodeAvatarDataUrl(urlOf("image/png", body(AVATAR_MAX_BYTES + 1))),
    ).toEqual({
      ok: false,
      reason: "too-large",
    });
  });
});

describe("avatar urls", () => {
  it("builds a versioned URL from whole seconds, or null without a photo", () => {
    const at = new Date(1_700_000_000_999);

    expect(avatarVersion(at)).toBe("1700000000");
    expect(avatarUrl("user", 5, at)).toBe("/v1/avatars/user/5?v=1700000000");
    expect(avatarUrl("admin", 2, at)).toBe("/v1/avatars/admin/2?v=1700000000");
    expect(avatarUrl("user", 5, null)).toBeNull();
    expect(avatarUrl("user", 5, undefined)).toBeNull();
  });

  it("round-trips through encodeDataUrl", () => {
    const decoded = decodeAvatarDataUrl(PNG_URL);

    expect(decoded.ok && encodeDataUrl(decoded.mime, decoded.bytes)).toBe(
      PNG_URL,
    );
  });
});
