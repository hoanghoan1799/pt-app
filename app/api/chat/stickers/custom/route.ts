import type { NextRequest } from "next/server";

import {
  isSameOrigin,
  resolveStickerOwner,
  stickerReply as reply,
} from "@/features/chat/services/custom-sticker-api";
import {
  createOwnSticker,
  listOwnStickers,
} from "@/features/chat/services/custom-stickers";
import {
  checkStickerImage,
  CUSTOM_STICKER_ERRORS,
  CUSTOM_STICKER_MAX_BYTES,
  customStickerUrl,
} from "@/features/chat/utils/custom-sticker-rules";
import { logServerError } from "@/services/logger";

const toView = (id: number) => ({ id, url: customStickerUrl(id) });

// GET: ids and image URLs of my stickers, newest first.
export const GET = async (request: NextRequest) => {
  const owner = await resolveStickerOwner(request);

  if (!owner) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (owner === "locked") {
    return reply({ error: "chat_locked" }, 403);
  }
  return reply({ stickers: (await listOwnStickers(owner)).map(toView) }, 200);
};

const tooLarge = () =>
  reply({ error: "too_large", message: CUSTOM_STICKER_ERRORS.TOO_LARGE }, 413);

// POST: the raw image bytes as the request body (the browser has already
// resized and re-encoded it). The type is read from the bytes, not trusted.
export const POST = async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return reply({ error: "forbidden" }, 403);
  }
  const owner = await resolveStickerOwner(request);

  if (!owner) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (owner === "locked") {
    return reply({ error: "chat_locked" }, 403);
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > CUSTOM_STICKER_MAX_BYTES) {
    return tooLarge();
  }
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const check = checkStickerImage(bytes);

    if (!check.ok) {
      return check.error === "too_large"
        ? tooLarge()
        : reply(
            { error: "bad_image", message: CUSTOM_STICKER_ERRORS.BAD_IMAGE },
            400,
          );
    }
    const result = await createOwnSticker(owner, { mime: check.mime, bytes });

    if (result.status === "limit") {
      return reply(
        { error: "limit", message: CUSTOM_STICKER_ERRORS.LIMIT },
        409,
      );
    }
    return reply({ sticker: toView(result.id) }, 201);
  } catch (error) {
    logServerError("createCustomSticker", error);
    return reply(
      { error: "failed", message: CUSTOM_STICKER_ERRORS.GENERIC },
      500,
    );
  }
};
