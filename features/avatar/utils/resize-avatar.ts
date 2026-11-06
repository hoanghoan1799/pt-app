import {
  AVATAR_MAX_DATA_URL_LENGTH,
  AVATAR_QUALITY,
  AVATAR_SIZE_PX,
} from "@/features/avatar/utils/avatar-rules";

// The centred square of a width x height image.
export const squareCrop = (width: number, height: number) => {
  const side = Math.min(width, height);

  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
  };
};

const QUALITY_STEPS = [AVATAR_QUALITY, 0.6, 0.4];

// Browser only: crops the picked image to a square, scales it to
// AVATAR_SIZE_PX and encodes WebP (JPEG where WebP is unsupported). Throws
// when the file is not an image the browser can decode.
export const resizeToAvatarDataUrl = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");

    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is not available");
    }
    context.drawImage(
      bitmap,
      sx,
      sy,
      side,
      side,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX,
    );
    let dataUrl = "";

    for (const quality of QUALITY_STEPS) {
      dataUrl = canvas.toDataURL("image/webp", quality);
      if (!dataUrl.startsWith("data:image/webp")) {
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length <= AVATAR_MAX_DATA_URL_LENGTH) {
        break;
      }
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
};
