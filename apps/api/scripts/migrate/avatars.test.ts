import { describe, expect, it } from "vitest";

import {
  avatarToken,
  decodeSourceAvatar,
  isMovedColumn,
  movedAvatarOf,
} from "./avatars.js";
import { sha256Hex } from "./convert.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([1, 2, 3, 4]),
  Buffer.from("WEBPVP8 "),
]);
const url = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString("base64")}`;

describe("decodeSourceAvatar", () => {
  it("decodes a png and a webp data URL with the version in milliseconds", () => {
    const png = decodeSourceAvatar(url("image/png", PNG), 1_700_000_000);
    const webp = decodeSourceAvatar(url("image/webp", WEBP), 5);

    expect(png).toMatchObject({
      ok: true,
      avatar: { mime: "image/png", updatedAtMs: 1_700_000_000_000 },
    });
    expect(png.ok && Buffer.compare(png.avatar.bytes, PNG)).toBe(0);
    expect(webp.ok && webp.avatar.mime).toBe("image/webp");
  });

  it.each([
    ["not text", 5, "avatar is not text"],
    ["plain text", "hello", "not a base64 image data URL"],
    [
      "a non-image type",
      "data:text/html;base64,AAAA",
      "not a png, jpeg or webp image",
    ],
    [
      "a non-base64 payload",
      "data:image/png;base64,@@@@",
      "not a base64 image data URL",
    ],
    [
      "unpadded base64",
      url("image/png", PNG).replace(/=+$/, ""),
      "not valid base64",
    ],
    ["empty bytes", "data:image/png;base64,", "not a base64 image data URL"],
    [
      "a declared type that disagrees with the bytes",
      url("image/jpeg", PNG),
      "declares image/jpeg but its bytes are image/png",
    ],
    [
      "bytes that are not an image",
      url("image/png", Buffer.from("<script>")),
      "not a png, jpeg or webp image",
    ],
  ])("reports %s", (_name, value, problem) => {
    const result = decodeSourceAvatar(value as string | number, 1);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toContain(problem);
  });

  it("needs the version the avatar URL is built from, and never echoes the value", () => {
    const missing = decodeSourceAvatar(url("image/png", PNG), null);

    expect(!missing.ok && missing.problem).toMatch(/avatar_updated_at/);

    const bad = decodeSourceAvatar("data:image/png;base64,SECRET-@@", 1);

    expect(!bad.ok && bad.problem).not.toContain("SECRET");
  });

  it("refuses more than the avatar size limit", () => {
    const big = Buffer.concat([PNG, Buffer.alloc(100 * 1024)]);
    const result = decodeSourceAvatar(url("image/png", big), 1);

    expect(!result.ok && result.problem).toMatch(/allowed 1 to/);
  });
});

describe("moved columns and tokens", () => {
  it("knows which source columns moved", () => {
    expect(isMovedColumn("users", "avatar")).toBe(true);
    expect(isMovedColumn("admins", "avatar")).toBe(true);
    expect(isMovedColumn("users", "avatar_updated_at")).toBe(false);
    expect(isMovedColumn("chat_photos", "data")).toBe(false);
    expect(movedAvatarOf("admins")?.targetTable).toBe("admin_avatars");
  });

  it("changes the token when any part of the avatar changes", () => {
    const base = avatarToken(1, "image/png", PNG.length, PNG, 1000);

    expect(base).toBe(`1|image/png|${PNG.length}|${sha256Hex(PNG)}|1000`);
    expect(avatarToken(2, "image/png", PNG.length, PNG, 1000)).not.toBe(base);
    expect(avatarToken(1, "image/webp", PNG.length, PNG, 1000)).not.toBe(base);
    expect(avatarToken(1, "image/png", PNG.length, WEBP, 1000)).not.toBe(base);
    expect(avatarToken(1, "image/png", PNG.length, PNG, 2000)).not.toBe(base);
  });
});
