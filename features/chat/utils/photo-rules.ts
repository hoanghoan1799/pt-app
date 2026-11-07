import { z } from "zod";

// Photos in chat (KAN-160). Pure rules shared by the routes, the send action
// and the browser; nothing here touches the database.

export const PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;
// What the browser aims for; above it the quality is lowered step by step.
export const PHOTO_TARGET_BYTES = 400 * 1024;
export const PHOTO_MAX_SIDE = 1600;
// The bubble never shows the photo wider than this (CSS pixels).
export const PHOTO_BUBBLE_MAX_WIDTH = 240;
// A pending photo (uploaded, never sent) is dropped after this long.
export const PHOTO_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export const PHOTO_PREVIEW = "📷 Ảnh";
export const PHOTO_ALT = "Ảnh trong tin nhắn";
export const PHOTO_QUOTE_TEXT = "Ảnh";

export const PHOTO_ERRORS = {
  TOO_LARGE: "Ảnh quá lớn. Hãy chọn ảnh khác.",
  BAD_IMAGE: "Chỉ gửi được ảnh JPEG, PNG hoặc WebP. Hãy chọn lại ảnh.",
  DECODE_FAILED:
    "Không đọc được ảnh này (ví dụ HEIC). Hãy chọn ảnh JPEG hoặc PNG.",
  NOT_FOUND: "Không tìm thấy ảnh. Hãy chọn lại ảnh.",
  GENERIC: "Không gửi được ảnh. Thử lại nhé.",
} as const;

export type PhotoMime = "image/webp" | "image/jpeg" | "image/png";

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

// The type comes from the bytes, never from the client's Content-Type.
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

export interface ImageSize {
  width: number;
  height: number;
}

const pngSize = (bytes: Uint8Array): ImageSize | null =>
  bytes.length >= 24 && hasAscii(bytes, 12, "IHDR")
    ? { width: u32be(bytes, 16), height: u32be(bytes, 20) }
    : null;

// Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) share
// the range but are not frames.
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
    // Standalone markers have no length.
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

// Reads the pixel size from the image header; null when it cannot be read.
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

// The server never trusts the client's numbers: type and size come from the
// bytes, and the long side must respect the limit the browser resizes to.
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
    Math.max(size.width, size.height) > PHOTO_MAX_SIDE
  ) {
    return { ok: false, error: "bad_image" };
  }
  return { ok: true, mime, ...size };
};

export const chatPhotoUrl = (id: number) => `/api/chat/photos/${id}`;

// A path segment: digits only, so "1e3", "0x10" and " 5" are not ids.
export const parsePhotoId = (value: string) =>
  /^[1-9]\d{0,14}$/.test(value) ? Number(value) : null;

export const photoIdSchema = z.number().int().positive();

export interface ChatPhoto {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export const toChatPhoto = (
  photoId: number | null,
  size: ImageSize | undefined,
): ChatPhoto | null =>
  photoId === null || !size
    ? null
    : {
        url: chatPhotoUrl(photoId),
        width: size.width,
        height: size.height,
        alt: PHOTO_ALT,
      };

// The size the bubble reserves before the image loads: width capped at
// `maxWidth`, aspect ratio kept, never scaled up.
export const bubbleBox = (
  width: number,
  height: number,
  maxWidth = PHOTO_BUBBLE_MAX_WIDTH,
) => {
  const scale = Math.min(1, maxWidth / Math.max(1, width));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

// Inbox line: "📷 Ảnh", or "📷 " + the caption when the photo has text.
export const photoPreview = (caption: string) =>
  caption.trim() === "" ? PHOTO_PREVIEW : `📷 ${caption}`;
