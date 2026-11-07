import { fitWithin } from "@/features/chat/utils/custom-sticker-rules";
import {
  PHOTO_ERRORS,
  PHOTO_MAX_ROUNDS,
  PHOTO_MAX_SIDE,
  PHOTO_QUALITIES,
  PHOTO_TARGET_BYTES,
  pickEncodedIndex,
  shrinkPhotoSize,
} from "@/features/chat/utils/photo-rules";

// Browser only (KAN-160). Turns a picked photo into the image we upload:
// decoded with its EXIF orientation applied, fitted into 1600 px on the long
// side and re-encoded as WebP (JPEG where the browser cannot write WebP).
// Re-encoding drops EXIF, so GPS and camera data never leave the phone.
export class PhotoImageError extends Error {}

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const decode = async (file: Blob) => {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoImageError(PHOTO_ERRORS.DECODE_FAILED);
  }
};

const drawn = (bitmap: ImageBitmap, width: number, height: number) => {
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new PhotoImageError(PHOTO_ERRORS.DECODE_FAILED);
  }
  // JPEG has no alpha: a transparent PNG would turn black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
};

// The first quality tells which type this browser can write.
const encodeCanvas = async (canvas: HTMLCanvasElement) => {
  const first = await toBlob(canvas, "image/webp", PHOTO_QUALITIES[0]);
  const type = first?.type === "image/webp" ? "image/webp" : "image/jpeg";
  const blobs: Blob[] = [];

  for (const [index, quality] of PHOTO_QUALITIES.entries()) {
    const blob =
      index === 0 && type === "image/webp"
        ? first
        : await toBlob(canvas, type, quality);

    if (!blob) {
      break;
    }
    blobs.push(blob);
    if (blob.size <= PHOTO_TARGET_BYTES) {
      break;
    }
  }
  const index = pickEncodedIndex(blobs.map((blob) => blob.size));

  return index === null ? null : blobs[index];
};

export const encodePhoto = async (file: Blob): Promise<PreparedPhoto> => {
  const bitmap = await decode(file);

  try {
    let { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      PHOTO_MAX_SIDE,
    );

    for (let round = 0; round < PHOTO_MAX_ROUNDS; round += 1) {
      const blob = await encodeCanvas(drawn(bitmap, width, height));

      if (blob) {
        return { blob, width, height };
      }
      ({ width, height } = shrinkPhotoSize(width, height));
    }
    throw new PhotoImageError(PHOTO_ERRORS.TOO_LARGE);
  } finally {
    bitmap.close();
  }
};
