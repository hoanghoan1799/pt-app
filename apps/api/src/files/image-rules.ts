import {
  AVATAR_MAX_BYTES,
  AVATAR_MAX_DATA_URL_LENGTH,
  type AvatarMime,
} from "@pt/contracts";

// The type comes from the first bytes, never from what the client claims.
export const detectImageMime = (bytes: Uint8Array): AvatarMime | null => {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith([0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // RIFF....WEBP
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
};

export type ImageDecodeResult =
  | { ok: true; mime: AvatarMime; bytes: Buffer }
  | { ok: false; reason: "format" | "too-large" };

const DATA_URL_PATTERN =
  /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

// Parses "data:image/...;base64,...", checks the size and the magic bytes. The
// declared type must agree with the bytes.
export const decodeAvatarDataUrl = (dataUrl: string): ImageDecodeResult => {
  if (dataUrl.length > AVATAR_MAX_DATA_URL_LENGTH) {
    return { ok: false, reason: "too-large" };
  }
  const match = DATA_URL_PATTERN.exec(dataUrl);

  if (!match) {
    return { ok: false, reason: "format" };
  }
  const bytes = Buffer.from(match[2], "base64");

  if (bytes.length === 0) {
    return { ok: false, reason: "format" };
  }
  if (bytes.length > AVATAR_MAX_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  const mime = detectImageMime(bytes);

  if (mime === null || mime !== match[1]) {
    return { ok: false, reason: "format" };
  }
  return { ok: true, mime, bytes };
};

export const encodeDataUrl = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

// Versioned URL the payloads carry instead of the image; null without a photo.
// The version is the upload time in whole seconds.
export const avatarVersion = (updatedAt: Date) =>
  String(Math.floor(updatedAt.getTime() / 1000));

export const avatarUrl = (
  kind: "user" | "admin",
  id: number,
  updatedAt: Date | null | undefined,
): string | null =>
  updatedAt ? `/v1/avatars/${kind}/${id}?v=${avatarVersion(updatedAt)}` : null;
