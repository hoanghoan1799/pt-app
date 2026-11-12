import { SOCIAL_PHOTO_MAX_SIDE } from "@pt/contracts";

// Photos: the type and the size come from the bytes, never from the client's
// Content-Type or numbers. Ported from the web's chat photo-rules.

export type PhotoMime = "image/webp" | "image/jpeg" | "image/png";
export type ImageSize = { width: number; height: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;

const hasAscii = (bytes: Uint8Array, start: number, text: string) =>
  Array.from(text).every(
    (char, index) => bytes[start + index] === char.charCodeAt(0),
  );

const u16be = (bytes: Uint8Array, at: number) =>
  (bytes[at] << 8) | bytes[at + 1];
const u16le = (bytes: Uint8Array, at: number) =>
  bytes[at] | (bytes[at + 1] << 8);
const u32be = (bytes: Uint8Array, at: number) =>
  ((bytes[at] << 24) |
    (bytes[at + 1] << 16) |
    (bytes[at + 2] << 8) |
    bytes[at + 3]) >>>
  0;

export const sniffPhotoMime = (bytes: Uint8Array): PhotoMime | null => {
  if (
    bytes.length > PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length > 12 &&
    hasAscii(bytes, 0, "RIFF") &&
    hasAscii(bytes, 8, "WEBP")
  ) {
    return "image/webp";
  }
  return null;
};

const pngSize = (bytes: Uint8Array): ImageSize | null =>
  bytes.length >= 24 && hasAscii(bytes, 12, "IHDR")
    ? { width: u32be(bytes, 16), height: u32be(bytes, 20) }
    : null;

// Start-of-frame markers carry the size; C4, C8 and CC share the range but are
// not frames.
const isFrameMarker = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

const jpegSize = (bytes: Uint8Array): ImageSize | null => {
  let at = 2;

  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1];

    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2;
      continue;
    }
    const length = u16be(bytes, at + 2);

    if (isFrameMarker(marker)) {
      return at + 9 <= bytes.length
        ? { width: u16be(bytes, at + 7), height: u16be(bytes, at + 5) }
        : null;
    }
    if (length < 2) {
      return null;
    }
    at += 2 + length;
  }
  return null;
};

const webpSize = (bytes: Uint8Array): ImageSize | null => {
  if (bytes.length < 30) {
    return null;
  }
  if (hasAscii(bytes, 12, "VP8 ")) {
    const isFrame =
      bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a;

    return isFrame
      ? {
          width: u16le(bytes, 26) & 0x3fff,
          height: u16le(bytes, 28) & 0x3fff,
        }
      : null;
  }
  if (hasAscii(bytes, 12, "VP8L")) {
    if (bytes[20] !== 0x2f) {
      return null;
    }
    const bits =
      (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>>
      0;

    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  if (hasAscii(bytes, 12, "VP8X")) {
    return {
      width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
    };
  }
  return null;
};

export const readImageSize = (
  bytes: Uint8Array,
  mime: PhotoMime,
): ImageSize | null => {
  if (mime === "image/png") {
    return pngSize(bytes);
  }
  return mime === "image/jpeg" ? jpegSize(bytes) : webpSize(bytes);
};

export type PhotoCheck =
  | ({ ok: true; mime: PhotoMime } & ImageSize)
  | { ok: false; error: "empty" | "too_large" | "bad_image" };

export const checkPhoto = (bytes: Uint8Array): PhotoCheck => {
  if (bytes.length === 0) {
    return { ok: false, error: "empty" };
  }
  if (bytes.length > PHOTO_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }
  const mime = sniffPhotoMime(bytes);
  const size = mime ? readImageSize(bytes, mime) : null;

  if (
    !mime ||
    !size ||
    size.width < 1 ||
    size.height < 1 ||
    Math.max(size.width, size.height) > SOCIAL_PHOTO_MAX_SIDE
  ) {
    return { ok: false, error: "bad_image" };
  }
  return { ok: true, mime, ...size };
};
