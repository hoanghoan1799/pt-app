import { z } from "zod";

// Personal stickers (KAN-158). Pure rules shared by the routes, the send
// validation and the browser; nothing here touches the database.

export const CUSTOM_STICKER_MAX_BYTES = 150 * 1024;
export const CUSTOM_STICKER_MAX_PER_OWNER = 100;
export const CUSTOM_STICKER_MAX_SIDE = 512;
export const STICKER_ALT_CUSTOM = "Sticker của tôi";

export const CUSTOM_STICKER_ERRORS = {
  UNAUTHORIZED: "Bạn cần đăng nhập lại.",
  TOO_LARGE: "Ảnh sau khi xử lý vẫn quá lớn. Hãy chọn ảnh khác.",
  BAD_IMAGE: "Chỉ nhận ảnh WebP hoặc PNG đã xử lý. Hãy chọn lại ảnh.",
  LIMIT: `Bạn đã có tối đa ${CUSTOM_STICKER_MAX_PER_OWNER} sticker. Hãy xoá bớt rồi thêm ảnh mới.`,
  NOT_FOUND: "Không tìm thấy sticker.",
  DECODE_FAILED:
    "Không đọc được ảnh này (ví dụ HEIC). Hãy chọn ảnh JPEG hoặc PNG.",
  GENERIC: "Không thêm được sticker. Thử lại nhé.",
} as const;

export type CustomStickerMime = "image/webp" | "image/png";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const hasAscii = (bytes: Uint8Array, start: number, text: string) =>
  Array.from(text).every(
    (char, index) => bytes[start + index] === char.charCodeAt(0),
  );

// The type comes from the bytes, never from the client's Content-Type.
export const sniffStickerMime = (
  bytes: Uint8Array,
): CustomStickerMime | null => {
  if (
    bytes.length > PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
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

export type StickerImageCheck =
  | { ok: true; mime: CustomStickerMime }
  | { ok: false; error: "empty" | "too_large" | "bad_image" };

export const checkStickerImage = (bytes: Uint8Array): StickerImageCheck => {
  if (bytes.length === 0) {
    return { ok: false, error: "empty" };
  }
  if (bytes.length > CUSTOM_STICKER_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }
  const mime = sniffStickerMime(bytes);

  return mime ? { ok: true, mime } : { ok: false, error: "bad_image" };
};

export const customStickerUrl = (id: number) =>
  `/api/chat/stickers/custom/${id}`;

export const customStickerRef = (id: number) => `custom:${id}`;

const CUSTOM_REF = /^custom:([1-9]\d{0,14})$/;

export const parseCustomRef = (ref: string) => {
  const match = CUSTOM_REF.exec(ref);

  return match ? Number(match[1]) : null;
};

// A path segment: digits only, so "1e3", "0x10" and " 5" are not ids.
export const parseCustomStickerId = (value: string) =>
  /^[1-9]\d{0,14}$/.test(value) ? Number(value) : null;

export const customStickerIdSchema = z.number().int().positive();

// Longest side <= max, aspect ratio kept, never scaled up.
export const fitWithin = (
  width: number,
  height: number,
  max = CUSTOM_STICKER_MAX_SIDE,
) => {
  const scale = Math.min(1, max / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
