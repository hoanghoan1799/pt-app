// Profile photos (KAN-157). The browser crops to a 256x256 square and encodes
// WebP/JPEG at ~0.8; the server only trusts what survives these checks.

export const AVATAR_SIZE_PX = 256;
export const AVATAR_QUALITY = 0.8;
// Decoded image bytes. A 256x256 photo at q0.8 is ~15-30 KB; this is headroom.
export const AVATAR_MAX_BYTES = 80 * 1024;
// base64 is 4/3 larger, plus the "data:image/webp;base64," prefix.
export const AVATAR_MAX_DATA_URL_LENGTH =
  Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 64;

export const AVATAR_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

export type AvatarMime = (typeof AVATAR_MIME_TYPES)[number];
export type AvatarKind = "user" | "admin";

export const isAvatarKind = (value: unknown): value is AvatarKind =>
  value === "user" || value === "admin";

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

export type AvatarDecodeResult =
  | { ok: true; mime: AvatarMime; bytes: Uint8Array }
  | { ok: false; reason: "format" | "too-large" };

const DATA_URL_PATTERN =
  /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

// Parses "data:image/...;base64,...", checks the size and the magic bytes.
export const decodeAvatarDataUrl = (dataUrl: string): AvatarDecodeResult => {
  if (dataUrl.length > AVATAR_MAX_DATA_URL_LENGTH) {
    return { ok: false, reason: "too-large" };
  }
  const match = DATA_URL_PATTERN.exec(dataUrl);

  if (!match) {
    return { ok: false, reason: "format" };
  }
  const bytes = new Uint8Array(Buffer.from(match[2], "base64"));

  if (bytes.length === 0) {
    return { ok: false, reason: "format" };
  }
  if (bytes.length > AVATAR_MAX_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  const mime = detectImageMime(bytes);

  // The declared type must agree with the bytes.
  if (mime === null || mime !== match[1]) {
    return { ok: false, reason: "format" };
  }
  return { ok: true, mime, bytes };
};

// The versioned URL payloads carry instead of the image itself. Null when
// there is no photo.
export const avatarUrl = (
  kind: AvatarKind,
  id: number,
  updatedAt: Date | null | undefined,
): string | null =>
  updatedAt
    ? `/api/avatar/${kind}/${id}?v=${Math.floor(updatedAt.getTime() / 1000)}`
    : null;

// Key of the thread's avatar map, same shape as nickname targets.
export const avatarKey = (kind: AvatarKind, id: number | null) =>
  kind === "user" ? "user" : `admin:${id}`;
