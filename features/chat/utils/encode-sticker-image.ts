import {
  CUSTOM_STICKER_ERRORS,
  CUSTOM_STICKER_MAX_BYTES,
  CUSTOM_STICKER_MAX_SIDE,
  fitWithin,
} from "@/features/chat/utils/custom-sticker-rules";

// Browser only (KAN-158). Turns a picked photo into the small image we store:
// decoded, fitted into 512x512 with the aspect ratio kept and a transparent
// background, then re-encoded as WebP (PNG where the browser cannot write
// WebP). Re-encoding drops EXIF, so GPS and camera data never leave the phone.
export class StickerImageError extends Error {}

const WEBP_QUALITIES = [0.9, 0.78, 0.65, 0.5, 0.35];
const SHRINK_STEP = 0.75;
const MAX_ROUNDS = 5;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const decode = async (file: Blob) => {
  try {
    // Applies the EXIF orientation, so a portrait photo stays upright.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new StickerImageError(CUSTOM_STICKER_ERRORS.DECODE_FAILED);
  }
};

const encodeCanvas = async (canvas: HTMLCanvasElement) => {
  const first = await toBlob(canvas, "image/webp", WEBP_QUALITIES[0]);

  // A browser without a WebP encoder silently answers with a PNG.
  if (first?.type === "image/webp") {
    if (first.size <= CUSTOM_STICKER_MAX_BYTES) {
      return first;
    }
    for (const quality of WEBP_QUALITIES.slice(1)) {
      const blob = await toBlob(canvas, "image/webp", quality);

      if (blob && blob.size <= CUSTOM_STICKER_MAX_BYTES) {
        return blob;
      }
    }
    return null;
  }
  const png = await toBlob(canvas, "image/png");

  return png && png.size <= CUSTOM_STICKER_MAX_BYTES ? png : null;
};

export const encodeStickerImage = async (file: Blob): Promise<Blob> => {
  const bitmap = await decode(file);

  try {
    let { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      CUSTOM_STICKER_MAX_SIDE,
    );

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new StickerImageError(CUSTOM_STICKER_ERRORS.DECODE_FAILED);
      }
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await encodeCanvas(canvas);

      if (blob) {
        return blob;
      }
      // Still too big (a noisy photo as PNG): try fewer pixels.
      width = Math.max(1, Math.round(width * SHRINK_STEP));
      height = Math.max(1, Math.round(height * SHRINK_STEP));
    }
    throw new StickerImageError(CUSTOM_STICKER_ERRORS.TOO_LARGE);
  } finally {
    bitmap.close();
  }
};
