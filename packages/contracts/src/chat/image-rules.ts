import {
  CHAT_PHOTO_MAX_BYTES,
  CHAT_PHOTO_MAX_SIDE,
  type ChatPhotoMime,
  STICKER_CUSTOM_MAX_BYTES,
  type StickerCustomMime,
} from "./constants.js";

// Image checks that read the bytes, never the client's Content-Type.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

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

export const chatSniffPhotoMime = (bytes: Uint8Array): ChatPhotoMime | null => {
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

export type ChatImageSize = { width: number; height: number };

const pngSize = (bytes: Uint8Array): ChatImageSize | null =>
  bytes.length >= 24 && hasAscii(bytes, 12, "IHDR")
    ? { width: u32be(bytes, 16), height: u32be(bytes, 20) }
    : null;

// Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) share
// the range but are not frames.
const isFrameMarker = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

const jpegSize = (bytes: Uint8Array): ChatImageSize | null => {
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

const webpSize = (bytes: Uint8Array): ChatImageSize | null => {
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

// Reads the pixel size from the image header; null when it cannot be read.
export const chatReadImageSize = (
  bytes: Uint8Array,
  mime: ChatPhotoMime,
): ChatImageSize | null => {
  if (mime === "image/png") {
    return pngSize(bytes);
  }
  return mime === "image/jpeg" ? jpegSize(bytes) : webpSize(bytes);
};

export type ChatPhotoCheck =
  | ({ ok: true; mime: ChatPhotoMime } & ChatImageSize)
  | { ok: false; error: "empty" | "too_large" | "bad_image" };

// The server never trusts the client's numbers: type and size come from the
// bytes, and the long side must respect the limit the browser resizes to.
export const chatCheckPhoto = (bytes: Uint8Array): ChatPhotoCheck => {
  if (bytes.length === 0) {
    return { ok: false, error: "empty" };
  }
  if (bytes.length > CHAT_PHOTO_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }
  const mime = chatSniffPhotoMime(bytes);
  const size = mime ? chatReadImageSize(bytes, mime) : null;

  if (
    !mime ||
    !size ||
    size.width < 1 ||
    size.height < 1 ||
    Math.max(size.width, size.height) > CHAT_PHOTO_MAX_SIDE
  ) {
    return { ok: false, error: "bad_image" };
  }
  return { ok: true, mime, ...size };
};

export type StickerImageCheck =
  | { ok: true; mime: StickerCustomMime }
  | { ok: false; error: "empty" | "too_large" | "bad_image" };

export const stickerCheckImage = (bytes: Uint8Array): StickerImageCheck => {
  if (bytes.length === 0) {
    return { ok: false, error: "empty" };
  }
  if (bytes.length > STICKER_CUSTOM_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }
  const mime = chatSniffPhotoMime(bytes);

  return mime === "image/png" || mime === "image/webp"
    ? { ok: true, mime }
    : { ok: false, error: "bad_image" };
};
