import { type NextRequest, NextResponse } from "next/server";

import {
  actorOf,
  askApi,
  askUpload,
  isSameOrigin,
  routeData,
  routeError,
} from "@/features/chat/services/chat-api";
import {
  CUSTOM_STICKER_ERRORS,
  CUSTOM_STICKER_MAX_BYTES,
} from "@/features/chat/utils/custom-sticker-rules";
import { logServerError } from "@/services/logger";

const NO_STORE = { "Cache-Control": "no-store" };

// GET: ids and image URLs of my stickers, newest first. `?as=admin` uses the
// PT session, otherwise the trainee's (a browser may hold both). The API
// answers 403 for a trainee whose chat is locked.
export const GET = async (request: NextRequest) =>
  routeData(
    await askApi(actorOf(request), (api) =>
      api.GET("/v1/chat/stickers/custom"),
    ),
  );

// POST: the raw image bytes as the request body (the browser has already
// resized and re-encoded it). The API reads the type from the bytes.
export const POST = async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > CUSTOM_STICKER_MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: CUSTOM_STICKER_ERRORS.TOO_LARGE },
      { status: 413, headers: NO_STORE },
    );
  }
  try {
    const asked = await askUpload(
      actorOf(request),
      "/v1/chat/stickers/custom",
      request,
    );

    return asked.ok ? routeData(asked, 201) : routeError(asked.error);
  } catch (error) {
    logServerError("createCustomSticker", error);
    return NextResponse.json(
      { error: "failed", message: CUSTOM_STICKER_ERRORS.GENERIC },
      { status: 500, headers: NO_STORE },
    );
  }
};
