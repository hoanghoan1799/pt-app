import { type NextRequest, NextResponse } from "next/server";

import {
  askUpload,
  isSameOrigin,
  routeData,
  routeError,
} from "@/features/chat/services/chat-api";
import {
  PHOTO_ERRORS,
  PHOTO_MAX_BYTES,
} from "@/features/chat/utils/photo-rules";
import { logServerError } from "@/services/logger";

const NO_STORE = { "Cache-Control": "no-store" };

// POST: the raw image bytes (the browser has already resized and re-encoded
// them). The API reads type and size from the bytes; the photo stays pending
// until a message carries it. A trainee uploads into their own conversation; a
// PT names the trainee (`?as=admin&userId=`).
export const POST = async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }
  const params = request.nextUrl.searchParams;
  const isAdmin = params.get("as") === "admin";
  const userId = Number(params.get("userId"));

  if (isAdmin && !(Number.isSafeInteger(userId) && userId > 0)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: PHOTO_ERRORS.TOO_LARGE },
      { status: 413, headers: NO_STORE },
    );
  }
  try {
    const asked = await askUpload(
      isAdmin ? "admin" : "user",
      isAdmin ? `/v1/chat/trainees/${userId}/photos` : "/v1/chat/photos",
      request,
    );

    return asked.ok ? routeData(asked, 201) : routeError(asked.error);
  } catch (error) {
    logServerError("uploadChatPhoto", error);
    return NextResponse.json(
      { error: "failed", message: PHOTO_ERRORS.GENERIC },
      { status: 500, headers: NO_STORE },
    );
  }
};
